-- Stops the same exam submission being recorded more than once.
-- Touches only public.save_manifest_attempt. Run in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.save_manifest_attempt(p_test_id uuid, p_student_name text, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_attempt_id uuid := gen_random_uuid();
  v_existing uuid;
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

  -- Serialise concurrent submissions of the same test by the same user.
  PERFORM pg_advisory_xact_lock(hashtext(coalesce(auth.uid()::text, '') || ':' || p_test_id::text));

  -- If an identical submission was saved in the last 2 minutes, return it
  -- instead of creating another attempt.
  SELECT a.id INTO v_existing
  FROM public.attempts a
  WHERE a.test_id = p_test_id
    AND a.user_id IS NOT DISTINCT FROM auth.uid()
    AND a.student_name = p_student_name
    AND a.manifest_answers = COALESCE(p_answers, '{}'::jsonb)
    AND a.submitted_at > now() - interval '2 minutes'
  ORDER BY a.submitted_at
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'attemptId', v_existing,
      'duplicate', true,
      'listening', (SELECT jsonb_build_object('raw', r.raw_score, 'total', r.scorable_count) FROM public.results r WHERE r.attempt_id = v_existing AND r.subtest_type = 'listening'),
      'reading', (SELECT jsonb_build_object('raw', r.raw_score, 'total', r.scorable_count) FROM public.results r WHERE r.attempt_id = v_existing AND r.subtest_type = 'reading')
    );
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
