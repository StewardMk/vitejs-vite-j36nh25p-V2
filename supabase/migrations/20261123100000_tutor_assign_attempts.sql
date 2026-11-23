-- Lets a tutor/admin attach an already-completed attempt (typically one taken
-- through an access code, so user_id is null) to a student account. The attempt's
-- results then appear in that student's results, trends and score chart.

create or replace function public.tutor_list_unlinked_attempts()
returns table(id uuid, test_title text, student_name text, submitted_at timestamptz, scores jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_tutor_or_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select a.id, t.title, a.student_name, a.submitted_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'subtest', r.subtest_type, 'raw', r.raw_score, 'scorable', r.scorable_count))
             from public.results r where r.attempt_id = a.id
         ), '[]'::jsonb)
    from public.attempts a
    join public.tests t on t.id = a.test_id
   where a.user_id is null and a.submitted_at is not null
   order by a.submitted_at desc
   limit 500;
end;
$$;
revoke all on function public.tutor_list_unlinked_attempts() from public, anon;
grant execute on function public.tutor_list_unlinked_attempts() to authenticated;

create or replace function public.tutor_assign_attempt(p_attempt_id uuid, p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_tutor_or_admin() then
    raise exception 'Not authorized';
  end if;
  if not exists (select 1 from public.profiles where id = p_student_id and role = 'student') then
    raise exception 'That account is not a student';
  end if;
  update public.attempts set user_id = p_student_id
   where id = p_attempt_id and user_id is null and submitted_at is not null;
  if not found then
    raise exception 'Attempt not found, not finished, or already linked to a student';
  end if;
end;
$$;
revoke all on function public.tutor_assign_attempt(uuid, uuid) from public, anon;
grant execute on function public.tutor_assign_attempt(uuid, uuid) to authenticated;

-- Undo a wrong assignment: detaches the attempt again (the attempt and its marks are kept).
create or replace function public.tutor_unassign_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_tutor_or_admin() then
    raise exception 'Not authorized';
  end if;
  update public.attempts set user_id = null where id = p_attempt_id and user_id is not null;
end;
$$;
revoke all on function public.tutor_unassign_attempt(uuid) from public, anon;
grant execute on function public.tutor_unassign_attempt(uuid) to authenticated;

-- Same as before, but each attempt now carries its id so a tutor can detach it.
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
                    'id', a.id,
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
