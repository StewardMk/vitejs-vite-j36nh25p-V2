-- Require an admin to approve every new account before it can use the site.
-- Touches only objects in the public schema; each object is named explicitly.

-- 1. Approval flag. Existing accounts are grandfathered in as approved.
alter table public.profiles add column if not exists is_approved boolean not null default false;
update public.profiles set is_approved = true where is_approved = false;
-- (new sign-ups get the default, false, from the handle_new_user trigger)

-- 2. Helper: approved students, plus all tutors and admins.
create or replace function public.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and (is_approved or role in ('tutor', 'admin'))
  );
$$;
revoke all on function public.is_approved_user() from public, anon;
grant execute on function public.is_approved_user() to authenticated;

-- 3. Stop users editing their own role / ban / approval flags.
--    Only full_name stays editable by the signed-in user.
revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- 4. The exam list is for approved signed-in users only (not anonymous visitors).
create or replace view public.exam_catalog as
  select id, title, profession, description, price_kwacha, is_published, created_at
    from public.tests
   where is_published = true
     and public.is_approved_user();
revoke all on public.exam_catalog from anon;
grant select on public.exam_catalog to authenticated;

-- 5. Purchases / starting an exam require an approved account.
create or replace function public.start_purchased_exam(p_test_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test record;
  v_has_access boolean;
  v_banned boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'You must be logged in to start an exam.');
  end if;

  select is_banned into v_banned from public.profiles where id = auth.uid();
  if v_banned then
    return jsonb_build_object('error', 'Your account is suspended. Contact support.');
  end if;

  if not public.is_approved_user() then
    return jsonb_build_object('error', 'Your account is awaiting admin approval.');
  end if;

  select id, title, manifest, price_kwacha, is_published
    into v_test
    from public.tests
   where id = p_test_id;

  if not found or not v_test.is_published then
    return jsonb_build_object('error', 'That exam is not available.');
  end if;

  if v_test.price_kwacha = 0 then
    v_has_access := true;
  else
    select exists (
      select 1 from public.purchases
       where user_id = auth.uid()
         and test_id = p_test_id
         and status in ('paid', 'fake_paid')
    ) into v_has_access;
  end if;

  if not v_has_access then
    return jsonb_build_object('error', 'You need to purchase this exam before starting it.');
  end if;

  return jsonb_build_object('test', v_test.manifest);
end;
$$;

create or replace function public.create_fake_purchase(p_test_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test record;
  v_purchase_id uuid;
  v_banned boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'You must be logged in to buy access.');
  end if;

  select is_banned into v_banned from public.profiles where id = auth.uid();
  if v_banned then
    return jsonb_build_object('error', 'Your account is suspended. Contact support.');
  end if;

  if not public.is_approved_user() then
    return jsonb_build_object('error', 'Your account is awaiting admin approval.');
  end if;

  select id, price_kwacha, is_published into v_test
    from public.tests where id = p_test_id;

  if not found or not v_test.is_published then
    return jsonb_build_object('error', 'That exam is not available.');
  end if;

  insert into public.purchases (user_id, test_id, amount_kwacha, currency, status, provider, paid_at)
  values (auth.uid(), p_test_id, v_test.price_kwacha, 'ZMW', 'fake_paid', 'fake', now())
  on conflict (user_id, test_id) where status in ('paid', 'fake_paid')
  do update set paid_at = public.purchases.paid_at
  returning id into v_purchase_id;

  return jsonb_build_object('purchaseId', v_purchase_id);
end;
$$;

-- 6. Admin tooling: list shows approval state; new approve/revoke function.
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table(id uuid, email text, full_name text, role text, is_banned boolean, created_at timestamptz, is_approved boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select u.id, u.email::text, p.full_name, p.role, p.is_banned, p.created_at, p.is_approved
    from auth.users u
    join public.profiles p on p.id = u.id
   order by p.is_approved asc, p.created_at desc;
end;
$$;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

create or replace function public.admin_set_user_approved(p_user_id uuid, p_approved boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'Not authorized.');
  end if;

  update public.profiles set is_approved = p_approved where id = p_user_id;

  if not found then
    return jsonb_build_object('error', 'User not found.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.admin_set_user_approved(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_approved(uuid, boolean) to authenticated;
