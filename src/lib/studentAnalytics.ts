export interface QuestionStat {
  attempt_id: string
  test_title: string
  submitted_at: string
  subtest: 'listening' | 'reading'
  part: string
  question_type: string
  question_id: string
  is_correct: boolean
}

export interface AreaScore {
  key: string
  label: string
  subtest: 'listening' | 'reading'
  correct: number
  total: number
  pct: number
}

const TYPE_LABEL: Record<string, string> = {
  note_completion: 'Gap-fill notes',
  multiple_choice: 'Multiple choice',
  short_answer: 'Short answer',
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function tally(rows: QuestionStat[], keyOf: (r: QuestionStat) => string, labelOf: (r: QuestionStat) => string): AreaScore[] {
  const map = new Map<string, AreaScore>()
  for (const r of rows) {
    const key = keyOf(r)
    const cur = map.get(key) ?? { key, label: labelOf(r), subtest: r.subtest, correct: 0, total: 0, pct: 0 }
    cur.total += 1
    if (r.is_correct) cur.correct += 1
    map.set(key, cur)
  }
  return Array.from(map.values())
    .map((a) => ({ ...a, pct: a.total ? Math.round((a.correct / a.total) * 100) : 0 }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

export function areaByPart(rows: QuestionStat[]): AreaScore[] {
  return tally(
    rows.filter((r) => r.part),
    (r) => `${r.subtest}-${r.part}`,
    (r) => `${cap(r.subtest)} Part ${r.part}`,
  )
}

export function areaByType(rows: QuestionStat[]): AreaScore[] {
  return tally(
    rows,
    (r) => `${r.subtest}-${r.question_type}`,
    (r) => `${cap(r.subtest)} · ${TYPE_LABEL[r.question_type] ?? r.question_type}`,
  )
}

export interface TrendPoint {
  attemptId: string
  date: string
  title: string
  listening: number | null
  reading: number | null
}

export interface WritingCriterionAvg {
  name: string
  pct: number
  count: number
}

export function writingCriteriaAverages(feedbacks: any[]): WritingCriterionAvg[] {
  const map = new Map<string, { sum: number; max: number; n: number }>()
  for (const f of feedbacks) {
    for (const c of f?.criteria ?? []) {
      if (typeof c?.score !== 'number' || !c?.max) continue
      const cur = map.get(c.name) ?? { sum: 0, max: 0, n: 0 }
      cur.sum += c.score
      cur.max += c.max
      cur.n += 1
      map.set(c.name, cur)
    }
  }
  return Array.from(map.entries()).map(([name, v]) => ({ name, pct: Math.round((v.sum / v.max) * 100), count: v.n }))
}

export const TIPS: Record<string, string> = {
  'listening-A': 'Before each recording, predict the type of word each gap needs. Listen for self-corrections: the first number or item mentioned is often not the final one.',
  'listening-B': 'Read the question and all three options before the audio. Expect the speaker to mention every option, so decide which one matches the speaker’s actual attitude or action.',
  'listening-C': 'Underline the key idea in each question during the pause. Answers are usually paraphrased, so listen for meaning rather than the same words.',
  'reading-A': 'Skim all four texts first so you know where information lives. For short answers, copy words exactly from the text and check the word limit.',
  'reading-B': 'Identify the purpose of each extract before looking at the options, then eliminate options that are only partly supported.',
  'reading-C': 'Locate the paragraph each question refers to, and watch for options that use the right words but reverse the writer’s meaning.',
}

export function levelClass(pct: number) {
  return pct >= 75 ? 'good' : pct >= 50 ? 'mid' : 'low'
}
