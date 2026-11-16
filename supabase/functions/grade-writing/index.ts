// Supabase Edge Function: grade-writing
//
// Called by the tutor dashboard's "Grade with AI" button. Given an attempt
// id, it pulls the writing task + case notes PDF + the candidate's
// submitted letter, sends them to the Claude API for assessment against a
// 6-criterion / 38-point rubric (matching WRITING_MAX_RAW in
// src/lib/oetGrading.ts), and writes the result straight into the
// `results` table (subtest_type = 'writing') -- raw_score + a `feedback`
// jsonb column with the full breakdown.
//
// Deploy: supabase functions deploy grade-writing
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// (Service role key and project URL are provided automatically by the
// Supabase Edge Functions runtime -- no need to set those.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS_HEADERS, jsonResponse, requireStaff } from '../_shared/auth.ts'
import { fetchCaseNotesBase64, findWritingStage } from '../_shared/writing.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Claude model used for grading: Claude Sonnet 5.5 (API id claude-sonnet-5-5).
const MODEL = 'claude-sonnet-5-5'

// OET Writing criteria for the Nursing sub-test: Purpose is marked out of 3
// and the other five criteria out of 7, giving the 38-point raw score that
// writingScaledScore() in src/lib/oetGrading.ts converts to the 0-500 scale.
const RUBRIC = [
  { key: 'purpose', name: 'Purpose', max: 3, desc: 'the letter states clearly why it is written and what the reader is asked to do' },
  { key: 'content', name: 'Content', max: 7, desc: 'relevant case-note information is included accurately; irrelevant detail is left out; nothing is invented' },
  { key: 'conciseness_clarity', name: 'Conciseness and Clarity', max: 7, desc: 'information is brief and clear, with no repetition and no unnecessary detail' },
  { key: 'genre_style', name: 'Genre and Style', max: 7, desc: 'professional register and tone suited to the reader; complete sentences, not note form' },
  { key: 'organisation_layout', name: 'Organisation and Layout', max: 7, desc: 'logical order, paragraphs, and letter conventions (address, date, salutation, closing)' },
  { key: 'language', name: 'Language', max: 7, desc: 'grammar, vocabulary, spelling and punctuation, and how well they support meaning' },
] as const

const MAX_RAW = RUBRIC.reduce((sum, c) => sum + c.max, 0) // 38

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const denied = await requireStaff(req)
  if (denied) return denied

  if (!ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY secret is not set for this function.' }, 500)
  }

  try {
    const { attemptId } = await req.json()
    if (!attemptId || typeof attemptId !== 'string') {
      return jsonResponse({ error: 'attemptId is required' }, 400)
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: attempt, error: attemptErr } = await admin
      .from('attempts')
      .select('id, test_id, answers, tests ( manifest )')
      .eq('id', attemptId)
      .single()

    if (attemptErr || !attempt) {
      return jsonResponse({ error: `Attempt not found: ${attemptErr?.message ?? 'unknown'}` }, 404)
    }

    const manifest = (attempt as any).tests?.manifest
    const { question, caseNotesDoc } = findWritingStage(manifest)
    if (!question) {
      return jsonResponse({ error: 'This test has no writing stage/question in its manifest.' }, 400)
    }

    const essay: string | undefined = (attempt.answers ?? {})[question.id]
    if (!essay || !essay.trim()) {
      return jsonResponse({ error: 'No essay has been submitted for this attempt yet.' }, 400)
    }

    const caseNotesBase64 = await fetchCaseNotesBase64(admin, attempt.test_id, caseNotesDoc?.file_ref)

    const rubricText = RUBRIC.map((c) => `- "${c.key}": ${c.name} (0-${c.max}): ${c.desc}`).join('\n')

    const systemPrompt = `You are an experienced OET (Occupational English Test) Writing sub-test assessor for the Nursing profession. Assess the candidate's letter strictly against the attached case notes and the task instruction below. Be a fair, consistent, moderately strict examiner -- do not inflate scores, and do not give high marks to a letter that invents information not present in the case notes, uses note form, or ignores the stated word count.

Score on these criteria:
${rubricText}
Total maximum across all criteria: ${MAX_RAW}.

Respond with ONLY valid JSON -- no markdown code fences, no commentary before or after it -- in exactly this shape:
{"criteria":[{"key":"content","score":0,"rationale":"one or two sentences"}, ... one entry for every criterion above, in the same order ...],"overall_feedback":"2-4 sentences of overall feedback addressed to the candidate","concerns":["short flags such as 'uses note form in several places' or 'invents a detail not present in the case notes' -- empty array if none apply"]}`

    const userContent: any[] = []
    if (caseNotesBase64) {
      userContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: caseNotesBase64 },
      })
    }
    userContent.push({
      type: 'text',
      text: `Task instruction given to the candidate:\n${question.question ?? question.prompt ?? ''}\n\nCandidate's submitted letter:\n"""\n${essay}\n"""${
        caseNotesBase64 ? '' : '\n\n(Note: the case notes PDF could not be retrieved for this grading pass -- assess what you can from the task instruction and letter alone, and mention this limitation in overall_feedback.)'
      }`,
    })

    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!claudeResp.ok) {
      const errText = await claudeResp.text()
      return jsonResponse({ error: `Claude API error (${claudeResp.status}): ${errText}` }, 502)
    }

    const claudeData = await claudeResp.json()
    const rawText: string = claudeData.content?.[0]?.text ?? ''
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return jsonResponse({ error: 'Could not parse the AI response as JSON.', raw: rawText }, 502)
    }

    let parsed: any
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return jsonResponse({ error: 'AI response was not valid JSON.', raw: rawText }, 502)
    }

    const criteria = Array.isArray(parsed.criteria) ? parsed.criteria : []
    const clampedCriteria = RUBRIC.map((rubricItem) => {
      const found = criteria.find((c: any) => c.key === rubricItem.key)
      const score = Math.max(0, Math.min(rubricItem.max, Math.round(Number(found?.score) || 0)))
      return { key: rubricItem.key, name: rubricItem.name, max: rubricItem.max, score, rationale: found?.rationale ?? '' }
    })
    const finalTotal = clampedCriteria.reduce((sum, c) => sum + c.score, 0)

    const feedback = {
      criteria: clampedCriteria,
      overall_feedback: parsed.overall_feedback ?? '',
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
      case_notes_available: Boolean(caseNotesBase64),
      model: MODEL,
      graded_at: new Date().toISOString(),
    }

    const { data: existingResult } = await admin
      .from('results')
      .select('id')
      .eq('attempt_id', attemptId)
      .eq('subtest_type', 'writing')
      .maybeSingle()

    if (existingResult) {
      const { error: updateErr } = await admin
        .from('results')
        .update({ raw_score: finalTotal, scorable_count: MAX_RAW, feedback })
        .eq('id', existingResult.id)
      if (updateErr) return jsonResponse({ error: `Failed to save result: ${updateErr.message}` }, 500)
    } else {
      const { error: insertErr } = await admin.from('results').insert({
        attempt_id: attemptId,
        subtest_type: 'writing',
        raw_score: finalTotal,
        scorable_count: MAX_RAW,
        feedback,
      })
      if (insertErr) return jsonResponse({ error: `Failed to save result: ${insertErr.message}` }, 500)
    }

    return jsonResponse({ rawScore: finalTotal, maxRaw: MAX_RAW, feedback })
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})
