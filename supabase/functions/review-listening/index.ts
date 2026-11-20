// Supabase Edge Function: review-listening
//
// Called by the tutor dashboard's "Review Listening" window when the tutor
// presses "Check with AI". It receives the gap-fill (note completion) answers
// that the automatic marking counted wrong and returns a suggestion for each
// one: accept it as a near miss, reject it, or leave it to the tutor.
//
// It NEVER changes a mark. It does not write to the database. The tutor
// decides, and the dashboard saves the tutor's choices.
//
// Deploy: supabase functions deploy review-listening
// Secret:  ANTHROPIC_API_KEY (same key as grade-writing)

import { CORS_HEADERS, jsonResponse, requireStaff } from '../_shared/auth.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

// Claude Sonnet 5.5
const MODEL = 'claude-sonnet-5-5'
const MAX_ITEMS = 40

const SYSTEM_PROMPT = `You are an experienced OET (Occupational English Test) Listening assessor for the Nursing profession. Part A is note completion: the candidate hears a consultation and fills gaps in notes. The automatic marking counted each answer below as wrong because it does not exactly match the answer key. Decide whether a human marker should accept it as a near miss.

You do not have the audio. Judge only from the note stem, the key and the candidate's answer.

Verdicts:
- "accept": the answer means exactly the same as the key and differs only in a small way: a missing or extra article ("a", "the", "his"), singular or plural, a number written another way ("2 or 3" for "2-3"), a hyphen or word-order change, or an everyday synonym that fits the gap equally well.
- "reject": a different meaning, a different thing, a partial answer that leaves out part of the key's meaning, or a misspelling that changes or breaks the word (OET requires correct spelling).
- "unsure": plausibly the same meaning but a tutor should decide (for example a broader or narrower word than the key, or a synonym that may not fit the audio).

Rules:
- Be strict about spelling. A misspelt word is "reject".
- Give a reason of at most 15 words, written for a tutor.
- Return one entry for every id you were given. Return only JSON: {"items":[{"id":"...","verdict":"accept|reject|unsure","reason":"..."}]}`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const denied = await requireStaff(req)
  if (denied) return denied

  try {
    if (!ANTHROPIC_API_KEY) {
      return jsonResponse({ error: 'ANTHROPIC_API_KEY is not set for this project.' }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const items = Array.isArray(body?.items) ? body.items : []
    if (!items.length) return jsonResponse({ error: 'No answers to review.' }, 400)
    if (items.length > MAX_ITEMS) return jsonResponse({ error: `Too many answers (max ${MAX_ITEMS}).` }, 400)

    const clean = items.map((i: any) => ({
      id: String(i?.id ?? '').slice(0, 120),
      stem: String(i?.stem ?? '').slice(0, 300),
      key: String(i?.key ?? '').slice(0, 200),
      given: String(i?.given ?? '').slice(0, 200),
    }))
    if (clean.some((i: any) => !i.id)) return jsonResponse({ error: 'Every answer needs an id.' }, 400)

    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Answers to review (JSON):\n${JSON.stringify(clean)}\n\nReturn the JSON.`,
          },
        ],
      }),
    })

    if (!claudeResp.ok) {
      const t = await claudeResp.text()
      console.error('Anthropic error', claudeResp.status, t)
      return jsonResponse({ error: `The AI service returned an error (${claudeResp.status}). Check the API key and billing.` }, 502)
    }

    const claudeJson = await claudeResp.json()
    const text: string = (claudeJson?.content ?? []).map((b: any) => b?.text ?? '').join('')
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return jsonResponse({ error: 'The AI reply could not be read. Try again.' }, 502)

    let parsed: any
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return jsonResponse({ error: 'The AI reply could not be read. Try again.' }, 502)
    }

    const allowed = new Set(clean.map((i: any) => i.id))
    const verdicts = new Set(['accept', 'reject', 'unsure'])
    const out = (Array.isArray(parsed?.items) ? parsed.items : [])
      .filter((r: any) => allowed.has(r?.id) && verdicts.has(r?.verdict))
      .map((r: any) => ({ id: r.id, verdict: r.verdict, reason: String(r.reason ?? '').slice(0, 160) }))

    return jsonResponse({ items: out, model: MODEL })
  } catch (err) {
    console.error(err)
    return jsonResponse({ error: (err as Error).message ?? 'Unexpected error.' }, 500)
  }
})
