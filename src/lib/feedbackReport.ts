// Builds the student Feedback Report PDF (the template tutors already hand out):
// navy summary box, scores by part, question-by-question tables, Writing
// assessment, what worked well and how to improve.
//
// Any combination of Listening, Reading and Writing can be included, so a
// single-section test produces a single-section report.

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { answersEqual } from './answerMatch'
import {
  gradeForScaledScore,
  listeningReadingScaledScore,
  writingScaledScore,
  WRITING_MAX_RAW,
} from './oetGrading'

export type ReportSection = 'listening' | 'reading' | 'writing'

export interface ReportScore {
  raw: number | null
  scorable: number | null
}

export interface WritingCriterion {
  key: string
  name: string
  max: number
  score: number
  rationale: string
}

export interface WritingMarks {
  criteria: WritingCriterion[]
  overall_feedback: string
}

export interface WritingNotes {
  language_corrections: { wrote: string; better: string; why: string }[]
  content_covered: string[]
  content_missing: string[]
  content_irrelevant: string[]
  strengths: string[]
  improvements: string[]
  ending_note: string | null
  case_notes_available: boolean
}

export interface FeedbackReportInput {
  studentName: string
  testTitle: string
  sections: ReportSection[]
  manifest: any
  answers: Record<string, string> | null
  listening: ReportScore | null
  reading: ReportScore | null
  writing: ReportScore | null
  writingMarks: WritingMarks | null
  writingNotes: WritingNotes | null
  /** Listening answers a tutor accepted as near misses (question id -> note). Shown as correct. */
  listeningAccepted?: Record<string, string>
}

type RGB = [number, number, number]
const NAVY: RGB = [0, 57, 125]
const LIGHT: RGB = [229, 239, 249]
const GRID: RGB = [201, 211, 224]
const INK: RGB = [15, 42, 74]
const GREEN: RGB = [27, 122, 58]
const RED: RGB = [179, 38, 30]
const GREY: RGB = [105, 122, 142]

const MARGIN_X = 18
const PAGE_W = 210
const CONTENT_W = PAGE_W - MARGIN_X * 2

interface QRow {
  n: number
  text: string
  given: string
  key: string
  ok: boolean
  blank: boolean
}

