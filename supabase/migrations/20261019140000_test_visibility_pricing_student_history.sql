-- Admin controls which tests students can see and what they cost; tutors can
-- see which tests each student account has taken.
-- Touches only objects in the public schema; each object is named explicitly.

-- 1. New tests start hidden from students until an admin publishes them.
--    (Existing rows keep their current visibility and price.)
alter table public.tests alter column is_published set default false;

-- 2. Only admins may change visibility or price. Tutors can still upload tests
--    (they arrive hidden and free) and still see every test; the SQL editor /
--    service role (no signed-in user) is unaffected.
create or replace function public.tests_guard_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.is_published := false;
      new.price_kwacha := 0;
    elsif new.is_published is distinct from old.is_published
       or new.price_kwacha is distinct from old.price_kwacha then
      raise exception 'Only an admin can change a test''s visibility or price';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tests_guard_admin_fields on public.tests;
create trigger tests_guard_admin_fields
  before insert or update on public.tests
  for each row execute function public.tests_guard_admin_fields();

-- 3. Admin: list every test with usage numbers.
create or replace function public.admin_list_tests()
returns table(id uuid, title text, profession text, price_kwacha integer, is_published boolean,
              created_at timestamptz, attempt_count bigint, purchase_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select t.id, t.title, t.profession, t.price_kwacha, t.is_published, t.created_at,
         (select count(*) from public.attempts a where a.test_id = t.id),
         (select count(*) from public.purchases pu
           where pu.test_id = t.id and pu.status in ('paid', 'fake_paid'))
    from public.tests t
   order by t.created_at desc;
end;
$$;
revoke all on function public.admin_list_tests() from public, anon;
grant execute on function public.admin_list_tests() to authenticated;

-- 4. Admin: change visibility and/or price of one test.
create or replace function public.admin_update_test(p_test_id uuid, p_is_published boolean, p_price_kwacha integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'Not authorized.');
  end if;

  if p_price_kwacha is null or p_price_kwacha < 0 then
    return jsonb_build_object('error', 'Price must be 0 or more.');
  end if;

  update public.tests
     set is_published = p_is_published,
         price_kwacha = p_price_kwacha
   where id = p_test_id;

  if not found then
    return jsonb_build_object('error', 'Test not found.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.admin_update_test(uuid, boolean, integer) from public, anon;
grant execute on function public.admin_update_test(uuid, boolean, integer) to authenticated;

-- 5. Tutors/admins: student accounts with the tests each has taken.
create or replace function public.tutor_list_students()
returns table(id uuid, email text, full_name text, is_approved boolean, created_at timestamptz, attempts jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_tutor_or_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select p.id, u.email::text, p.full_name, p.is_approved, p.created_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'test_id', a.test_id,
                    'test_title', t.title,
                    'status', a.status,
                    'started_at', a.started_at,
                    'submitted_at', a.submitted_at
                  ) order by coalesce(a.submitted_at, a.started_at) desc)
             from public.attempts a
             join public.tests t on t.id = a.test_id
            where a.user_id = p.id
         ), '[]'::jsonb)
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.role = 'student'
   order by p.full_name nulls last, u.email;
end;
$$;
revoke all on function public.tutor_list_students() from public, anon;
grant execute on function public.tutor_list_students() to authenticated;
