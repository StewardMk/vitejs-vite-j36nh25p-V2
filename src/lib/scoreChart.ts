// Per-subtest "latest" and "best" scaled scores, used by the OET-style results chart.
// Each subtest is computed independently, so a single-subtest attempt and a full exam
// update the chart in exactly the same way.
import { gradeForScaledScore, listeningReadingScaledScore, writingScaledScore } from './oetGrading'

export type ChartSubtest = 'listening' | 'reading' | 'writing'

export const CHART_SUBTESTS: { key: ChartSubtest; label: string }[] = [
  { key: 'listening', label: 'Listening' },
  { key: 'reading', label: 'Reading' },
  { key: 'writing', label: 'Writing' },
]

export interface ChartScore {
  scaled: number
  grade: string
  date: string
}

export interface SubtestSummary {
  latest: ChartScore | null
  best: ChartScore | null
}

export type ScoreSummary = Record<ChartSubtest, SubtestSummary>

interface ResultLike {
  subtest_type: string
  raw_score: number | null
  scorable_count: number | null
}

interface AttemptLike {
  submitted_at: string
  results?: ResultLike[] | null
}

/** Scaled score for one result, or null when it can't be scored on the 0-500 scale. */
export function scaledFor(r: ResultLike): number | null {
  if (r.raw_score === null || r.raw_score === undefined) return null
  if (r.subtest_type === 'writing') return writingScaledScore(r.raw_score)
  if (r.subtest_type === 'listening' || r.subtest_type === 'reading') {
    // The conversion formula is only valid for a full 42-question paper.
    return r.scorable_count === 42 ? listeningReadingScaledScore(r.raw_score) : null
  }
  return null
}

export function summariseScores(attempts: AttemptLike[]): ScoreSummary {
  const out: ScoreSummary = {
    listening: { latest: null, best: null },
    reading: { latest: null, best: null },
    writing: { latest: null, best: null },
  }
  for (const a of attempts) {
    for (const r of a.results ?? []) {
      const key = r.subtest_type as ChartSubtest
      if (!out[key]) continue
      const scaled = scaledFor(r)
      if (scaled === null) continue
      const entry: ChartScore = { scaled, grade: gradeForScaledScore(scaled), date: a.submitted_at }
      const s = out[key]
      if (!s.latest || new Date(a.submitted_at) > new Date(s.latest.date)) s.latest = entry
      if (!s.best || scaled > s.best.scaled) s.best = entry
    }
  }
  return out
}