interface PartData {
  label: string
  subtest: 'listening' | 'reading'
  rows: QRow[]
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function optionText(q: any, id: string): string {
  const opt = q.options?.find((o: any) => o.id === id)
  return opt ? `${opt.id} — ${opt.text}` : id
}

function display(q: any, value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '(blank)'
  return q.question_type === 'multiple_choice' ? optionText(q, value) : value
}

/** Every scorable question of one sub-test, grouped by part, in exam order. */
export function collectParts(
  manifest: any,
  answers: Record<string, string> | null,
  subtest: 'listening' | 'reading',
  accepted: Record<string, string> = {}
): PartData[] {
  const parts: PartData[] = []
  for (const stage of manifest?.exam?.stages ?? []) {
    if (stage.presentation === 'introduction' || stage.presentation === 'writing') continue
    if ((stage.section ?? '').toString().toLowerCase() !== subtest) continue

    const questions: any[] = [...(stage.questions ?? [])]
    for (const extract of stage.extracts ?? []) questions.push(...(extract.questions ?? []))
    const scorable = questions.filter((q) => q?.id && q.correct_answer != null)
    if (!scorable.length) continue
    scorable.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

    const rows: QRow[] = scorable.map((q) => {
      const raw = answers?.[q.id]
      const blank = raw === undefined || raw === null || raw === ''
      return {
        n: q.order_index ?? 0,
        text: (q.question ?? q.prompt ?? q.label ?? '').toString(),
        given: display(q, raw),
        key: display(q, q.correct_answer),
        ok: !blank && (answersEqual(raw as string, q.correct_answer, subtest) || !!accepted[q.id]),
        blank,
      }
    })
    parts.push({
      label: `Part ${(stage.part ?? '').toString().toUpperCase()}`,
      subtest,
      rows,
    })
  }
  return parts
}

function qList(rows: QRow[], limit = 8): string {
  const nums = rows.map((r) => `Q${r.n}`)
  return nums.length > limit ? `${nums.slice(0, limit).join(', ')} and ${nums.length - limit} more` : nums.join(', ')
}

function partComment(rows: QRow[]): string {
  const wrong = rows.filter((r) => !r.ok)
  if (!wrong.length) return 'Every question correct.'
  const blanks = rows.filter((r) => r.blank)
  const bits: string[] = []
  const answeredWrong = wrong.filter((r) => !r.blank)
  if (answeredWrong.length) bits.push(`Missed ${qList(answeredWrong)}.`)
  if (blanks.length) bits.push(`Left blank: ${qList(blanks)}.`)
  return bits.join(' ')
}

/** Smallest raw score that reaches a higher grade than `raw`, or null at the top. */
function nextTarget(raw: number, kind: 'lr' | 'writing'): { raw: number; grade: string; scaled: number } | null {
  const max = kind === 'lr' ? 42 : WRITING_MAX_RAW
  const scale = (r: number) => (kind === 'lr' ? listeningReadingScaledScore(r) : writingScaledScore(r))
  const current = gradeForScaledScore(scale(raw))
  for (let r = raw + 1; r <= max; r++) {
    const g = gradeForScaledScore(scale(r))
    if (g !== current) return { raw: r, grade: g, scaled: scale(r) }
  }
  return null
}

function bulletParagraph(doc: jsPDF, y: number, text: string): number {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  const lines = doc.splitTextToSize(text, CONTENT_W - 6)
  const h = lines.length * 4.3
  if (y + h > 297 - 20) {
    doc.addPage()
    y = 16
  }
  doc.text('•', MARGIN_X + 1, y)
  doc.text(lines, MARGIN_X + 5, y)
  return y + h + 1.6
}

export function buildFeedbackReport(input: FeedbackReportInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const include = (s: ReportSection) => input.sections.includes(s)
  let y = 16

  function ensure(h: number) {
    if (y + h > 297 - 20) {
      doc.addPage()
      y = 16
    }
  }
  function h2(text: string) {
    ensure(14)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12.5)
    doc.setTextColor(...NAVY)
    doc.text(text, MARGIN_X, y)
    y += 3.5
  }
  function para(text: string, italic = false) {
    doc.setFont('helvetica', italic ? 'italic' : 'normal')
    doc.setFontSize(italic ? 8.6 : 9)
    doc.setTextColor(0, 0, 0)
    const lines = doc.splitTextToSize(text, CONTENT_W)
    ensure(lines.length * 4.3 + 3)
    doc.text(lines, MARGIN_X, y + 3)
    y += lines.length * (italic ? 4 : 4.3) + 4
  }
  function table(
    head: string[],
    body: string[][],
    widths: number[],
    opts: { markCol?: number; boldFirst?: boolean; blankCol?: number } = {}
  ) {
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      margin: { left: MARGIN_X, right: MARGIN_X, top: 16, bottom: 18 },
      theme: 'grid',
      tableWidth: CONTENT_W,
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: { top: 1.8, bottom: 1.8, left: 2.2, right: 2.2 },
        lineColor: GRID,
        lineWidth: 0.15,
        textColor: [0, 0, 0],
        valign: 'top',
      },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: Object.fromEntries(
        widths.map((w, i) => [i, { cellWidth: w, fontStyle: i === 0 && opts.boldFirst !== false ? 'bold' : 'normal' }])
      ),
      didParseCell: (d) => {
        if (d.section !== 'body') return
        const text = String(d.cell.raw ?? '')
        if (opts.markCol === d.column.index) {
          d.cell.styles.fontStyle = 'bold'
          d.cell.styles.textColor = text === 'Yes' ? GREEN : RED
        }
        if (opts.blankCol === d.column.index && text === '(blank)') {
          d.cell.styles.textColor = RED
          d.cell.styles.fontStyle = 'italic'
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 2
  }

  // ---- header
  const single = input.sections.length === 1
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...INK)
  doc.text(single ? `${cap(input.sections[0])} Feedback Report` : 'Feedback Report', MARGIN_X, y + 6)
  y += 12
  doc.setFontSize(9)
  const meta: [string, string][] = [
    ['Candidate: ', input.studentName],
    ['  |  Test: ', input.testTitle],
    ['  |  Marked: ', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })],
  ]
  let x = MARGIN_X
  doc.setTextColor(0, 0, 0)
  for (const [label, value] of meta) {
    doc.setFont('helvetica', 'bold')
    doc.text(label, x, y)
    x += doc.getTextWidth(label)
    doc.setFont('helvetica', 'normal')
    doc.text(value, x, y)
    x += doc.getTextWidth(value)
  }
  y += 6

  // ---- gather data
  const lParts = include('listening') ? collectParts(input.manifest, input.answers, 'listening', input.listeningAccepted ?? {}) : []
  const rParts = include('reading') ? collectParts(input.manifest, input.answers, 'reading') : []
  const writingRaw = input.writing?.raw ?? null

  interface Cell {
    label: string
    big: string
    small: string
  }
  const cells: Cell[] = []
  const lrCell = (label: string, score: ReportScore | null): Cell | null => {
    if (!score || score.raw === null) return { label, big: 'Not marked', small: '' }
    if (score.scorable !== 42) return { label, big: `${score.raw} / ${score.scorable ?? '?'}`, small: '' }
    const sc = listeningReadingScaledScore(score.raw)
    return { label, big: `${score.raw} / 42`, small: `Grade ${gradeForScaledScore(sc)} · ${sc} / 500` }
  }
  if (include('listening')) cells.push(lrCell('LISTENING', input.listening)!)
  if (include('reading')) cells.push(lrCell('READING', input.reading)!)
  if (include('writing')) {
    if (writingRaw === null) cells.push({ label: 'WRITING', big: 'Awaiting mark', small: '' })
    else {
      const sc = writingScaledScore(writingRaw)
      cells.push({
        label: 'WRITING',
        big: `${writingRaw} / ${WRITING_MAX_RAW}`,
        small: `Grade ${gradeForScaledScore(sc)} · ${sc} / 500`,
      })
    }
  }

  // ---- summary box
  y += 2
  const boxH = 28
  doc.setFillColor(...NAVY)
  doc.rect(MARGIN_X, y, CONTENT_W, boxH, 'F')
  const cw = CONTENT_W / cells.length
  cells.forEach((c, i) => {
    const cx = MARGIN_X + i * cw + 8
    if (i > 0) {
      doc.setDrawColor(92, 134, 184)
      doc.setLineWidth(0.2)
      doc.line(MARGIN_X + i * cw, y + 4, MARGIN_X + i * cw, y + boxH - 4)
    }
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.8)
    doc.text(c.label, cx, y + 8)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(cells.length === 1 ? 24 : 18)
    doc.text(c.big, cx, y + 17.5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(c.small, cx, y + 24)
  })
  y += boxH + 3
  para(
    'Scores use the OET scaled-score conversion (0 to 500). They are estimates from a practice test, not official OET results.' +
      (include('writing') && input.writingMarks
        ? ' The Writing mark was given against six criteria, out of 38.'
        : ''),
    true
  )

  // ---- scores by part
  const partRows: string[][] = []
  for (const p of [...lParts, ...rParts]) {
    const got = p.rows.filter((r) => r.ok).length
    partRows.push([cap(p.subtest), p.label.replace('Part ', ''), `${got} / ${p.rows.length}`, partComment(p.rows)])
  }
  if (include('writing')) {
    partRows.push([
      'Writing',
      'Letter',
      writingRaw === null ? 'Awaiting' : `${writingRaw} / ${WRITING_MAX_RAW}`,
      writingRaw === null ? 'Not marked yet.' : 'Marked against the Writing criteria. See the Writing assessment below.',
    ])
  }
  if (partRows.length) {
    h2('Scores by part')
    table(['Sub-test', 'Part', 'Score', 'Comment'], partRows, [24, 16, 20, 114])
  }

  // ---- warn when tutor-edited scores disagree with the answers
  const mismatch: string[] = []
  for (const [name, parts, score] of [
    ['Listening', lParts, input.listening],
    ['Reading', rParts, input.reading],
  ] as [string, PartData[], ReportScore | null][]) {
    if (!parts.length || !score || score.raw === null) continue
    const computed = parts.reduce((n, p) => n + p.rows.filter((r) => r.ok).length, 0)
    if (computed !== score.raw) mismatch.push(`${name}: answers give ${computed}, recorded mark is ${score.raw}`)
  }
  if (mismatch.length) {
    para(`Note: the recorded mark was adjusted by a tutor (${mismatch.join('; ')}). The headline uses the recorded mark.`, true)
  }

  // ---- question tables
  for (const p of [...lParts, ...rParts]) {
    h2(`${cap(p.subtest)}: ${p.label}, question by question`)
    const gap = p.rows.some((r) => /\(\.\.\.\)|_{3,}/.test(r.text))
    table(
      ['Q', gap ? 'Note stem / question' : 'Question', 'Your answer', 'Correct answer', 'Mark'],
      p.rows.map((r) => [String(r.n), r.text, r.given, r.key, r.ok ? 'Yes' : 'No']),
      [9, 63, 40, 50, 12],
      { markCol: 4, blankCol: 2 }
    )
  }

  // ---- writing
  if (include('writing')) {
    h2('Writing assessment')
    const marks = input.writingMarks
    if (marks?.criteria?.length) {
      const total = marks.criteria.reduce((n, c) => n + c.score, 0)
      const max = marks.criteria.reduce((n, c) => n + c.max, 0)
      const rows = marks.criteria.map((c) => [c.name, `${c.score} / ${c.max}`, c.rationale])
      rows.push(['TOTAL', `${total} / ${max}`, writingRaw !== null ? `Recorded mark ${writingRaw} / ${WRITING_MAX_RAW}.` : ''])
      table(['Criterion', 'Mark', 'Comment'], rows, [38, 20, 116])
    } else if (writingRaw !== null) {
      para(`Total mark: ${writingRaw} / ${WRITING_MAX_RAW}. A breakdown by criterion was not recorded for this letter.`)
    } else {
      para('This letter has not been marked yet.')
    }

    const notes = input.writingNotes
    if (notes) {
      if (notes.ending_note) para(`Ending: ${notes.ending_note}`)
      if (notes.language_corrections.length) {
        h2('Language: corrections')
        table(
          ['You wrote', 'Better', 'Why'],
          notes.language_corrections.map((c) => [c.wrote, c.better, c.why]),
          [56, 56, 62],
          { boldFirst: false }
        )
      }
      const groups: [string, string[]][] = [
        ['Included from the case notes', notes.content_covered],
        ['Left out', notes.content_missing],
        ['Not needed by the reader', notes.content_irrelevant],
      ]
      if (groups.some(([, l]) => l.length)) {
        h2('Content selection')
        table(
          ['Group', 'Details'],
          groups.filter(([, l]) => l.length).map(([g, l]) => [g, l.join('; ')]),
          [46, 128]
        )
      }
    }
    if (marks?.overall_feedback) para(marks.overall_feedback, true)
  }

  // ---- what worked well / how to improve
  const good: string[] = []
  const better: string[] = []
  for (const [name, parts, score] of [
    ['Listening', lParts, input.listening],
    ['Reading', rParts, input.reading],
  ] as [string, PartData[], ReportScore | null][]) {
    if (!parts.length) continue
    const allRows = parts.flatMap((p) => p.rows)
    const blanks = allRows.filter((r) => r.blank).length
    const perfect = parts.filter((p) => p.rows.every((r) => r.ok))
    for (const p of perfect) good.push(`<b>${name} ${p.label}</b> was perfect (${p.rows.length} / ${p.rows.length}).`)
    if (!perfect.length) {
      const best = [...parts].sort(
        (a, b) => b.rows.filter((r) => r.ok).length / b.rows.length - a.rows.filter((r) => r.ok).length / a.rows.length
      )[0]
      const got = best.rows.filter((r) => r.ok).length
      if (got / best.rows.length >= 0.5) good.push(`<b>${name} ${best.label}</b> was your strongest part (${got} / ${best.rows.length}).`)
    }
    if (blanks === 0) good.push(`<b>You answered every ${name} question.</b>`)
    else
      better.push(
        `<b>${name}: answer every question.</b> ${blanks} ${blanks === 1 ? 'question was' : 'questions were'} left blank. A guess has no penalty, so write something and move on.`
      )
    const weakest = [...parts].sort(
      (a, b) => a.rows.filter((r) => r.ok).length / a.rows.length - b.rows.filter((r) => r.ok).length / b.rows.length
    )[0]
    const wGot = weakest.rows.filter((r) => r.ok).length
    if (wGot < weakest.rows.length) better.push(`<b>${name}: work on ${weakest.label}.</b> It scored ${wGot} / ${weakest.rows.length}, the lowest of your parts.`)
    const gapMiss = allRows.filter((r) => !r.ok && !r.blank && /\(\.\.\.\)|_{3,}/.test(r.text))
    if (gapMiss.length >= 2)
      better.push(
        `<b>${name}: check the exact form.</b> Spelling, hyphens and numbers must match the key (${qList(gapMiss, 4)}). Re-read each gap and decide what kind of word fits before you write.`
      )
    const tgt = score && score.raw !== null && score.scorable === 42 ? nextTarget(score.raw, 'lr') : null
    if (tgt)
      better.push(
        `<b>${name} next target:</b> ${tgt.raw} / 42 reaches Grade ${tgt.grade} (approx. ${tgt.scaled} / 500). That is ${tgt.raw - (score!.raw as number)} more ${tgt.raw - (score!.raw as number) === 1 ? 'mark' : 'marks'}.`
      )
  }
  if (include('writing')) {
    for (const s of input.writingNotes?.strengths ?? []) good.push(s)
    for (const s of input.writingNotes?.improvements ?? []) better.push(s)
    const tgt = writingRaw !== null ? nextTarget(writingRaw, 'writing') : null
    if (tgt) better.push(`<b>Writing next target:</b> ${tgt.raw} / ${WRITING_MAX_RAW} reaches Grade ${tgt.grade} (approx. ${tgt.scaled} / 500).`)
  }

  function bulletList(items: string[]) {
    for (const item of items) y = bulletParagraph(doc, y + 3, item.replace(/<\/?b>/g, '')) - 3
  }
  if (good.length) {
    h2('What worked well')
    bulletList(good)
  }
  if (better.length) {
    h2('How to improve next time')
    bulletList(better)
  }

  // ---- footers
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GREY)
    doc.text(`YouEngage OET Training Centre  ·  Feedback report  ·  ${input.testTitle}`, MARGIN_X, 287)
    doc.text(`Page ${i}`, PAGE_W - MARGIN_X, 287, { align: 'right' })
  }
  return doc
}

export function downloadFeedbackReport(input: FeedbackReportInput) {
  const doc = buildFeedbackReport(input)
  const clean = (s: string) => s.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')
  doc.save(`${clean(input.studentName) || 'student'}_${clean(input.testTitle) || 'test'}_Feedback_Report.pdf`)
}
