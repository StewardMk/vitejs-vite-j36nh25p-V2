import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCode(length = 6) {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

interface SessionSummary {
  sessionGroupId: string
  studentName: string
  testTitle: string
  latestSubmittedAt: string
  listening: { raw: number; scorable: number } | null
  reading: { raw: number; scorable: number } | null
  hasWriting: boolean
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
        hasWriting: false,
      }

      if (attempt.submitted_at > existing.latestSubmittedAt) {
        existing.latestSubmittedAt = attempt.submitted_at
      }

      if (row.subtest_type === 'listening') {
        existing.listening = { raw: row.raw_score, scorable: row.scorable_count ?? 0 }
      } else if (row.subtest_type === 'reading') {
        existing.reading = { raw: row.raw_score, scorable: row.scorable_count ?? 0 }
      } else if (row.subtest_type === 'writing') {
        existing.hasWriting = true
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

  if (checkingSession) return <p>Loading...</p>

  if (!session) {
    return (
      <div style={{ maxWidth: 400, margin: '40px auto', padding: 24 }}>
        <h2>Tutor Login</h2>
        <form onSubmit={handleLogin}>
          <div>
            <label>Email</label>
            <br />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label>Password</label>
            <br />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" style={{ marginTop: 16 }}>
            Log in
          </button>
        </form>
        {loginError && <p style={{ color: 'crimson' }}>{loginError}</p>}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <button
            onClick={() => setView('generate')}
            style={{ fontWeight: view === 'generate' ? 'bold' : 'normal', marginRight: 12 }}
          >
            Generate Code
          </button>
          <button
            onClick={() => setView('results')}
            style={{ fontWeight: view === 'results' ? 'bold' : 'normal' }}
          >
            Results
          </button>
        </div>
        <button onClick={handleSignOut}>Sign out</button>
      </div>

      {view === 'generate' && (
        <div style={{ maxWidth: 500, marginTop: 24 }}>
          <h2>Generate Access Code</h2>

          <div style={{ marginTop: 16 }}>
            <label>Test</label>
            <br />
            <select value={selectedTestId} onChange={(e) => setSelectedTestId(e.target.value)}>
              <option value="">Select a test...</option>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: 16 }}>
            <label>Valid for (hours)</label>
            <br />
            <input
              type="number"
              min={1}
              value={validHours}
              onChange={(e) => setValidHours(Number(e.target.value))}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <label>Max number of students</label>
            <br />
            <input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
            />
          </div>

          <button onClick={handleGenerateCode} disabled={generating} style={{ marginTop: 16 }}>
            {generating ? 'Generating...' : 'Generate Code'}
          </button>

          {generateError && <p style={{ color: 'crimson' }}>{generateError}</p>}

          {generatedCode && (
            <div style={{ marginTop: 24, padding: 16, background: '#f0f7ff' }}>
              <p style={{ fontSize: 32, fontWeight: 'bold', letterSpacing: 4 }}>
                {generatedCode.code}
              </p>
              <p>
                Valid until: {new Date(generatedCode.expiresAt).toLocaleString()}
                <br />
                Max uses: {generatedCode.maxUses}
              </p>
            </div>
          )}
        </div>
      )}

      {view === 'results' && (
        <div style={{ marginTop: 24 }}>
          <h2>Recent Results</h2>

          {loadingResults ? (
            <p>Loading...</p>
          ) : sessions.length === 0 ? (
            <p>No completed sessions yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                  <th style={{ padding: 8 }}>Student</th>
                  <th style={{ padding: 8 }}>Test</th>
                  <th style={{ padding: 8 }}>Listening</th>
                  <th style={{ padding: 8 }}>Reading</th>
                  <th style={{ padding: 8 }}>Writing</th>
                  <th style={{ padding: 8 }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.sessionGroupId} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 8 }}>{s.studentName}</td>
                    <td style={{ padding: 8 }}>{s.testTitle}</td>
                    <td style={{ padding: 8 }}>
                      {s.listening ? `${s.listening.raw} / ${s.listening.scorable}` : '—'}
                    </td>
                    <td style={{ padding: 8 }}>
                      {s.reading ? `${s.reading.raw} / ${s.reading.scorable}` : '—'}
                    </td>
                    <td style={{ padding: 8 }}>
                      {s.hasWriting ? 'Awaiting assessment' : '—'}
                    </td>
                    <td style={{ padding: 8 }}>
                      {new Date(s.latestSubmittedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

export default TutorDashboard