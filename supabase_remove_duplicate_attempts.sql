-- Removes duplicate submissions that were saved within 2 minutes of the same
-- submission (same user, test, name and answers), keeping the earliest.
-- Touches only public.attempts and public.results.
-- Step 1: run the preview and check the rows. Step 2: run the delete.

-- STEP 1: preview
WITH ranked AS (
  SELECT id, student_name, test_id, submitted_at,
         row_number() OVER (PARTITION BY test_id, user_id, student_name, manifest_answers ORDER BY submitted_at, id) AS rn,
         submitted_at - min(submitted_at) OVER (PARTITION BY test_id, user_id, student_name, manifest_answers) AS gap
  FROM public.attempts
  WHERE status = 'submitted'
)
SELECT * FROM ranked WHERE rn > 1 AND gap < interval '2 minutes' ORDER BY submitted_at DESC;

-- STEP 2: delete (uncomment after checking the preview)
-- WITH ranked AS (
--   SELECT id,
--          row_number() OVER (PARTITION BY test_id, user_id, student_name, manifest_answers ORDER BY submitted_at, id) AS rn,
--          submitted_at - min(submitted_at) OVER (PARTITION BY test_id, user_id, student_name, manifest_answers) AS gap
--   FROM public.attempts
--   WHERE status = 'submitted'
-- ), dups AS (SELECT id FROM ranked WHERE rn > 1 AND gap < interval '2 minutes'),
-- del_results AS (DELETE FROM public.results WHERE attempt_id IN (SELECT id FROM dups) RETURNING 1)
-- DELETE FROM public.attempts WHERE id IN (SELECT id FROM dups);
