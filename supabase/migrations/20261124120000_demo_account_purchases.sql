-- Demo accounts: purchases are granted instantly (no payment), have no attempt/time limits,
-- and are left out of the admin purchase list, revenue and per-exam purchase counts.
alter table public.profiles add column if not exists is_demo boolean not null default false;

update public.profiles set is_demo = true where id = '73cb1272-4d4c-4bb9-8571-3162f0ec4fdb';

create or replace function public.admin_list_purchases()
returns table(id uuid, user_email text, user_name text, test_title text, amount_kwacha integer, currency text, status text, provider text, created_at timestamptz, paid_at timestamptz)
language plpgsql security definer set search_path to 'public'
as $function$
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
  where coalesce(pr.is_demo, false) = false
  order by pu.created_at desc;
end;
$function$;

create or replace function public.admin_list_tests()
returns table(id uuid, title text, profession text, price_kwacha integer, is_published boolean, created_at timestamptz, attempt_count bigint, purchase_count bigint)
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select t.id, t.title, t.profession, t.price_kwacha, t.is_published, t.created_at,
         (select count(*) from public.attempts a where a.test_id = t.id),
         (select count(*) from public.purchases pu
            left join public.profiles pr on pr.id = pu.user_id
           where pu.test_id = t.id and pu.status in ('paid', 'fake_paid')
             and coalesce(pr.is_demo, false) = false)
    from public.tests t
   order by t.created_at desc;
end;
$function$;

create or replace function public.exam_access_for(p_user uuid, p_test uuid)
returns table(purchase_id uuid, paid_at timestamptz, limited boolean, attempts_used int,
              max_attempts int, expires_at timestamptz, active boolean)
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  p record;
  used int;
  demo boolean;
begin
  select * into r from public.exam_access_rules();
  select id, purchases.paid_at into p from public.purchases
   where user_id = p_user and test_id = p_test and status in ('paid', 'fake_paid')
   order by purchases.paid_at desc nulls last limit 1;
  if not found then return; end if;

  select coalesce(pr.is_demo, false) into demo from public.profiles pr where pr.id = p_user;

  select count(*) into used from public.attempts a
   where a.user_id = p_user and a.test_id = p_test and a.submitted_at is not null
     and a.submitted_at >= p.paid_at;

  purchase_id := p.id;
  paid_at := p.paid_at;
  limited := (p.paid_at >= r.applies_from) and not coalesce(demo, false);
  attempts_used := used;
  max_attempts := r.max_attempts;
  expires_at := p.paid_at + make_interval(days => r.access_days);
  active := (not limited) or (now() < expires_at and used < r.max_attempts);
  return next;
end;
$$;
revoke all on function public.exam_access_for(uuid, uuid) from public, anon, authenticated;

-- One-off (already run): start afresh by removing all purchase history.
-- delete from public.purchases;
