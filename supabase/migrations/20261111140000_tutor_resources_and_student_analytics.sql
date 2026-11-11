-- Tutor resource library + per-question stats for the student analytics page.
-- Additive only: one new table in public, one private storage bucket with
-- policies, one new function. Nothing existing is changed.

-- 1. Resource library -------------------------------------------------
create table if not exists public.tutor_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null default 'other'
    check (category in ('tutor_guide','printable_test','answer_key','audio_script','other')),
  exam_label text,
  file_path text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.tutor_resources enable row level security;

drop policy if exists "staff read resources" on public.tutor_resources;
create policy "staff read resources" on public.tutor_resources
  for select to authenticated using (public.is_tutor_or_admin());

drop policy if exists "staff add resources" on public.tutor_resources;
create policy "staff add resources" on public.tutor_resources
  for insert to authenticated
  with check (public.is_tutor_or_admin() and uploaded_by = auth.uid());

drop policy if exists "admin delete resources" on public.tutor_resources;
create policy "admin delete resources" on public.tutor_resources
  for delete to authenticated using (public.is_admin());

-- 2. Private storage bucket ------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('tutor-resources', 'tutor-resources', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "staff read resource files" on storage.objects;
create policy "staff read resource files" on storage.objects
  for select to authenticated
  using (bucket_id = 'tutor-resources' and public.is_tutor_or_admin());

drop policy if exists "staff upload resource files" on storage.objects;
create policy "staff upload resource files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tutor-resources' and public.is_tutor_or_admin());

drop policy if exists "admin delete resource files" on storage.objects;
create policy "admin delete resource files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tutor-resources' and public.is_admin());

-- 3. Per-question stats for the signed-in student ---------------------
-- Marks every Listening/Reading question in the caller's own attempts as
-- right or wrong, using the same rules as save_manifest_attempt. Runs as
-- the definer so students never read the answer keys directly.
create or replace function public.student_question_stats()
returns table (
  attempt_id uuid,
  test_title text,
  submitted_at timestamptz,
  subtest text,
  part text,
  question_type text,
  question_id text,
  is_correct boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  a record;
  stage jsonb;
  q jsonb;
  qs jsonb;
  sec text;
  given text;
  corr text;
begin
  if auth.uid() is null then
    return;
  end if;

  for a in
    select at.id, at.submitted_at, at.answers, t.title, t.manifest
    from public.attempts at
    join public.tests t on t.id = at.test_id
    where at.user_id = auth.uid() and at.submitted_at is not null
    order by at.submitted_at
  loop
    for stage in select * from jsonb_array_elements(coalesce(a.manifest->'exam'->'stages', '[]'::jsonb))
    loop
      sec := lower(coalesce(stage->>'section', ''));
      continue when sec not in ('listening', 'reading');

      qs := coalesce(stage->'questions', '[]'::jsonb)
        || coalesce((
          select jsonb_agg(qq)
          from jsonb_array_elements(coalesce(stage->'extracts', '[]'::jsonb)) e,
               jsonb_array_elements(coalesce(e->'questions', '[]'::jsonb)) qq
        ), '[]'::jsonb);

      for q in select * from jsonb_array_elements(qs)
      loop
        corr := q->>'correct_answer';
        continue when corr is null;
        given := a.answers->>(q->>'id');

        attempt_id := a.id;
        test_title := a.title;
        submitted_at := a.submitted_at;
        subtest := sec;
        part := upper(coalesce(stage->>'part', ''));
        question_type := coalesce(q->>'question_type', '');
        question_id := q->>'id';
        if sec = 'listening' then
          is_correct := given is not null
            and public.oet_numbers_to_digits(given) = public.oet_numbers_to_digits(corr);
        else
          is_correct := given is not null and lower(trim(given)) = lower(trim(corr));
        end if;
        return next;
      end loop;
    end loop;
  end loop;
end;
$$;

revoke all on function public.student_question_stats() from public, anon;
grant execute on function public.student_question_stats() to authenticated;
