import { Fragment, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import SiteNav from './SiteNav'
import PortalLayout, { StatCard, type NavGroup } from './PortalLayout'
import ResourceLibrary from './ResourceLibrary'
import { formatListeningReading, formatWriting } from '../lib/oetGrading'
import { answersEqual } from '../lib/answerMatch'
import { downloadFeedbackReport, type ReportSection, type WritingNotes } from '../lib/feedbackReport'
import {
  describeScore,
  rawAfterReview,
  readAccepted,
  wrongGapFills,
  type AcceptedMap,
  type AiSuggestion,
  type ReviewRow,
} from '../lib/listeningReview'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCode(length = 6) {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

interface StudentRow {
  id: string
  email: string
  full_name: string | null
  is_approved: boolean
  created_at: string
  attempts: { id: string; test_id: string; test_title: string; status: string; started_at: string; submitted_at: string | null }[]
}

interface UnlinkedAttempt {
  id: string
  test_title: string
  student_name: string | null
  submitted_at: string
  scores: { subtest: string; raw: number | null; scorable: number | null }[]
}

interface SubtestResult {
  resultId: string
  raw: number | null
  scorable: number | null
}

interface SessionSummary {
  sessionGroupId: string
  attemptId: string | null
  studentName: string
  testTitle: string
  latestSubmittedAt: string
  listening: SubtestResult | null
  reading: SubtestResult | null
  writing: SubtestResult | null
  writingPrompt: string | null
  essayText: string | null
  writingFeedback: WritingFeedback | null
  listeningAccepted: AcceptedMap
  manifest: any
  answers: Record<string, string> | null
}

interface WritingFeedback {
  criteria: { key: string; name: string; max: number; score: number; rationale: string }[]
  overall_feedback: string
  concerns: string[]
  case_notes_available: boolean
  model: string
  graded_at: string
}

interface ComparisonRow {
  orderIndex: number
  subtest: string
  questionText: string
  studentDisplay: string
  correctDisplay: string
  isCorrect: boolean | null
}

function questionPrompt(q: any): string {
  return q.question ?? q.prompt ?? q.label ?? ''
}

function resolveOptionText(q: any, value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const opt = q.options?.find((o: any) => o.id === value)
  return opt ? `${opt.id} — ${opt.text}` : value
}

function displayAnswer(q: any, raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return 'No answer'
  if (q.question_type === 'multiple_choice') return resolveOptionText(q, raw)
  return raw
}

function answersMatch(q: any, raw: string | null | undefined, subtest: string): boolean | null {
  if (q.correct_answer === null || q.correct_answer === undefined) return null
  if (raw === null || raw === undefined || raw === '') return false
  return answersEqual(raw, q.correct_answer, subtest)
}

// Walks every scorable (non-writing) question in the manifest and pairs it
// with the student's submitted answer, for the tutor's side-by-side view.
function collectComparisonRows(manifest: any, answers: Record<string, string>): ComparisonRow[] {
  const rows: ComparisonRow[] = []
  const stages = manifest?.exam?.stages ?? []

  for (const stage of stages) {
    if (stage.presentation === 'writing' || stage.presentation === 'introduction') continue
    const subtest = (stage.section ?? '').toString().toLowerCase()

    const pushQuestion = (q: any) => {
      if (!q?.id) return
      const raw = answers?.[q.id]
      rows.push({
        orderIndex: q.order_index ?? 0,
        subtest,
        questionText: questionPrompt(q),
        studentDisplay: displayAnswer(q, raw),
        correctDisplay: q.correct_answer != null ? displayAnswer(q, q.correct_answer) : '—',
        isCorrect: answersMatch(q, raw, subtest),
      })
    }

    for (const q of stage.questions ?? []) pushQuestion(q)
    for (const extract of stage.extracts ?? []) {
      for (const q of extract.questions ?? []) pushQuestion(q)
    }
  }

  return rows
}

function openAnswerComparison(session: SessionSummary) {
  const win = window.open('', '_blank')
  if (!win) return

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const rows =
    session.manifest && session.answers ? collectComparisonRows(session.manifest, session.answers) : []

  const bySubtest = new Map<string, ComparisonRow[]>()
  for (const r of rows) {
    const key = r.subtest || 'other'
    if (!bySubtest.has(key)) bySubtest.set(key, [])
    bySubtest.get(key)!.push(r)
  }

  const sectionOrder = ['listening', 'reading', 'other']
  const sectionLabel: Record<string, string> = { listening: 'Listening', reading: 'Reading', other: 'Other' }

  const sectionsHtml = sectionOrder
    .filter((key) => bySubtest.has(key))
    .map((key) => {
      const sectionRows = bySubtest.get(key)!
      const correctCount = sectionRows.filter((r) => r.isCorrect === true).length
      const scorableCount = sectionRows.filter((r) => r.isCorrect !== null).length
      return `
        <h2>${sectionLabel[key]} <span class="section-score">${correctCount} / ${scorableCount} correct</span></h2>
        <table class="answers-table">
          <thead>
            <tr><th>Q</th><th>Question</th><th>Student's answer</th><th>Correct answer</th><th></th></tr>
          </thead>
          <tbody>
            ${sectionRows
              .map(
                (r) => `
              <tr class="${r.isCorrect === false ? 'wrong' : r.isCorrect === true ? 'right' : ''}">
                <td>${r.orderIndex}</td>
                <td>${escape(r.questionText)}</td>
                <td>${escape(r.studentDisplay)}</td>
                <td>${escape(r.correctDisplay)}</td>
                <td class="mark">${r.isCorrect === true ? '✓' : r.isCorrect === false ? '✗' : ''}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `
    })
    .join('')

  const writingHtml =
    session.writingPrompt || session.essayText
      ? `
      <h2>Writing</h2>
      ${session.writingPrompt ? `<div class="prompt">${escape(session.writingPrompt)}</div>` : ''}
      <div class="essay">${session.essayText ? escape(session.essayText) : '<em>No response recorded.</em>'}</div>
    `
      : ''

  win.document.write(`
    <html>
      <head>
        <title>${session.studentName} — Answer comparison</title>
        <style>
          body { font-family: 'Work Sans', Arial, sans-serif; padding: 40px; color: #122033; max-width: 920px; margin: 0 auto; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          h2 { font-size: 17px; margin-top: 32px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: baseline; }
          .section-score { font-size: 13px; color: #64748B; font-weight: 400; }
          p.meta { color: #64748B; margin-top: 0; }
          table.answers-table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
          table.answers-table th, table.answers-table td { border: 1px solid #E2E8F0; padding: 6px 8px; text-align: left; vertical-align: top; }
          table.answers-table th { background: #F2F7FC; }
          tr.right td.mark { color: #1E8E5A; font-weight: 700; }
          tr.wrong td.mark { color: #C0392B; font-weight: 700; }
          tr.wrong td:nth-child(3) { color: #C0392B; }
          .prompt { background: #F2F7FC; border-radius: 8px; padding: 16px 20px; margin: 12px 0; font-size: 13px; color: #334155; white-space: pre-wrap; }
          .essay { white-space: pre-wrap; line-height: 1.6; font-size: 14px; }
          .no-data { color: #64748B; }
          @media print { table { break-inside: avoid; } }
        </style>
      </head>
      <body>
        <h1>${session.studentName}</h1>
        <p class="meta">${session.testTitle} &middot; ${new Date(session.latestSubmittedAt).toLocaleString()}</p>
        ${rows.length === 0 ? '<p class="no-data"><em>No manifest/answers available for this attempt.</em></p>' : sectionsHtml}
        ${writingHtml}
      </body>
    </html>
  `)
  win.document.close()
  win.focus()
  win.print()
}

interface EditValues {
  listeningRaw: string
  listeningScorable: string
  readingRaw: string
  readingScorable: string
  writingRaw: string
}

function toEditValues(session: SessionSummary): EditValues {
  return {
    listeningRaw: session.listening?.raw?.toString() ?? '',
    listeningScorable: session.listening?.scorable?.toString() ?? '',
    readingRaw: session.reading?.raw?.toString() ?? '',
    readingScorable: session.reading?.scorable?.toString() ?? '',
    writingRaw: session.writing?.raw?.toString() ?? '',
  }
}

function findWritingQuestion(manifest: any): { id: string; prompt: string } | null {
  const stage = manifest?.exam?.stages?.find((s: any) => s.presentation === 'writing')
  const q = stage?.questions?.[0]
  if (!q) return null
  return { id: q.id, prompt: q.question ?? q.prompt ?? q.label ?? '' }
}

function openWritingAnswer(session: SessionSummary) {
  const win = window.open('', '_blank')
  if (!win) return

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  win.document.write(`
    <html>
      <head>
        <title>${session.studentName} — Writing answer</title>
        <style>
          body { font-family: 'Work Sans', Arial, sans-serif; padding: 40px; color: #122033; max-width: 720px; margin: 0 auto; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          p.meta { color: #64748B; margin-top: 0; }
          .prompt { background: #F2F7FC; border-radius: 8px; padding: 16px 20px; margin: 20px 0; font-size: 13px; color: #334155; white-space: pre-wrap; }
          .essay { white-space: pre-wrap; line-height: 1.6; font-size: 15px; }
        </style>
      </head>
      <body>
        <h1>${session.studentName}</h1>
        <p class="meta">${session.testTitle} &middot; Writing &middot; ${new Date(session.latestSubmittedAt).toLocaleString()}</p>
        ${session.writingPrompt ? `<div class="prompt">${escape(session.writingPrompt)}</div>` : ''}
        <div class="essay">${session.essayText ? escape(session.essayText) : '<em>No response recorded.</em>'}</div>
      </body>
    </html>
  `)
  win.document.close()
  win.focus()
  win.print()
}

function openWritingFeedback(session: SessionSummary) {
  const fb = session.writingFeedback
  if (!fb) return
  const win = window.open('', '_blank')
  if (!win) return

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  win.document.write(`
    <html>
      <head>
        <title>${session.studentName} — AI writing feedback</title>
        <style>
          body { font-family: 'Work Sans', Arial, sans-serif; padding: 40px; color: #122033; max-width: 720px; margin: 0 auto; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          p.meta { color: #64748B; margin-top: 0; }
          table { border-collapse: collapse; width: 100%; margin-top: 16px; font-size: 13px; }
          th, td { border: 1px solid #E2E8F0; padding: 8px 10px; text-align: left; vertical-align: top; }
          th { background: #F2F7FC; }
          .overall { background: #F2F7FC; border-radius: 8px; padding: 16px 20px; margin: 20px 0; font-size: 14px; white-space: pre-wrap; }
          .concerns { color: #B45309; font-size: 13px; }
          .concerns li { margin-bottom: 4px; }
          .footnote { color: #94A3B8; font-size: 11px; margin-top: 24px; }
        </style>
      </head>
      <body>
        <h1>${session.studentName}</h1>
        <p class="meta">${session.testTitle} &middot; AI writing assessment &middot; ${new Date(fb.graded_at).toLocaleString()}</p>
        <table>
          <thead><tr><th>Criterion</th><th>Score</th><th>Rationale</th></tr></thead>
          <tbody>
            ${fb.criteria
              .map(
                (c) => `<tr><td>${escape(c.name)}</td><td>${c.score} / ${c.max}</td><td>${escape(c.rationale)}</td></tr>`
              )
              .join('')}
          </tbody>
        </table>
        <div class="overall"><strong>Overall feedback:</strong><br />${escape(fb.overall_feedback)}</div>
        ${
          fb.concerns.length
            ? `<div class="concerns"><strong>Flags:</strong><ul>${fb.concerns.map((c) => `<li>${escape(c)}</li>`).join('')}</ul></div>`
            : ''
        }
        <p class="footnote">Graded by ${escape(fb.model)}${fb.case_notes_available ? '' : ' — case notes PDF was unavailable for this grading pass, so content was assessed from the task instruction and letter alone.'}</p>
      </body>
    </html>
  `)
  win.document.close()
  win.focus()
  win.print()
}

function openPrintableResult(session: SessionSummary) {
  const win = window.open('', '_blank')
  if (!win) return

  const row = (label: string, value: string) => `<tr><td>${label}</td><td>${value}</td></tr>`

  win.document.write(`
    <html>
      <head>
        <title>${session.studentName} — ${session.testTitle}</title>
        <style>
          body { font-family: 'Work Sans', Arial, sans-serif; padding: 40px; color: #122033; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          p.meta { color: #64748B; margin-top: 0; }
          table { border-collapse: collapse; width: 100%; max-width: 480px; margin-top: 24px; }
          td { padding: 10px 12px; border: 1px solid #E2E8F0; }
          td:first-child { font-weight: 600; width: 40%; }
          p.footnote { color: #94A3B8; font-size: 12px; max-width: 480px; }
        </style>
      </head>
      <body>
        <h1>${session.studentName}</h1>
        <p class="meta">${session.testTitle} &middot; ${new Date(session.latestSubmittedAt).toLocaleString()}</p>
        <table>
          ${row('Listening', formatListeningReading(session.listening?.raw ?? null, session.listening?.scorable ?? null))}
          ${row('Reading', formatListeningReading(session.reading?.raw ?? null, session.reading?.scorable ?? null))}
          ${row('Writing', formatWriting(session.writing?.raw ?? null))}
        </table>
        <p class="footnote">Format: raw score / total &middot; OET scaled score (0&ndash;500) &middot; OET grade, per the OET Standard Grading &amp; Conversion Guide.</p>
      </body>
    </html>
  `)
  win.document.close()
  win.focus()
  win.print()
}

function TutorDashboard() {
  const [session, setSession] = useState<any>(null)
  const [isTutor, setIsTutor] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const [staffRole, setStaffRole] = useState('tutor')
  const [staffName, setStaffName] = useState('')
  const [view, setView] = useState<'overview' | 'resources' | 'generate' | 'results' | 'students'>('overview')

  const [tests, setTests] = useState<{ id: string; title: string }[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [openStudentId, setOpenStudentId] = useState<string | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [unlinked, setUnlinked] = useState<UnlinkedAttempt[]>([])
  const [unlinkedSearch, setUnlinkedSearch] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)

  function loadStudents() {
    supabase.rpc('tutor_list_students').then(({ data }) => setStudents((data as StudentRow[]) ?? []))
  }

  async function openAddExam(studentId: string, studentName: string) {
    setAddingFor(studentId)
    setUnlinkedSearch(studentName)
    setStudentsError('')
    const { data, error } = await supabase.rpc('tutor_list_unlinked_attempts')
    if (error) setStudentsError(error.message)
    else setUnlinked((data as UnlinkedAttempt[]) ?? [])
  }

  async function assignAttempt(attemptId: string, studentId: string) {
    setAssignBusy(true)
    setStudentsError('')
    const { error } = await supabase.rpc('tutor_assign_attempt', { p_attempt_id: attemptId, p_student_id: studentId })
    setAssignBusy(false)
    if (error) {
      setStudentsError(error.message)
      return
    }
    setUnlinked((u) => u.filter((x) => x.id !== attemptId))
    loadStudents()
  }

  async function unassignAttempt(attemptId: string) {
    if (!window.confirm('Remove this exam from the student? The attempt and its marks are kept and can be added again.')) return
    const { error } = await supabase.rpc('tutor_unassign_attempt', { p_attempt_id: attemptId })
    if (error) setStudentsError(error.message)
    else loadStudents()
  }

  function scoreText(sc: UnlinkedAttempt['scores']) {
    return sc.length ? sc.map((x) => `${x.subtest[0].toUpperCase()}${x.subtest.slice(1)} ${x.raw ?? '—'}${x.scorable ? `/${x.scorable}` : ''}`).join(' · ') : 'No scores'
  }
  const [selectedTestId, setSelectedTestId] = useState('')
  const [validHours, setValidHours] = useState(3)
  const [maxUses, setMaxUses] = useState(20)
  const [generatedCode, setGeneratedCode] = useState<{
    code: string
    expiresAt: string
    maxUses: number
  } | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loadingResults, setLoadingResults] = useState(false)

  const [gradingSessionId, setGradingSessionId] = useState<string | null>(null)
  // Feedback report dialog
  const [reportSession, setReportSession] = useState<SessionSummary | null>(null)
  const [reportSections, setReportSections] = useState<Record<ReportSection, boolean>>({
    listening: true,
    reading: true,
    writing: true,
  })
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState('')

  // Listening review dialog
  const [reviewSession, setReviewSession] = useState<SessionSummary | null>(null)
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([])
  const [reviewTicks, setReviewTicks] = useState<Record<string, boolean>>({})
  const [reviewAi, setReviewAi] = useState<Record<string, AiSuggestion>>({})
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewAiBusy, setReviewAiBusy] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const writingNotesCache = useRef<Map<string, WritingNotes>>(new Map())
  const [gradeErrors, setGradeErrors] = useState<Record<string, string>>({})

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<EditValues | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  useEffect(() => {
    async function checkRole(userId: string) {
      const { data } = await supabase.from('profiles').select('role, full_name').eq('id', userId).single()
      setIsTutor(data?.role === 'tutor' || data?.role === 'admin')
      setStaffRole(data?.role ?? 'tutor')
      setStaffName(data?.full_name ?? '')
      setCheckingSession(false)
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) checkRole(data.session.user.id)
      else setCheckingSession(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) checkRole(newSession.user.id)
      else {
        setIsTutor(false)
        setCheckingSession(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    supabase
      .from('tests')
      .select('id, title')
      .then(({ data }) => {
        if (data) setTests(data)
      })
  }, [session])

  useEffect(() => {
    if (!session || (view !== 'students' && view !== 'overview')) return
    setStudentsLoading(true)
    setStudentsError('')
    supabase.rpc('tutor_list_students').then(({ data, error }) => {
      setStudentsLoading(false)
      if (error) {
        setStudentsError(error.message)
        return
      }
      setStudents((data as StudentRow[]) ?? [])
    })
  }, [session, view])

  useEffect(() => {
    if (!session || (view !== 'results' && view !== 'overview')) return
    loadResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, view])

  async function loadResults() {
    setLoadingResults(true)

    const { data, error } = await supabase
      .from('results')
      .select(
        `
        id,
        subtest_type,
        raw_score,
        scorable_count,
        feedback,
        attempts (
          id,
          student_name,
          session_group_id,
          submitted_at,
          answers,
          tests ( title, manifest )
        )
        `
      )
      .order('id', { ascending: false })
      .limit(300)

    setLoadingResults(false)

    if (error || !data) {
      console.error(error)
      return
    }

    const bySession = new Map<string, SessionSummary>()

    for (const row of data as any[]) {
      const attempt = row.attempts
      if (!attempt?.session_group_id) continue

      const key = attempt.session_group_id
      const writingQuestion = findWritingQuestion(attempt.tests?.manifest)
      const existing = bySession.get(key) ?? {
        sessionGroupId: key,
        attemptId: attempt.id ?? null,
        studentName: attempt.student_name ?? 'Unknown',
        testTitle: attempt.tests?.title ?? 'Unknown test',
        latestSubmittedAt: attempt.submitted_at,
        listening: null,
        reading: null,
        writing: null,
        writingPrompt: writingQuestion?.prompt ?? null,
        essayText: writingQuestion ? attempt.answers?.[writingQuestion.id] ?? null : null,
        writingFeedback: null,
        listeningAccepted: {},
        manifest: attempt.tests?.manifest ?? null,
        answers: attempt.answers ?? null,
      }

      if (attempt.submitted_at > existing.latestSubmittedAt) {
        existing.latestSubmittedAt = attempt.submitted_at
      }

      const result: SubtestResult = { resultId: row.id, raw: row.raw_score, scorable: row.scorable_count }
      if (row.subtest_type === 'listening') {
        existing.listening = result
        existing.listeningAccepted = readAccepted(row.feedback)
      }
      else if (row.subtest_type === 'reading') existing.reading = result
      else if (row.subtest_type === 'writing') {
        existing.writing = result
        existing.writingFeedback = row.feedback ?? null
      }


      bySession.set(key, existing)
    }

    const sorted = Array.from(bySession.values()).sort((a, b) =>
      b.latestSubmittedAt.localeCompare(a.latestSubmittedAt)
    )
    setSessions(sorted)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setLoginError(error.message)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  async function handleGenerateCode() {
    if (!selectedTestId) {
      setGenerateError('Pick a test first.')
      return
    }
    setGenerating(true)
    setGenerateError('')

    const expiresAt = new Date(Date.now() + validHours * 60 * 60 * 1000).toISOString()

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode()
      const { error } = await supabase.from('access_codes').insert({
        test_id: selectedTestId,
        code,
        created_by: session.user.id,
        expires_at: expiresAt,
        max_uses: maxUses,
      })

      if (!error) {
        setGeneratedCode({ code, expiresAt, maxUses })
        setGenerating(false)
        return
      }

      if (!error.message.includes('duplicate')) {
        setGenerateError(error.message)
        setGenerating(false)
        return
      }
    }

    setGenerateError('Could not generate a unique code after several attempts. Try again.')
    setGenerating(false)
  }

  function startEdit(s: SessionSummary) {
    setEditingSessionId(s.sessionGroupId)
    setEditValues(toEditValues(s))
    setEditError('')
  }

  function cancelEdit() {
    setEditingSessionId(null)
    setEditValues(null)
    setEditError('')
  }

  async function saveEdit(s: SessionSummary) {
    if (!editValues) return
    setSavingEdit(true)
    setEditError('')

    const toIntOrNull = (v: string) => (v.trim() === '' ? null : Number(v))

    const updates: any[] = []

    if (s.listening) {
      updates.push(
        supabase
          .from('results')
          .update({
            raw_score: toIntOrNull(editValues.listeningRaw),
            scorable_count: toIntOrNull(editValues.listeningScorable),
          })
          .eq('id', s.listening.resultId)
          .select('id')
      )
    }
    if (s.reading) {
      updates.push(
        supabase
          .from('results')
          .update({
            raw_score: toIntOrNull(editValues.readingRaw),
            scorable_count: toIntOrNull(editValues.readingScorable),
          })
          .eq('id', s.reading.resultId)
          .select('id')
      )
    }
    if (s.writing) {
      updates.push(
        supabase
          .from('results')
          .update({ raw_score: toIntOrNull(editValues.writingRaw) })
          .eq('id', s.writing.resultId)
          .select('id')
      )
    }

    const results = await Promise.all(updates)
    const failed = results.find((r) => r.error)
    const blocked = results.find((r) => !r.error && (r.data?.length ?? 0) === 0)

    setSavingEdit(false)

    if (failed) {
      setEditError(failed.error.message)
      return
    }
    if (blocked) {
      setEditError(
        'Nothing was saved -- the database rejected the update (likely a missing RLS UPDATE policy on "results"). See supabase_results_update_policy.sql.'
      )
      return
    }

    cancelEdit()
    loadResults()
  }

  function openReportDialog(s: SessionSummary, only?: ReportSection) {
    setReportError('')
    setReportSections({
      listening: !!s.listening && (!only || only === 'listening'),
      reading: !!s.reading && (!only || only === 'reading'),
      writing: !!s.writing && (!only || only === 'writing'),
    })
    setReportSession(s)
  }

  async function handleDownloadReport() {
    const s = reportSession
    if (!s) return
    const sections = (['listening', 'reading', 'writing'] as ReportSection[]).filter(
      (k) => reportSections[k] && !!s[k]
    )
    if (!sections.length) {
      setReportError('Choose at least one section.')
      return
    }
    setReportBusy(true)
    setReportError('')
    try {
      let writingNotes: WritingNotes | null = null
      if (sections.includes('writing')) {
        if (!s.attemptId) throw new Error('No attempt id found for this session.')
        const cacheKey = `${s.attemptId}:${s.writing?.raw ?? ''}`
        writingNotes = writingNotesCache.current.get(cacheKey) ?? null
        if (!writingNotes) {
          const { data, error } = await supabase.functions.invoke('writing-feedback', {
            body: { attemptId: s.attemptId },
          })
          if ((data as any)?.error || error || !(data as any)?.feedback) {
            throw new Error((data as any)?.error ?? error?.message ?? 'Writing feedback failed.')
          }
          writingNotes = (data as any).feedback as WritingNotes
          writingNotesCache.current.set(cacheKey, writingNotes)
        }
      }
      downloadFeedbackReport({
        studentName: s.studentName,
        testTitle: s.testTitle,
        sections,
        manifest: s.manifest,
        answers: s.answers,
        listening: s.listening,
        reading: s.reading,
        writing: s.writing,
        writingMarks: s.writingFeedback,
        writingNotes,
        listeningAccepted: s.listeningAccepted,
      })
      setReportSession(null)
    } catch (err) {
      setReportError((err as Error).message)
    } finally {
      setReportBusy(false)
    }
  }

  function openReviewDialog(s: SessionSummary) {
    const rows = wrongGapFills(s.manifest, s.answers, s.listeningAccepted)
    setReviewRows(rows)
    setReviewTicks(Object.fromEntries(rows.map((r) => [r.id, r.accepted])))
    setReviewAi({})
    setReviewError('')
    setReviewSession(s)
  }

  async function handleReviewAI() {
    const todo = reviewRows.filter((r) => !r.accepted)
    if (!todo.length) {
      setReviewError('There are no answers to check.')
      return
    }
    setReviewAiBusy(true)
    setReviewError('')
    try {
      const { data, error } = await supabase.functions.invoke('review-listening', {
        body: { items: todo.map((r) => ({ id: r.id, stem: r.stem, key: r.key, given: r.given })) },
      })
      if ((data as any)?.error || error || !Array.isArray((data as any)?.items)) {
        throw new Error((data as any)?.error ?? error?.message ?? 'The AI check failed.')
      }
      const next: Record<string, AiSuggestion> = {}
      for (const it of (data as any).items) next[it.id] = { verdict: it.verdict, reason: it.reason }
      setReviewAi(next)
    } catch (err) {
      setReviewError((err as Error).message)
    } finally {
      setReviewAiBusy(false)
    }
  }

  function tickSuggested() {
    setReviewTicks((prev) => {
      const next = { ...prev }
      for (const [id, sug] of Object.entries(reviewAi)) if (sug.verdict === 'accept') next[id] = true
      return next
    })
  }

  async function handleSaveReview() {
    const s = reviewSession
    if (!s?.listening) return
    setReviewBusy(true)
    setReviewError('')
    const now = new Date().toISOString()
    const after: AcceptedMap = {}
    for (const r of reviewRows) {
      if (!reviewTicks[r.id]) continue
      after[r.id] = s.listeningAccepted[r.id] ?? (reviewAi[r.id]?.verdict === 'accept' ? 'AI-suggested, tutor-accepted' : 'Tutor-accepted')
    }
    const raw = s.listening.raw ?? 0
    const newRaw = rawAfterReview(raw, s.listening.scorable, s.listeningAccepted, after)
    const { data, error } = await supabase
      .from('results')
      .update({
        raw_score: newRaw,
        feedback: { listening_review: { accepted: after, reviewed_at: now, reviewed_by: session?.user?.email ?? null } },
      })
      .eq('id', s.listening.resultId)
      .select('id')
    setReviewBusy(false)
    if (error) {
      setReviewError(error.message)
      return
    }
    if (!data || data.length === 0) {
      setReviewError('Nothing was saved. The database rejected the update (a missing UPDATE policy on "results").')
      return
    }
    setReviewSession(null)
    await loadResults()
  }

  async function handleGradeWithAI(s: SessionSummary) {
    if (!s.attemptId) {
      setGradeErrors({ ...gradeErrors, [s.sessionGroupId]: 'No attempt id found for this session.' })
      return
    }
    setGradingSessionId(s.sessionGroupId)
    setGradeErrors({ ...gradeErrors, [s.sessionGroupId]: '' })

    const { data, error } = await supabase.functions.invoke('grade-writing', {
      body: { attemptId: s.attemptId },
    })

    setGradingSessionId(null)

    if (error || (data as any)?.error) {
      setGradeErrors({
        ...gradeErrors,
        [s.sessionGroupId]: (data as any)?.error ?? error?.message ?? 'AI grading failed.',
      })
      return
    }

    await loadResults()
  }

  if (checkingSession) {
    return (
      <>
        <SiteNav />
        <div className="tutor-dashboard-page">
          <p>Loading…</p>
        </div>
      </>
    )
  }

  if (!session) {
    return (
      <>
        <SiteNav />
        <div className="tutor-dashboard-page">
          <div className="tutor-login-card card">
            <span className="eyebrow">Tutor access</span>
            <h1>Tutor login</h1>
            <form onSubmit={handleLogin} className="tutor-login-form">
              <label>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <button type="submit" className="btn-primary">
                Log in
              </button>
            </form>
            {loginError && <p className="tutor-error">{loginError}</p>}
          </div>
        </div>
      </>
    )
  }

  if (!isTutor) {
    return (
      <>
        <SiteNav />
        <div className="tutor-dashboard-page">
          <div className="tutor-login-card card">
            <span className="eyebrow">Tutor access</span>
            <h1>This isn't a tutor account</h1>
            <p>Sign in with your tutor account to reach this page.</p>
            <button className="btn-secondary" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </>
    )
  }

  const awaitingGrade = sessions.filter((x) => x.writing && x.writing.raw === null)
  const groups: NavGroup[] = [
    {
      items: [
        { key: 'overview', label: 'Overview', icon: 'home' },
        { key: 'resources', label: 'Resources', icon: 'folder' },
      ],
    },
    {
      label: 'Teaching',
      items: [
        { key: 'generate', label: 'Access codes', icon: 'key' },
        { key: 'results', label: 'Results', icon: 'chart', badge: awaitingGrade.length || undefined },
        { key: 'students', label: 'Students', icon: 'users' },
      ],
    },
    {
      label: 'Tools',
      items: [
        { key: 'upload', label: 'Upload exam', icon: 'upload', to: '/admin' },
        ...(staffRole === 'admin' ? [{ key: 'admin', label: 'Admin panel', icon: 'tests' as const, to: '/admin-panel' }] : []),
      ],
    },
  ]
  const titles: Record<typeof view, [string, string]> = {
    overview: ['Overview', 'What needs your attention today'],
    resources: ['Resources', 'Tutor guides, printable tests and answer keys'],
    generate: ['Access codes', 'Let a class sit a test without creating accounts'],
    results: ['Results', 'Marks, writing grading and answer comparisons'],
    students: ['Students', 'Student accounts and the tests they have taken'],
  }

  return (
    <PortalLayout
      portalName="Tutor portal"
      groups={groups}
      active={view}
      onSelect={(k) => setView(k as typeof view)}
      userName={staffName || session.user.email}
      userRole={staffRole}
      onSignOut={handleSignOut}
      title={titles[view][0]}
      subtitle={titles[view][1]}
      wide={view === 'results'}
    >
        {view === 'overview' && (
          <>
            <div className="stat-grid">
              <StatCard icon="users" label="Student accounts" value={students.length} />
              <StatCard icon="tests" label="Exam sessions" value={sessions.length} sub="Most recent 300 results" />
              <StatCard icon="clock" tone={awaitingGrade.length ? 'amber' : 'green'} label="Writing awaiting a grade" value={awaitingGrade.length} />
            </div>
            <div className="panel-grid">
              <div className="panel">
                <h2>Needs grading</h2>
                <p className="panel-sub">Writing tasks with no score yet</p>
                {awaitingGrade.length === 0 ? (
                  <div className="empty-state"><strong>All caught up</strong>No writing tasks are waiting.</div>
                ) : (
                  <>
                    {awaitingGrade.slice(0, 6).map((x) => (
                      <div key={x.sessionGroupId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border-light)', fontSize: 14 }}>
                        <span><strong>{x.studentName}</strong><br /><span style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>{x.testTitle}</span></span>
                        <span style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>{new Date(x.latestSubmittedAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                    <button className="btn-primary" style={{ marginTop: 14 }} onClick={() => setView('results')}>Open results</button>
                  </>
                )}
              </div>
              <div className="panel">
                <h2>Recent submissions</h2>
                <p className="panel-sub">Latest exam sessions</p>
                {sessions.length === 0 ? (
                  <div className="empty-state"><strong>No submissions yet</strong>Results appear here as students finish.</div>
                ) : (
                  sessions.slice(0, 6).map((x) => (
                    <div key={x.sessionGroupId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border-light)', fontSize: 14 }}>
                      <span><strong>{x.studentName}</strong><br /><span style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>{x.testTitle}</span></span>
                      <span style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>{new Date(x.latestSubmittedAt).toLocaleDateString()}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="panel">
                <h2>Quick actions</h2>
                <p className="panel-sub">Jump straight to common jobs</p>
                <div style={{ display: 'grid', gap: 10 }}>
                  <button className="btn-secondary" onClick={() => setView('generate')}>Generate an access code</button>
                  <button className="btn-secondary" onClick={() => setView('resources')}>Download a tutor guide or printable test</button>
                  <button className="btn-secondary" onClick={() => setView('students')}>Look up a student</button>
                </div>
              </div>
            </div>
          </>
        )}

        {view === 'resources' && <ResourceLibrary userId={session.user.id} canDelete={staffRole === 'admin'} />}

        {view === 'generate' && (
          <div className="tutor-panel tutor-panel-narrow card">
            <h2>Generate access code</h2>

            <div className="tutor-field">
              <label>Test</label>
              <select value={selectedTestId} onChange={(e) => setSelectedTestId(e.target.value)}>
                <option value="">Select a test…</option>
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="tutor-field-row">
              <div className="tutor-field">
                <label>Valid for (hours)</label>
                <input
                  type="number"
                  min={1}
                  value={validHours}
                  onChange={(e) => setValidHours(Number(e.target.value))}
                />
              </div>
              <div className="tutor-field">
                <label>Max number of students</label>
                <input
                  type="number"
                  min={1}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                />
              </div>
            </div>

            <button className="btn-primary" onClick={handleGenerateCode} disabled={generating}>
              {generating ? 'Generating…' : 'Generate code'}
            </button>

            {generateError && <p className="tutor-error">{generateError}</p>}

            {generatedCode && (
              <div className="tutor-generated-code">
                <strong>{generatedCode.code}</strong>
                <span>
                  Valid until {new Date(generatedCode.expiresAt).toLocaleString()} · max {generatedCode.maxUses}{' '}
                  students
                </span>
              </div>
            )}
          </div>
        )}

        {view === 'students' && (
          <div className="tutor-panel card">
            <h2>Student accounts</h2>
            <p className="tutor-panel-note">
              Tests each student account has already taken, so you can avoid giving them the same test again.
            </p>

            <div className="tutor-field">
              <input
                type="search"
                placeholder="Search by name or email"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
            </div>

            {studentsError && <p className="student-entry-error">{studentsError}</p>}

            {studentsLoading ? (
              <p>Loading…</p>
            ) : (
              <div className="tutor-table-wrap">
                <table className="tutor-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Email</th>
                      <th>Tests taken</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {students
                      .filter((st) => {
                        const q = studentSearch.trim().toLowerCase()
                        return !q || `${st.full_name ?? ''} ${st.email}`.toLowerCase().includes(q)
                      })
                      .map((st) => {
                        const done = st.attempts.filter((a) => a.submitted_at)
                        const isOpen = openStudentId === st.id
                        return (
                          <Fragment key={st.id}>
                            <tr>
                              <td>
                                {st.full_name || '—'}
                                {st.is_approved === false && ' (pending approval)'}
                              </td>
                              <td>{st.email}</td>
                              <td>{done.length}</td>
                              <td>
                                <button
                                  className="btn-secondary"
                                  onClick={() => setOpenStudentId(isOpen ? null : st.id)}
                                >
                                  {isOpen ? 'Hide' : 'View'}
                                </button>
                              </td>
                            </tr>
                            {isOpen && (
                              <tr>
                                <td colSpan={4} style={{ textAlign: 'left' }}>
                                  {st.attempts.length === 0 ? (
                                    <em>No tests taken yet.</em>
                                  ) : (
                                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                                      {st.attempts.map((a, i) => (
                                        <li key={i}>
                                          {a.test_title} &mdash;{' '}
                                          {a.submitted_at
                                            ? `completed ${new Date(a.submitted_at).toLocaleDateString()}`
                                            : `started ${new Date(a.started_at).toLocaleDateString()}, not finished`}
                                          {a.submitted_at && (
                                            <button className="btn-secondary" style={{ marginLeft: 10, padding: '2px 8px', fontSize: 12 }} onClick={() => unassignAttempt(a.id)}>
                                              Remove
                                            </button>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  <div style={{ marginTop: 10 }}>
                                    {addingFor === st.id ? (
                                      <div>
                                        <strong>Add a completed exam to {st.full_name || st.email}</strong>
                                        <p className="tutor-panel-note">Finished attempts not yet linked to any student account (for example, taken with an access code). Adding one puts its marks in this student's results and score chart.</p>
                                        <div className="tutor-field">
                                          <input type="search" placeholder="Search by name or exam" value={unlinkedSearch} onChange={(e) => setUnlinkedSearch(e.target.value)} />
                                        </div>
                                        <div className="tutor-table-wrap">
                                          <table className="tutor-table">
                                            <thead><tr><th>Name entered</th><th>Exam</th><th>Scores</th><th>Date</th><th></th></tr></thead>
                                            <tbody>
                                              {unlinked
                                                .filter((u) => {
                                                  const q = unlinkedSearch.trim().toLowerCase()
                                                  return !q || `${u.student_name ?? ''} ${u.test_title}`.toLowerCase().includes(q)
                                                })
                                                .slice(0, 50)
                                                .map((u) => (
                                                  <tr key={u.id}>
                                                    <td>{u.student_name || '—'}</td>
                                                    <td>{u.test_title}</td>
                                                    <td>{scoreText(u.scores)}</td>
                                                    <td>{new Date(u.submitted_at).toLocaleDateString()}</td>
                                                    <td><button className="btn-primary" disabled={assignBusy} onClick={() => assignAttempt(u.id, st.id)}>Add</button></td>
                                                  </tr>
                                                ))}
                                              {unlinked.length === 0 && <tr><td colSpan={5}>No unlinked completed exams.</td></tr>}
                                            </tbody>
                                          </table>
                                        </div>
                                        <button className="btn-secondary" onClick={() => setAddingFor(null)}>Done</button>
                                      </div>
                                    ) : (
                                      <button className="btn-secondary" onClick={() => openAddExam(st.id, st.full_name || '')}>Add completed exam</button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    {students.length === 0 && !studentsLoading && (
                      <tr>
                        <td colSpan={4}>No student accounts yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {view === 'results' && (
          <div className="tutor-panel card">
            <h2>Recent results</h2>
            <p className="tutor-panel-note">
              Format: raw score / total &middot; OET scaled score (0&ndash;500) &middot; OET grade (A/B/C+/C/D/E),
              per the OET Standard Grading &amp; Conversion Guide. Writing needs a raw rubric score (out of 38)
              entered manually until AI grading is wired up.
            </p>

            {loadingResults ? (
              <p>Loading…</p>
            ) : sessions.length === 0 ? (
              <p>No completed sessions yet.</p>
            ) : (
              <div className="tutor-table-wrap">
                <table className="tutor-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Test</th>
                      <th>Listening</th>
                      <th>Reading</th>
                      <th>Writing</th>
                      <th>Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => {
                      const editing = editingSessionId === s.sessionGroupId
                      return (
                        <Fragment key={s.sessionGroupId}>
                          <tr>
                            <td>{s.studentName}</td>
                            <td>{s.testTitle}</td>
                            <td>
                              {editing && editValues ? (
                                <span className="tutor-score-edit">
                                  <input
                                    value={editValues.listeningRaw}
                                    onChange={(e) => setEditValues({ ...editValues, listeningRaw: e.target.value })}
                                    disabled={!s.listening}
                                  />
                                  /
                                  <input
                                    value={editValues.listeningScorable}
                                    onChange={(e) =>
                                      setEditValues({ ...editValues, listeningScorable: e.target.value })
                                    }
                                    disabled={!s.listening}
                                  />
                                </span>
                              ) : (
                                <>
                                  {formatListeningReading(s.listening?.raw ?? null, s.listening?.scorable ?? null)}
                                  {s.listening && (
                                    <div style={{ marginTop: 6 }}>
                                      <button className="btn-secondary" onClick={() => openReviewDialog(s)}>
                                        Review answers
                                        {Object.keys(s.listeningAccepted).length > 0
                                          ? ` (${Object.keys(s.listeningAccepted).length} accepted)`
                                          : ''}
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                            <td>
                              {editing && editValues ? (
                                <span className="tutor-score-edit">
                                  <input
                                    value={editValues.readingRaw}
                                    onChange={(e) => setEditValues({ ...editValues, readingRaw: e.target.value })}
                                    disabled={!s.reading}
                                  />
                                  /
                                  <input
                                    value={editValues.readingScorable}
                                    onChange={(e) =>
                                      setEditValues({ ...editValues, readingScorable: e.target.value })
                                    }
                                    disabled={!s.reading}
                                  />
                                </span>
                              ) : (
                                formatListeningReading(s.reading?.raw ?? null, s.reading?.scorable ?? null)
                              )}
                            </td>
                            <td>
                              {editing && editValues ? (
                                <span className="tutor-score-edit">
                                  <input
                                    value={editValues.writingRaw}
                                    onChange={(e) => setEditValues({ ...editValues, writingRaw: e.target.value })}
                                    disabled={!s.writing}
                                    placeholder="/ 38"
                                  />
                                </span>
                              ) : s.writing ? (
                                <span className="tutor-writing-cell">
                                  <button className="btn-secondary" onClick={() => openWritingAnswer(s)}>
                                    View / download answer
                                  </button>
                                  <button
                                    className="btn-secondary"
                                    onClick={() => handleGradeWithAI(s)}
                                    disabled={gradingSessionId === s.sessionGroupId}
                                  >
                                    {gradingSessionId === s.sessionGroupId
                                      ? 'Grading…'
                                      : s.writingFeedback
                                        ? 'Re-grade with AI'
                                        : 'Grade with AI'}
                                  </button>
                                  {s.writingFeedback && (
                                    <button className="btn-secondary" onClick={() => openWritingFeedback(s)}>
                                      View AI feedback
                                    </button>
                                  )}
                                  <button className="btn-secondary" onClick={() => openReportDialog(s, 'writing')}>
                                    Feedback report
                                  </button>
                                  <span className="tutor-writing-grade">{formatWriting(s.writing.raw)}</span>
                                  {gradeErrors[s.sessionGroupId] && (
                                    <span className="tutor-error">{gradeErrors[s.sessionGroupId]}</span>
                                  )}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>{new Date(s.latestSubmittedAt).toLocaleDateString()}</td>
                            <td className="tutor-row-actions">
                              {editing ? (
                                <>
                                  <button className="btn-primary" onClick={() => saveEdit(s)} disabled={savingEdit}>
                                    {savingEdit ? 'Saving…' : 'Save'}
                                  </button>
                                  <button className="btn-secondary" onClick={cancelEdit} disabled={savingEdit}>
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button className="btn-secondary" onClick={() => startEdit(s)}>
                                    Edit
                                  </button>
                                  <button className="btn-secondary" onClick={() => openAnswerComparison(s)}>
                                    View / download answers
                                  </button>
                                  <button className="btn-secondary" onClick={() => openPrintableResult(s)}>
                                    Print / download
                                  </button>
                                  <button className="btn-primary" onClick={() => openReportDialog(s)}>
                                    Feedback report
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                          {editing && editError && (
                            <tr>
                              <td colSpan={7} className="tutor-error">
                                {editError}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      {reviewSession && reviewSession.listening && (
        <div className="report-modal-backdrop" onClick={() => !reviewBusy && !reviewAiBusy && setReviewSession(null)}>
          <div
            className="report-modal review-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Review Listening answers</h3>
            <p className="report-modal-sub">
              {reviewSession.studentName} &middot; {reviewSession.testTitle}
            </p>
            {reviewRows.length === 0 ? (
              <p className="report-modal-help">
                There are no wrong gap-fill answers to review. Multiple-choice answers and blank answers are not
                listed.
              </p>
            ) : (
              <>
                <p className="report-modal-help">
                  These gap-fill answers were marked wrong because they do not exactly match the key. Tick any you want
                  to accept as correct. &quot;Check with AI&quot; (Claude Sonnet 5.5) suggests which are near misses; it
                  uses a small amount of API credit and never changes a mark.
                </p>
                <div className="review-table-wrap">
                  <table className="review-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Q</th>
                        <th>Note</th>
                        <th>Wrote</th>
                        <th>Key</th>
                        <th>AI suggestion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewRows.map((r) => {
                        const sug = reviewAi[r.id]
                        return (
                          <tr key={r.id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={!!reviewTicks[r.id]}
                                onChange={(e) => setReviewTicks({ ...reviewTicks, [r.id]: e.target.checked })}
                                disabled={reviewBusy}
                                aria-label={`Accept question ${r.n}`}
                              />
                            </td>
                            <td>{r.n}</td>
                            <td>{r.stem}</td>
                            <td>{r.given}</td>
                            <td>{r.key}</td>
                            <td>
                              {sug ? (
                                <span className={`review-chip review-chip-${sug.verdict}`}>
                                  {sug.verdict === 'accept' ? 'Accept' : sug.verdict === 'reject' ? 'Reject' : 'Unsure'}
                                </span>
                              ) : null}
                              {sug ? <div className="review-reason">{sug.reason}</div> : null}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {(() => {
                  const after: AcceptedMap = {}
                  for (const r of reviewRows) if (reviewTicks[r.id]) after[r.id] = ''
                  const before = reviewSession.listeningAccepted
                  const cur = reviewSession.listening!.raw ?? 0
                  const next = rawAfterReview(cur, reviewSession.listening!.scorable, before, after)
                  return (
                    <p className="report-modal-help">
                      <strong>Listening mark:</strong> {describeScore(cur, reviewSession.listening!.scorable)}
                      {next !== cur ? <> &rarr; <strong>{describeScore(next, reviewSession.listening!.scorable)}</strong></> : null}
                    </p>
                  )
                })()}
              </>
            )}
            {reviewError && <p className="tutor-error">{reviewError}</p>}
            <div className="report-modal-actions">
              <button className="btn-secondary" onClick={() => setReviewSession(null)} disabled={reviewBusy || reviewAiBusy}>
                Close
              </button>
              {reviewRows.length > 0 && (
                <>
                  <button className="btn-secondary" onClick={handleReviewAI} disabled={reviewBusy || reviewAiBusy}>
                    {reviewAiBusy ? 'Checking…' : 'Check with AI'}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={tickSuggested}
                    disabled={reviewBusy || reviewAiBusy || !Object.values(reviewAi).some((x) => x.verdict === 'accept')}
                  >
                    Tick suggested
                  </button>
                  <button className="btn-primary" onClick={handleSaveReview} disabled={reviewBusy || reviewAiBusy}>
                    {reviewBusy ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {reportSession && (
        <div className="report-modal-backdrop" onClick={() => !reportBusy && setReportSession(null)}>
          <div className="report-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Feedback report</h3>
            <p className="report-modal-sub">
              {reportSession.studentName} &middot; {reportSession.testTitle}
            </p>
            <p className="report-modal-help">Choose the sections to include in the PDF.</p>
            <div className="report-modal-options">
              {(['listening', 'reading', 'writing'] as ReportSection[])
                .filter((k) => !!reportSession[k])
                .map((k) => (
                  <label key={k}>
                    <input
                      type="checkbox"
                      checked={reportSections[k]}
                      onChange={(e) => setReportSections({ ...reportSections, [k]: e.target.checked })}
                      disabled={reportBusy}
                    />
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                  </label>
                ))}
            </div>
            {reportSections.writing && reportSession.writing && (
              <p className="report-modal-help">
                Writing feedback is drafted by AI (Claude Sonnet 5.5) and takes a few seconds. It uses a small amount of
                API credit. The Writing mark itself is not changed.
              </p>
            )}
            {reportError && <p className="tutor-error">{reportError}</p>}
            <div className="report-modal-actions">
              <button className="btn-secondary" onClick={() => setReportSession(null)} disabled={reportBusy}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleDownloadReport} disabled={reportBusy}>
                {reportBusy ? 'Preparing…' : 'Download PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  )
}

export default TutorDashboard