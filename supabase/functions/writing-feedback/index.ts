// Supabase Edge Function: writing-feedback
//
// Called by the tutor dashboard's "Feedback report" button when the report
// includes the Writing section. It does NOT change the Writing mark. It reads
// the candidate's letter (and the case notes PDF, when available) and returns
// the written feedback that goes into the report: language corrections,
// what the letter covered and missed, strengths and next steps.
//
// If the tutor (or "Grade with AI") has already marked the letter, the marks
// are passed to the model so the feedback agrees with them.
//
// Deploy: supabase functions deploy writing-feedback
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (same key as grade-writing)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS_HEADERS, jsonResponse, requireStaff } from '../_shared/auth.ts'
import { fetchCaseNotesBase64, findWritingStage } from '../_shared/writing.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Claude Sonnet 5.5
const MODEL = 'claude-sonnet-5-5'

const SYSTEM_PROMPT = `You are an experienced OET (Occupational English Test) Writing assessor for the Nursing profession, writing feedback for a candidate's practice letter. Compare the letter with the attached case notes (if provided) and the task instruction.

Rules:
- Only report real errors. Quote the candidate's exact words in "wrote". Never invent errors or details.
- Keep every item short and specific. Write to the candidate in plain English.
- If the letter looks unfinished (ends mid-sentence, no requests, no sign-off), say so in "ending_note". Otherwise use null.
- If marks are supplied, your feedback must agree with them.
- Do not give a mark. The mark is decided elsewhere.

Respond with ONLY valid JSON, no markdown fences, in exactly this shape:
{"language_corrections":[{"wrote":"exact words","better":"corrected words","why":"short reason"}],
"content_covered":["relevant case-note facts the letter includes"],
"content_missing":["relevant case-note facts the letter leaves out"],
"content_irrelevant":["details included that the reader does not need"],
"strengths":["3 to 4 specific things done well"],
"improvements":["4 to 6 specific, actionable next steps"],
"ending_note":null}
Limits: at most 12 language_corrections, at most 6 items in each content list.`

function strings(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, max) : []
}

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

    const { question, caseNotesDoc } = findWritingStage((attempt as any).tests?.manifest)
    if (!question) return jsonResponse({ error: 'This test has no Writing task.' }, 400)

    const essay: string | undefined = (attempt.answers ?? {})[question.id]
    if (!essay || !essay.trim()) return jsonResponse({ error: 'No letter was submitted for this attempt.' }, 400)

    const { data: result } = await admin
      .from('results')
      .select('raw_score, scorable_count, feedback')
      .eq('attempt_id', attemptId)
      .eq('subtest_type', 'writing')
      .maybeSingle()

    const caseNotesBase64 = await fetchCaseNotesBase64(admin, attempt.test_id, caseNotesDoc?.file_ref)

    const criteria: any[] = Array.isArray(result?.feedback?.criteria) ? result!.feedback.criteria : []
    const marksText =
      result?.raw_score != null
        ? `Marks already given: total ${result.raw_score} / ${result.scorable_count ?? 38}.` +
          (criteria.length
            ? ' ' + criteria.map((c) => `${c.name} ${c.score}/${c.max}`).join(', ') + '.'
            : '')
        : 'No marks have been given yet.'

    const userContent: any[] = []
    if (caseNotesBase64) {
      userContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: caseNotesBase64 },
      })
    }
    userContent.push({
      type: 'text',
      text: `Task instruction:\n${question.question ?? question.prompt ?? ''}\n\n${marksText}\n\nCandidate's letter:\n"""\n${essay}\n"""${
        caseNotesBase64
          ? ''
          : '\n\n(The case notes PDF was not available. Leave content_covered and content_missing empty and judge language and layout only.)'
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
        max_tokens: 2500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    })
    if (!claudeResp.ok) {
      return jsonResponse({ error: `Claude API error (${claudeResp.status}): ${await claudeResp.text()}` }, 502)
    }

    const claudeData = await claudeResp.json()
    const rawText: string = claudeData.content?.[0]?.text ?? ''
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) return jsonResponse({ error: 'Could not read the AI response.' }, 502)

    let parsed: any
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return jsonResponse({ error: 'The AI response was not valid JSON. Try again.' }, 502)
    }

    const corrections = (Array.isArray(parsed.language_corrections) ? parsed.language_corrections : [])
      .filter((c: any) => c && typeof c.wrote === 'string' && typeof c.better === 'string')
      .slice(0, 12)
      .map((c: any) => ({ wrote: c.wrote, better: c.better, why: typeof c.why === 'string' ? c.why : '' }))

    return jsonResponse({
      feedback: {
        language_corrections: corrections,
        content_covered: strings(parsed.content_covered, 6),
        content_missing: strings(parsed.content_missing, 6),
        content_irrelevant: strings(parsed.content_irrelevant, 6),
        strengths: strings(parsed.strengths, 4),
        improvements: strings(parsed.improvements, 6),
        ending_note: typeof parsed.ending_note === 'string' && parsed.ending_note.trim() ? parsed.ending_note : null,
        case_notes_available: Boolean(caseNotesBase64),
        model: MODEL,
      },
    })
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})
