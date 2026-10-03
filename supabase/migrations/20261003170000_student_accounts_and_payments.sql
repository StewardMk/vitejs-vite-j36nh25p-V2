-- Self-service student accounts + pay-per-exam access.
--
-- This migration is additive and safe to run on the live database:
-- it only adds new tables/columns/views/functions, and backfills a
-- `profiles` row for every existing auth user as role='tutor' (correct,
-- since before this migration the only accounts that existed were the
-- ones you created for yourself/tutors -- there was no public sign-up).
--
-- IMPORTANT -- run this before shipping the sign-up page. Without the
-- `profiles` + role check, any student who signs up would be able to log
-- into /tutor and /admin too, because RequireTutorLogin previously only
-- checked "is there a session", not "is this session a tutor".
--
-- Run this in the Supabase SQL Editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. profiles: one row per auth user, carrying their display name and
--    role. Row is created automatically on sign-up via the trigger
--    below.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'student' check (role in ('student', 'tutor')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Backfill: every auth user that existed before this migration was a
-- tutor (you) -- there was no other way to get an account. New sign-ups
-- from the public site default to 'student' via the trigger below.
insert into public.profiles (id, full_name, role)
select u.id, u.email, 'tutor'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- Auto-create a 'student' profile row whenever someone signs up through
-- the public sign-up form. full_name comes from the signUp() call's
-- options.data.full_name, if provided.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data ->> 'full_name', 'student')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. tests: add catalog fields. price_kwacha = 0 means free.
--    Existing rows default to is_published = true, price_kwacha = 0 so
--    nothing you've already uploaded suddenly disappears or starts
--    demanding payment -- set real prices per test afterwards.
-- ---------------------------------------------------------------------
alter table public.tests
  add column if not exists description text,
  add column if not exists price_kwacha integer not null default 0,
  add column if not exists is_published boolean not null default true;

-- Public catalog view: everything a browsing (possibly logged-out)
-- visitor is allowed to see about a test -- NOT the manifest, which
-- contains the full exam content and should only be handed over once
-- access is confirmed (see start_purchased_exam below).
create or replace view public.exam_catalog as
select id, title, profession, description, price_kwacha, is_published, created_at
from public.tests
where is_published = true;

grant select on public.exam_catalog to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. purchases: one row per student's attempt to buy access to a test.
--    provider='fake' is the temporary stand-in wired up now; switching
--    to Flutterwave later only changes how a row gets to status='paid'
--    (a webhook will do it instead of the client-side RPC below).
-- ---------------------------------------------------------------------
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  test_id uuid not null references public.tests (id) on delete cascade,
  amount_kwacha integer not null,
  currency text not null default 'ZMW',
  status text not null default 'pending' check (status in ('pending', 'paid', 'fake_paid', 'failed')),
  provider text not null default 'fake' check (provider in ('fake', 'flutterwave')),
  provider_reference text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists purchases_user_id_idx on public.purchases (user_id);
create index if not exists purchases_test_id_idx on public.purchases (test_id);

-- A student can have more than one purchase row per test over time (a
-- failed attempt, then a successful one), but only ever one row that
-- counts as "paid" -- this partial unique index stops them (or a
-- double-click) from creating two paid rows for the same test.
create unique index if not exists purchases_one_paid_per_test
  on public.purchases (user_id, test_id)
  where status in ('paid', 'fake_paid');

alter table public.purchases enable row level security;

drop policy if exists "purchases_select_own" on public.purchases;
create policy "purchases_select_own" on public.purchases
  for select using (auth.uid() = user_id);

-- Inserts/updates to purchases all go through the security-definer
-- RPCs below, not direct table access, so there is no insert/update
-- policy for regular users here.

-- ---------------------------------------------------------------------
-- 4. attempts: link an attempt back to the student account that made
--    it, when it was started through the self-service flow. Nullable
--    and left untouched for the existing tutor-access-code flow, which
--    has no login session to attach.
-- ---------------------------------------------------------------------
alter table public.attempts
  add column if not exists user_id uuid references auth.users (id);

create index if not exists attempts_user_id_idx on public.attempts (user_id);

-- ---------------------------------------------------------------------
-- 5. RPCs
-- ---------------------------------------------------------------------

-- Returns the full manifest for a test IF the logged-in caller is
-- allowed to take it: the test is free, or they have a paid/fake_paid
-- purchase row for it. This is the self-service equivalent of
-- redeem_access_code -- same shape of result ({test: {...}} / {error: ...})
-- so the frontend can treat them the same way.
create or replace function public.start_purchased_exam(p_test_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test record;
  v_has_access boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'You must be logged in to start an exam.');
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

grant execute on function public.start_purchased_exam(uuid) to authenticated;

-- TEMPORARY stand-in for real payment. Creates an immediately-"paid"
-- purchase row for the logged-in caller so the rest of the product
-- (access gating, account history) can be built and tested end to end
-- before Flutterwave is wired in. Delete or disable this function once
-- real payments are live -- see the Flutterwave integration plan.
create or replace function public.create_fake_purchase(p_test_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test record;
  v_purchase_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'You must be logged in to buy access.');
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

grant execute on function public.create_fake_purchase(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Lock down direct access to `tests` (which holds the full exam
--    manifest). Without this, anyone can call the Supabase REST API
--    directly (e.g. GET .../rest/v1/tests?select=manifest) and read the
--    entire content of a paid exam for free, with no login and no
--    purchase -- which would defeat the payment gate above entirely.
--
--    After this runs, the ONLY ways to read a test are:
--      - public.exam_catalog (title/price/description only, no manifest)
--      - public.start_purchased_exam(), which checks payment first
--      - a logged-in tutor, via the policy below (same access
--        TutorDashboard/AdminUpload already rely on)
--
--    This should not change anything you see in the Tutor Dashboard or
--    Admin Upload pages -- they run as your logged-in tutor account,
--    which the policy below still grants full access to. Re-check both
--    after running this migration to confirm.
-- ---------------------------------------------------------------------
alter table public.tests enable row level security;

drop policy if exists "tutors_select_tests" on public.tests;
create policy "tutors_select_tests" on public.tests
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'tutor')
  );

drop policy if exists "tutors_insert_tests" on public.tests;
create policy "tutors_insert_tests" on public.tests
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'tutor')
  );

drop policy if exists "tutors_update_tests" on public.tests;
create policy "tutors_update_tests" on public.tests
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'tutor')
  );

drop policy if exists "tutors_delete_tests" on public.tests;
create policy "tutors_delete_tests" on public.tests
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'tutor')
  );

-- Students and anonymous visitors get no policy on `tests` at all, so
-- RLS denies them by default -- they can only reach test data through
-- exam_catalog (view) and start_purchased_exam() (security definer,
-- runs as the function owner and so isn't subject to this RLS).
