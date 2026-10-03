-- Links a self-service attempt back to the logged-in student who made
-- it, closing the gap called out in the admin panel's user-detail view
-- ("no linked attempts yet").
--
-- This is the exact current save_manifest_attempt function (as returned
-- by `select pg_get_functiondef(oid) from pg_proc where proname =
-- 'save_manifest_attempt'`), with exactly one change: the INSERT into
-- attempts now also sets user_id = auth.uid(). Nothing else is
-- different -- same grading logic, same return shape, same behavior
-- for the tutor/access-code flow.
--
-- auth.uid() reflects whoever's JWT made the request, independent of
-- SECURITY DEFINER: when a self-service student (logged in) submits an
-- exam, it's their id; when the access-code flow submits one (no
-- Supabase Auth session at all, just a valid redeemed code), auth.uid()
-- is null and user_id is stored as null, exactly as attempts.user_id
-- was designed to allow.
--
-- Run this in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.save_manifest_attempt(p_test_id uuid, p_student_name text, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_attempt_id uuid := gen_random_uuid();
  v_manifest jsonb;
  v_stage jsonb;
  v_question jsonb;
  v_extract jsonb;
  v_section text;
  v_given text;
  v_correct text;
  listening_raw int := 0;
  listening_total int := 0;
  reading_raw int := 0;
  reading_total int := 0;
  has_writing boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tests WHERE id = p_test_id) THEN
    RAISE EXCEPTION 'Test not found';
  END IF;

  SELECT manifest INTO v_manifest FROM public.tests WHERE id = p_test_id;

  INSERT INTO public.attempts (
    id, test_id, student_name, status, submitted_at, completed_at,
    manifest_answers, answers, session_group_id, user_id
  )
  VALUES (
    v_attempt_id, p_test_id, p_student_name, 'submitted', now(), now(),
    COALESCE(p_answers, '{}'::jsonb), COALESCE(p_answers, '{}'::jsonb), v_attempt_id, auth.uid()
  );

  FOR v_stage IN SELECT * FROM jsonb_array_elements(v_manifest->'exam'->'stages')
  LOOP
    v_section := lower(coalesce(v_stage->>'section', ''));
    IF v_section = 'writing' THEN
      has_writing := true;
    END IF;

    -- flat questions (most stages, including reading_c)
    FOR v_question IN SELECT * FROM jsonb_array_elements(COALESCE(v_stage->'questions', '[]'::jsonb))
    LOOP
      v_correct := v_question->>'correct_answer';
      IF v_correct IS NOT NULL THEN
        v_given := p_answers->>(v_question->>'id');
        IF v_section = 'listening' THEN
          listening_total := listening_total + 1;
          IF v_given IS NOT NULL AND lower(trim(v_given)) = lower(trim(v_correct)) THEN
            listening_raw := listening_raw + 1;
          END IF;
        ELSIF v_section = 'reading' THEN
          reading_total := reading_total + 1;
          IF v_given IS NOT NULL AND lower(trim(v_given)) = lower(trim(v_correct)) THEN
            reading_raw := reading_raw + 1;
          END IF;
        END IF;
      END IF;
    END LOOP;

    -- extract-grouped questions
    FOR v_extract IN SELECT * FROM jsonb_array_elements(COALESCE(v_stage->'extracts', '[]'::jsonb))
    LOOP
      FOR v_question IN SELECT * FROM jsonb_array_elements(COALESCE(v_extract->'questions', '[]'::jsonb))
      LOOP
        v_correct := v_question->>'correct_answer';
        IF v_correct IS NOT NULL THEN
          v_given := p_answers->>(v_question->>'id');
          IF v_section = 'listening' THEN
            listening_total := listening_total + 1;
            IF v_given IS NOT NULL AND lower(trim(v_given)) = lower(trim(v_correct)) THEN
              listening_raw := listening_raw + 1;
            END IF;
          ELSIF v_section = 'reading' THEN
            reading_total := reading_total + 1;
            IF v_given IS NOT NULL AND lower(trim(v_given)) = lower(trim(v_correct)) THEN
              reading_raw := reading_raw + 1;
            END IF;
          END IF;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  INSERT INTO public.results (attempt_id, subtest_type, raw_score, scorable_count)
  VALUES (v_attempt_id, 'listening', listening_raw, listening_total);

  INSERT INTO public.results (attempt_id, subtest_type, raw_score, scorable_count)
  VALUES (v_attempt_id, 'reading', reading_raw, reading_total);

  IF has_writing THEN
    INSERT INTO public.results (attempt_id, subtest_type, raw_score, scorable_count)
    VALUES (v_attempt_id, 'writing', NULL, 38);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'attemptId', v_attempt_id,
    'listening', jsonb_build_object('raw', listening_raw, 'total', listening_total),
    'reading', jsonb_build_object('raw', reading_raw, 'total', reading_total)
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- Now that attempts carry a real user_id, locking down `attempts` and
-- `results` stops being optional. Neither table has row-level security
-- today, which was harmless while only your tutor account could reach
-- them with an authenticated session -- but every student is now an
-- authenticated user too, and without RLS any one of them could call
-- the REST API directly (bypassing the UI entirely) and read every
-- other student's exam answers, essays, and scores. This closes that.
--
-- This does NOT affect:
--   - save_manifest_attempt / the grade-writing Edge Function, both of
--     which write as SECURITY DEFINER / the service role and bypass
--     RLS entirely
--   - Tutor Dashboard's results view, which gets its own "tutor or
--     admin" policy below, same pattern as the `tests` lockdown
-- ---------------------------------------------------------------------
alter table public.attempts enable row level security;

drop policy if exists "attempts_select_own_or_staff" on public.attempts;
create policy "attempts_select_own_or_staff" on public.attempts
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('tutor', 'admin'))
  );

alter table public.results enable row level security;

drop policy if exists "results_select_own_or_staff" on public.results;
create policy "results_select_own_or_staff" on public.results
  for select using (
    exists (
      select 1 from public.attempts a
      where a.id = results.attempt_id
        and (
          a.user_id = auth.uid()
          or exists (select 1 from public.profiles where id = auth.uid() and role in ('tutor', 'admin'))
        )
    )
  );

-- Students and anonymous access-code sessions get no insert/update/
-- delete policy on either table -- all writes already go through
-- security-definer functions (save_manifest_attempt, the grade-writing
-- function's service-role client), which bypass RLS regardless.
