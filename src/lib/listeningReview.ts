// Tutor review of Listening gap-fill answers.
//
// The automatic marking is an exact match with the key, so answers such as
// "small sore" for "a small sore" count wrong. A tutor can accept those near
// misses. Accepted question ids are stored on the Listening result row, in
// results.feedback.listening_review.accepted, so no database change is needed.

import { answersEqual } from './answerMatch'
import { gradeForScaledScore, listeningReadingScaledScore } from './oetGrading'

export type ReviewVerdict = 'accept' | 'reject' | 'unsure'

export interface ReviewRow {
  id: string
  n: number
  stem: string
  given: string
  key: string
  /** The automatic marking counts this wrong (unless the tutor already accepted it). */
  accepted: boolean
}

export interface AiSuggestion {
  verdict: ReviewVerdict
  reason: string
}

export type AcceptedMap = Record<string, string>

/** Reads the accepted map from a results.feedback value. */
export function readAccepted(feedback: any): AcceptedMap {
  const a = feedback?.listening_review?.accepted
  return a && typeof a === 'object' ? (a as AcceptedMap) : {}
}

/**
 * Gap-fill (non multiple-choice) Listening answers that are not blank and do
 * not match the key. Answers the tutor already accepted are included so they
 * can be unticked again.
 */
export function wrongGapFills(
  manifest: any,
  answers: Record<string, string> | null,
  accepted: AcceptedMap
): ReviewRow[] {
  const rows: ReviewRow[] = []
  for (const stage of manifest?.exam?.stages ?? []) {
    if (stage.presentation === 'introduction' || stage.presentation === 'writing') continue
    if ((stage.section ?? '').toString().toLowerCase() !== 'listening') continue
    const questions: any[] = [...(stage.questions ?? [])]
    for (const extract of stage.extracts ?? []) questions.push(...(extract.questions ?? []))
    for (const q of questions) {
      if (!q?.id || q.correct_answer == null || q.question_type === 'multiple_choice') continue
      const raw = answers?.[q.id]
      if (raw === undefined || raw === null || String(raw).trim() === '') continue
      const matches = answersEqual(String(raw), q.correct_answer, 'listening')
      if (matches) continue
      rows.push({
        id: q.id,
        n: q.order_index ?? 0,
        stem: (q.question ?? q.prompt ?? q.label ?? '').toString(),
        given: String(raw),
        key: String(q.correct_answer),
        accepted: !!accepted[q.id],
      })
    }
  }
  return rows.sort((a, b) => a.n - b.n)
}

/** New raw mark after the tutor changes the accepted set. Uses the change, so a hand-edited mark is respected. */
export function rawAfterReview(
  recordedRaw: number,
  scorable: number | null,
  before: AcceptedMap,
  after: AcceptedMap
): number {
  const next = recordedRaw + Object.keys(after).length - Object.keys(before).length
  return Math.max(0, scorable !== null ? Math.min(scorable, next) : next)
}

export function describeScore(raw: number, scorable: number | null): string {
  if (scorable !== 42) return `${raw}/${scorable ?? '?'}`
  const scaled = listeningReadingScaledScore(raw)
  return `${raw}/42 · ${scaled} · Grade ${gradeForScaledScore(scaled)}`
}
