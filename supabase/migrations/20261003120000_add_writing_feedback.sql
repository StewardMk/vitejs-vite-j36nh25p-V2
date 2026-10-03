-- Adds a column to hold the AI grader's structured feedback (criteria
-- breakdown, rationale, flags) alongside the existing raw_score for a
-- writing result row. Safe to run multiple times.
alter table public.results
  add column if not exists feedback jsonb;

comment on column public.results.feedback is
  'Structured AI grading output for subtest_type = writing: { criteria, overall_feedback, concerns, model, graded_at }. Null for Listening/Reading rows and for Writing rows scored manually without AI.';
