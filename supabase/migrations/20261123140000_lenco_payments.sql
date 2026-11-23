-- Real payments through Lenco. Lets purchases be recorded with provider 'lenco',
-- allows a 'duplicate_paid' status (money taken for an exam the student already owned,
-- kept for refunds), and stops one Lenco reference being used twice.

alter table public.purchases drop constraint if exists purchases_provider_check;
alter table public.purchases add constraint purchases_provider_check
  check (provider = any (array['fake'::text, 'flutterwave'::text, 'lenco'::text]));

alter table public.purchases drop constraint if exists purchases_status_check;
alter table public.purchases add constraint purchases_status_check
  check (status = any (array['pending'::text, 'paid'::text, 'fake_paid'::text, 'failed'::text, 'duplicate_paid'::text]));

create unique index if not exists purchases_lenco_reference_uniq
  on public.purchases (provider_reference) where provider = 'lenco';
