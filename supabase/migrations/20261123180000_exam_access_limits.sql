-- Paid exams: at most 3 submitted attempts within 14 days of payment.
-- Purchases made before applies_from keep unlimited access (grandfathered).
-- To change the rules later, re-run create or replace on exam_access_rules() with new numbers.

alter table public.purchases drop constraint if exists purchases_status_check;
alter table public.purchases add constraint purchases_status_check
  check (status = any (array['pending'::text, 'paid'::text, 'fake_paid'::text, 'failed'::text, 'duplicate_paid'::text, 'expired'::text]));

create or replace function public.exam_access_rules()
returns table(max_attempts int, access_days int, applies_from timestamptz)
language sql immutable
as $$ select 3, 14, '2026-11-23 16:15:00+00'::timestamptz $$;

-- Access state for one student and exam (latest paid purchase). Internal: not callable by clients.
create or replace function public.exam_access_for(p_user uuid, p_test uuid)
returns table(purchase_id uuid, paid_at timestamptz, limited boolean, attempts_used int,
              max_attempts int, expires_at timestamptz, active boolean)
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  p record;
  used int;
begin
  select * into r from public.exam_access_rules();
  select id, purchases.paid_at into p from public.purchases
   where user_id = p_user and test_id = p_test and status in ('paid', 'fake_paid')
   order by purchases.paid_at desc nulls last limit 1;
  if not found then return; end if;

  select count(*) into used from public.attempts a
   where a.user_id = p_user and a.test_id = p_test and a.submitted_at is not null
     and a.submitted_at >= p.paid_at;

  purchase_id := p.id;
  paid_at := p.paid_at;
  limited := p.paid_at >= r.applies_from;
  attempts_used := used;
  max_attempts := r.max_attempts;
  expires_at := p.paid_at + make_interval(days => r.access_days);
  active := (not limited) or (now() < expires_at and used < r.max_attempts);
  return next;
end;
$$;
revoke all on function public.exam_access_for(uuid, uuid) from public, anon, authenticated;

-- What the signed-in student can see about their own paid exams.
create or replace function public.my_exam_access()
returns table(test_id uuid, limited boolean, attempts_used int, max_attempts int, expires_at timestamptz, active boolean)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  return query
  select t.id, x.limited, x.attempts_used, x.max_attempts, x.expires_at, x.active
    from public.tests t
    cross join lateral public.exam_access_for(auth.uid(), t.id) x
   where exists (select 1 from public.purchases pu where pu.user_id = auth.uid() and pu.test_id = t.id
                  and pu.status in ('paid', 'fake_paid'));
end;
$$;
revoke all on function public.my_exam_access() from public, anon;
grant execute on function public.my_exam_access() to authenticated;

create or replace function public.start_purchased_exam(p_test_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_test record;
  v_has_access boolean;
  v_banned boolean;
  v_acc record;
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
    select * into v_acc from public.exam_access_for(auth.uid(), p_test_id);
    if v_acc.purchase_id is null then
      return jsonb_build_object('error', 'You need to purchase this exam before starting it.');
    end if;
    if not v_acc.active then
      if v_acc.attempts_used >= v_acc.max_attempts then
        return jsonb_build_object('error', format('You have used all %s attempts for this exam. Buy it again to get more.', v_acc.max_attempts));
      end if;
      return jsonb_build_object('error', 'Your access to this exam has ended. Buy it again to continue.');
    end if;
    v_has_access := true;
  end if;

  return jsonb_build_object('test', v_test.manifest);
end;
$function$;
