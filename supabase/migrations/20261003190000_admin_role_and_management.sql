-- Adds a third role, 'admin', above tutor: can see financial data and
-- manage user accounts (role changes, bans), on top of everything a
-- tutor can already do. Tutors do NOT get this access; it's a separate,
-- narrower tier.
--
-- Run this in the Supabase SQL Editor after the earlier migrations.
--
-- IMPORTANT -- after running this, promote yourself to admin (nothing
-- has the 'admin' role yet, including your existing tutor account):
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');

-- ---------------------------------------------------------------------
-- 1. Widen the role check to allow 'admin', and add a ban flag.
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'tutor', 'admin'));

alter table public.profiles
  add column if not exists is_banned boolean not null default false;

-- ---------------------------------------------------------------------
-- 2. Helper: is the current caller an admin? Used by every RPC below.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- A tutor-or-admin check, for the pages tutors already use -- admins get
-- the same access as tutors there, not a separate/lesser view.
create or replace function public.is_tutor_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('tutor', 'admin')
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Block banned accounts from starting or buying exams. (Does not
--    touch their ability to log in -- that needs the Supabase Admin
--    API / a service-role key, which this project's frontend doesn't
--    have. This covers the practical case: stop a problem account from
--    taking or paying for any more exams.)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. Admin RPCs. Each checks is_admin() itself (rather than relying on
--    grants alone) so the error is a clean, readable message instead of
--    a generic permission-denied.
-- ---------------------------------------------------------------------

-- Full account list, including email (profiles alone doesn't have it --
-- email lives in auth.users, which regular clients can't query).
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  is_banned boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select u.id, u.email::text, p.full_name, p.role, p.is_banned, p.created_at
  from auth.users u
  join public.profiles p on p.id = u.id
  order by p.created_at desc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;

-- One user's full picture: account info + purchase history + exam
-- attempts/scores (the latter will be empty for now for self-service
-- students -- attempts.user_id isn't populated by the exam submission
-- path yet; see the note left for that separately).
create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user jsonb;
  v_purchases jsonb;
  v_attempts jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'Not authorized.');
  end if;

  select jsonb_build_object(
    'id', u.id, 'email', u.email, 'full_name', p.full_name,
    'role', p.role, 'is_banned', p.is_banned, 'created_at', p.created_at
  ) into v_user
  from auth.users u
  join public.profiles p on p.id = u.id
  where u.id = p_user_id;

  if v_user is null then
    return jsonb_build_object('error', 'User not found.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'test_title', t.title,
    'amount_kwacha', pu.amount_kwacha,
    'status', pu.status,
    'created_at', pu.created_at,
    'paid_at', pu.paid_at
  ) order by pu.created_at desc), '[]'::jsonb) into v_purchases
  from public.purchases pu
  join public.tests t on t.id = pu.test_id
  where pu.user_id = p_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'test_title', t.title,
    'submitted_at', a.submitted_at,
    'subtest_type', r.subtest_type,
    'raw_score', r.raw_score,
    'scorable_count', r.scorable_count
  ) order by a.submitted_at desc), '[]'::jsonb) into v_attempts
  from public.attempts a
  join public.tests t on t.id = a.test_id
  left join public.results r on r.attempt_id = a.id
  where a.user_id = p_user_id;

  return jsonb_build_object('user', v_user, 'purchases', v_purchases, 'attempts', v_attempts);
end;
$$;

grant execute on function public.admin_user_detail(uuid) to authenticated;

-- Promote/demote a user. An admin can't change their own role (stops an
-- accidental self-lockout from this page).
create or replace function public.admin_set_user_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'Not authorized.');
  end if;

  if p_role not in ('student', 'tutor', 'admin') then
    return jsonb_build_object('error', 'Invalid role.');
  end if;

  if p_user_id = auth.uid() then
    return jsonb_build_object('error', 'You cannot change your own role.');
  end if;

  update public.profiles set role = p_role where id = p_user_id;

  if not found then
    return jsonb_build_object('error', 'User not found.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

-- Ban/unban. See the comment on start_purchased_exam/create_fake_purchase
-- above for exactly what this does and doesn't block.
create or replace function public.admin_set_user_banned(p_user_id uuid, p_banned boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'Not authorized.');
  end if;

  if p_user_id = auth.uid() then
    return jsonb_build_object('error', 'You cannot ban your own account.');
  end if;

  update public.profiles set is_banned = p_banned where id = p_user_id;

  if not found then
    return jsonb_build_object('error', 'User not found.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.admin_set_user_banned(uuid, boolean) to authenticated;

-- Every purchase, with the student's name/email and the exam title
-- joined in, for the Overview/Transactions tabs. Revenue totals,
-- trend-over-time, and per-exam breakdown are all computed client-side
-- from this one result set.
create or replace function public.admin_list_purchases()
returns table (
  id uuid,
  user_email text,
  user_name text,
  test_title text,
  amount_kwacha integer,
  currency text,
  status text,
  provider text,
  created_at timestamptz,
  paid_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select pu.id, u.email::text, pr.full_name, t.title, pu.amount_kwacha, pu.currency,
         pu.status, pu.provider, pu.created_at, pu.paid_at
  from public.purchases pu
  join auth.users u on u.id = pu.user_id
  left join public.profiles pr on pr.id = pu.user_id
  join public.tests t on t.id = pu.test_id
  order by pu.created_at desc;
end;
$$;

grant execute on function public.admin_list_purchases() to authenticated;
