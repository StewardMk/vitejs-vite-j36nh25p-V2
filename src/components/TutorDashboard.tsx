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
  studentName: string
  testTitle: string
  latestSubmittedAt: string
  listening: SubtestResult | null
  reading: SubtestResult | null
  writing: SubtestResult | null
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
        attempts (
          student_name,
          session_group_id,
          submitted_at,
          tests ( title )
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
      const existing = bySession.get(key) ?? {
        sessionGroupId: key,
        studentName: attempt.student_name ?? 'Unknown',
        testTitle: attempt.tests?.title ?? 'Unknown test',
        latestSubmittedAt: attempt.submitted_at,
        listening: null,
        reading: null,
        writing: null,
      }

      if (attempt.submitted_at > existing.latestSubmittedAt) {
        existing.latestSubmittedAt = attempt.submitted_at
      }

      const result: SubtestResult = { resultId: row.id, raw: row.raw_score, scorable: row.scorable_count }
      if (row.subtest_type === 'listening') existing.listening = result
      else if (row.subtest_type === 'reading') existing.reading = result
      else if (row.subtest_type === 'writing') existing.writing = result

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
      )
    }
    if (s.writing) {
      updates.push(
        supabase
          .from('results')
          .update({ raw_score: toIntOrNull(editValues.writingRaw) })
          .eq('id', s.writing.resultId)
      )
    }

    const results = await Promise.all(updates)
    const failed = results.find((r) => r.error)

    setSavingEdit(false)

    if (failed) {
      setEditError(failed.error.message)
      return
    }

    cancelEdit()
    loadResults()
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
                              ) : (
                                formatWriting(s.writing?.raw ?? null)
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