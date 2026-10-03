import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import SiteNav from './SiteNav'
import { formatListeningReading, formatWriting } from '../lib/oetGrading'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCode(length = 6) {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
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

function answersMatch(q: any, raw: string | null | undefined): boolean | null {
  if (q.correct_answer === null || q.correct_answer === undefined) return null
  if (raw === null || raw === undefined || raw === '') return false
  return raw.toString().trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase()
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
        isCorrect: answersMatch(q, raw),
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
          table.answers-table th { background: #F4F8FF; }
          tr.right td.mark { color: #1E8E5A; font-weight: 700; }
          tr.wrong td.mark { color: #C0392B; font-weight: 700; }
          tr.wrong td:nth-child(3) { color: #C0392B; }
          .prompt { background: #F4F8FF; border-radius: 8px; padding: 16px 20px; margin: 12px 0; font-size: 13px; color: #334155; white-space: pre-wrap; }
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
          .prompt { background: #F4F8FF; border-radius: 8px; padding: 16px 20px; margin: 20px 0; font-size: 13px; color: #334155; white-space: pre-wrap; }
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
          th { background: #F4F8FF; }
          .overall { background: #F4F8FF; border-radius: 8px; padding: 16px 20px; margin: 20px 0; font-size: 14px; white-space: pre-wrap; }
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
  const [checkingSession, setCheckingSession] = useState(true)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const [view, setView] = useState<'generate' | 'results'>('generate')

  const [tests, setTests] = useState<{ id: string; title: string }[]>([])
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
  const [gradeErrors, setGradeErrors] = useState<Record<string, string>>({})

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<EditValues | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCheckingSession(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
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
    if (!session || view !== 'results') return
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
        manifest: attempt.tests?.manifest ?? null,
        answers: attempt.answers ?? null,
      }

      if (attempt.submitted_at > existing.latestSubmittedAt) {
        existing.latestSubmittedAt = attempt.submitted_at
      }

      const result: SubtestResult = { resultId: row.id, raw: row.raw_score, scorable: row.scorable_count }
      if (row.subtest_type === 'listening') existing.listening = result
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

  return (
    <>
      <SiteNav />
      <div className="tutor-dashboard-page">
        <div className="tutor-dashboard-header">
          <div>
            <span className="eyebrow">Tutor dashboard</span>
            <h1>Manage tests &amp; results</h1>
          </div>
          <button className="btn-secondary" onClick={handleSignOut}>
            Sign out
          </button>
        </div>

        <div className="tutor-tabs">
          <button
            className={`tutor-tab ${view === 'generate' ? 'active' : ''}`}
            onClick={() => setView('generate')}
          >
            Generate code
          </button>
          <button
            className={`tutor-tab ${view === 'results' ? 'active' : ''}`}
            onClick={() => setView('results')}
          >
            Results
          </button>
        </div>

        {view === 'generate' && (
          <div className="tutor-panel card">
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
                                formatListeningReading(s.listening?.raw ?? null, s.listening?.scorable ?? null)
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
      </div>
    </>
  )
}

export default TutorDashboard