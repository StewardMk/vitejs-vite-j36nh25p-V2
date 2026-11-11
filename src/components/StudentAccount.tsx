import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthSession, signOutStudent } from '../lib/studentAuth'
import { formatListeningReading, formatWriting, gradeForScaledScore, listeningReadingScaledScore } from '../lib/oetGrading'
import {
  areaByPart, areaByType, levelClass, TIPS, writingCriteriaAverages,
  type AreaScore, type QuestionStat, type TrendPoint,
} from '../lib/studentAnalytics'
import PortalLayout, { StatCard, type NavGroup } from './PortalLayout'

interface PurchaseRow {
  id: string
  status: string
  amount_kwacha: number
  currency: string
  created_at: string
  paid_at: string | null
  tests: { id: string; title: string } | null
}

interface AttemptResultRow {
  subtest_type: 'listening' | 'reading' | 'writing'
  raw_score: number | null
  scorable_count: number | null
  feedback?: any
}

interface AttemptRow {
  id: string
  submitted_at: string
  tests: { title: string } | null
  results: AttemptResultRow[]
}

type View = 'dashboard' | 'results' | 'purchases'

function scoreSummary(results: AttemptResultRow[]) {
  const listening = results.find((r) => r.subtest_type === 'listening')
  const reading = results.find((r) => r.subtest_type === 'reading')
  const writing = results.find((r) => r.subtest_type === 'writing')
  const parts: string[] = []
  if (listening) parts.push(`Listening ${formatListeningReading(listening.raw_score, listening.scorable_count)}`)
  if (reading) parts.push(`Reading ${formatListeningReading(reading.raw_score, reading.scorable_count)}`)
  if (writing) parts.push(`Writing ${formatWriting(writing.raw_score)}`)
  return parts.length ? parts.join(' · ') : 'No scores recorded'
}

function pctOf(r?: AttemptResultRow) {
  if (!r || r.raw_score === null || !r.scorable_count) return null
  return Math.round((r.raw_score / r.scorable_count) * 100)
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  const W = 640, H = 220, L = 38, R = 16, T = 14, B = 34
  const n = points.length
  const x = (i: number) => (n === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1))
  const y = (v: number) => T + (1 - v / 100) * (H - T - B)
  const line = (key: 'listening' | 'reading') =>
    points.map((p, i) => (p[key] === null ? null : `${x(i)},${y(p[key] as number)}`)).filter(Boolean).join(' ')
  const dots = (key: 'listening' | 'reading', color: string) =>
    points.map((p, i) => p[key] === null ? null : (
      <circle key={`${key}${i}`} cx={x(i)} cy={y(p[key] as number)} r={4} fill={color}>
        <title>{`${p.title}: ${key} ${p[key]}%`}</title>
      </circle>
    ))
  return (
    <>
      <svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Score trend across exams">
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="#E2E8F0" strokeWidth="1" />
            <text x={L - 8} y={y(g) + 4} fontSize="11" textAnchor="end" fill="#64748B">{g}%</text>
          </g>
        ))}
        {n > 1 && <polyline points={line('listening')} fill="none" stroke="#005FAF" strokeWidth="2.5" />}
        {n > 1 && <polyline points={line('reading')} fill="none" stroke="#3F9928" strokeWidth="2.5" />}
        {dots('listening', '#005FAF')}
        {dots('reading', '#3F9928')}
        {points.map((p, i) => (
          <text key={i} x={x(i)} y={H - 10} fontSize="11" textAnchor="middle" fill="#64748B">
            {new Date(p.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </text>
        ))}
      </svg>
      <div className="legend">
        <span><i style={{ background: '#005FAF' }} />Listening</span>
        <span><i style={{ background: '#3F9928' }} />Reading</span>
      </div>
    </>
  )
}

function Bars({ items }: { items: AreaScore[] }) {
  return (
    <>
      {items.map((a) => (
        <div className="bar-row" key={a.key}>
          <div>{a.label}<div className="bar-note">{a.correct}/{a.total} correct</div></div>
          <div className="bar-track"><div className={`bar-fill ${levelClass(a.pct)}`} style={{ width: `${a.pct}%` }} /></div>
          <div className="bar-pct">{a.pct}%</div>
        </div>
      ))}
    </>
  )
}

function StudentAccount() {
  const { session, profile, loading: authLoading } = useAuthSession()
  const navigate = useNavigate()
  const [view, setView] = useState<View>('dashboard')
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [attempts, setAttempts] = useState<AttemptRow[]>([])
  const [stats, setStats] = useState<QuestionStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!session) {
      navigate('/login?next=/account', { replace: true })
      return
    }
    Promise.all([
      supabase
        .from('purchases')
        .select('id, status, amount_kwacha, currency, created_at, paid_at, tests ( id, title )')
        .order('created_at', { ascending: false }),
      supabase
        .from('attempts')
        .select('id, submitted_at, tests ( title ), results ( subtest_type, raw_score, scorable_count, feedback )')
        .eq('user_id', session.user.id)
        .order('submitted_at', { ascending: false }),
      supabase.rpc('student_question_stats'),
    ]).then(([purchaseRes, attemptRes, statRes]) => {
      setPurchases((purchaseRes.data as any[]) ?? [])
      setAttempts((attemptRes.data as any[]) ?? [])
      setStats((statRes.data as QuestionStat[]) ?? [])
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session])

  const analytics = useMemo(() => {
    const chrono = [...attempts].reverse()
    const trend: TrendPoint[] = chrono.map((a) => ({
      attemptId: a.id,
      date: a.submitted_at,
      title: a.tests?.title ?? 'Exam',
      listening: pctOf(a.results?.find((r) => r.subtest_type === 'listening')),
      reading: pctOf(a.results?.find((r) => r.subtest_type === 'reading')),
    }))
    const avg = (k: 'listening' | 'reading') => {
      const v = trend.map((t) => t[k]).filter((x): x is number => x !== null)
      return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null
    }
    const latestOf = (type: 'listening' | 'reading') =>
      attempts.map((a) => a.results?.find((r) => r.subtest_type === type)).find((r) => r && r.raw_score !== null)
    const latestL = latestOf('listening')
    const latestR = latestOf('reading')
    const parts = areaByPart(stats)
    const types = areaByType(stats)
    const ranked = [...parts].filter((p) => p.total >= 5).sort((a, b) => a.pct - b.pct)
    const weak = ranked.filter((p) => p.pct < 75).slice(0, 2)
    const strong = [...ranked].reverse().filter((p) => p.pct >= 60).slice(0, 2)
    const writingGraded = attempts
      .map((a) => a.results?.find((r) => r.subtest_type === 'writing'))
      .filter((r): r is AttemptResultRow => !!r && r.raw_score !== null)
    const criteria = writingCriteriaAverages(writingGraded.map((r) => r.feedback))
    return { trend, avgL: avg('listening'), avgR: avg('reading'), latestL, latestR, parts, types, weak, strong, writingGraded, criteria }
  }, [attempts, stats])

  async function handleSignOut() {
    await signOutStudent()
    navigate('/')
  }

  if (authLoading || !session) return null

  const name = profile?.full_name || session.user.email

  const groups: NavGroup[] = [
    {
      items: [
        { key: 'dashboard', label: 'Dashboard', icon: 'home' },
        { key: 'results', label: 'My results', icon: 'chart' },
        { key: 'purchases', label: 'Purchases', icon: 'card' },
      ],
    },
    {
      label: 'Practice',
      items: [
        { key: 'exams', label: 'Browse exams', icon: 'book', to: '/exams' },
      ],
    },
  ]
  const titles: Record<View, [string, string]> = {
    dashboard: [`Welcome back, ${String(name).split(' ')[0]}`, 'Your progress and where to focus next'],
    results: ['My results', 'Every exam you have completed'],
    purchases: ['Purchases', 'Exams you have bought'],
  }

  const latestScaled = (r?: AttemptResultRow) =>
    r && r.raw_score !== null && r.scorable_count === 42 ? listeningReadingScaledScore(r.raw_score) : null

  return (
    <PortalLayout
      portalName="Student portal"
      groups={groups}
      active={view}
      onSelect={(k) => setView(k as View)}
      userName={String(name)}
      userRole="student"
      onSignOut={handleSignOut}
      title={titles[view][0]}
      subtitle={titles[view][1]}
      actions={<button className="btn-primary" onClick={() => navigate('/exams')}>Take an exam</button>}
    >
      {loading ? (
        <p>Loading…</p>
      ) : view === 'dashboard' ? (
        attempts.length === 0 ? (
          <div className="panel empty-state">
            <strong>No exams completed yet</strong>
            Finish a practice exam and your scores, strengths and weak areas will appear here.
            <div style={{ marginTop: 16 }}>
              <button className="btn-primary" onClick={() => navigate('/exams')}>Browse exams</button>
            </div>
          </div>
        ) : (
          <>
            <div className="stat-grid">
              <StatCard icon="tests" label="Exams completed" value={attempts.length} />
              <StatCard icon="target" label="Average Listening" value={analytics.avgL === null ? '—' : `${analytics.avgL}%`}
                sub={latestScaled(analytics.latestL) !== null ? `Latest: ${latestScaled(analytics.latestL)} · grade ${gradeForScaledScore(latestScaled(analytics.latestL)!)}` : undefined} />
              <StatCard icon="target" tone="green" label="Average Reading" value={analytics.avgR === null ? '—' : `${analytics.avgR}%`}
                sub={latestScaled(analytics.latestR) !== null ? `Latest: ${latestScaled(analytics.latestR)} · grade ${gradeForScaledScore(latestScaled(analytics.latestR)!)}` : undefined} />
              <StatCard icon="trophy" tone="amber" label="Writing graded" value={analytics.writingGraded.length}
                sub={analytics.writingGraded.length ? `Latest: ${formatWriting(analytics.writingGraded[0].raw_score)}` : 'Awaiting tutor assessment'} />
            </div>

            <div className="panel">
              <h2>Score trend</h2>
              <p className="panel-sub">Percentage of questions correct in each exam, oldest to newest</p>
              <TrendChart points={analytics.trend} />
            </div>

            {stats.length > 0 && (
              <div className="panel-grid" style={{ marginBottom: 20 }}>
                <div className="panel">
                  <h2>Focus areas</h2>
                  <p className="panel-sub">Based on every question you have answered</p>
                  <div className="focus-list">
                    {analytics.weak.length === 0 && analytics.strong.length === 0 && (
                      <div className="empty-state">Answer a few more questions to see recommendations.</div>
                    )}
                    {analytics.weak.map((w) => (
                      <div className="focus-item weak" key={w.key}>
                        <div>
                          <strong>Work on: {w.label} ({w.pct}%)</strong>
                          {TIPS[`${w.subtest}-${w.key.split('-')[1]}`]}
                        </div>
                      </div>
                    ))}
                    {analytics.strong.map((w) => (
                      <div className="focus-item strong" key={w.key}>
                        <div>
                          <strong>Strength: {w.label} ({w.pct}%)</strong>
                          Keep this up. Revisit it occasionally so it stays sharp.
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="panel">
                  <h2>By question type</h2>
                  <p className="panel-sub">Which kinds of questions trip you up</p>
                  <Bars items={analytics.types} />
                </div>
              </div>
            )}

            {stats.length > 0 && (
              <div className="panel">
                <h2>Strong and weak areas by part</h2>
                <p className="panel-sub">Green is 75% or more, amber is 50–74%, red is under 50%</p>
                <div className="panel-grid">
                  <div><Bars items={analytics.parts.filter((p) => p.subtest === 'listening')} /></div>
                  <div><Bars items={analytics.parts.filter((p) => p.subtest === 'reading')} /></div>
                </div>
              </div>
            )}

            {analytics.criteria.length > 0 && (
              <div className="panel">
                <h2>Writing criteria</h2>
                <p className="panel-sub">Average across your graded letters</p>
                {analytics.criteria.map((c) => (
                  <div className="bar-row" key={c.name}>
                    <div>{c.name}<div className="bar-note">{c.count} letter{c.count === 1 ? '' : 's'}</div></div>
                    <div className="bar-track"><div className={`bar-fill ${levelClass(c.pct)}`} style={{ width: `${c.pct}%` }} /></div>
                    <div className="bar-pct">{c.pct}%</div>
                  </div>
                ))}
              </div>
            )}

            {stats.length === 0 && (
              <p style={{ color: 'var(--color-ink-muted)', fontSize: 13 }}>
                Detailed strengths and weaknesses will appear after your next exam.
              </p>
            )}
          </>
        )
      ) : view === 'results' ? (
        attempts.length === 0 ? (
          <div className="panel empty-state"><strong>No results yet</strong>You haven't completed an exam yet.</div>
        ) : (
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="tutor-table-wrap" style={{ marginTop: 0 }}>
              <table className="tutor-table">
                <thead><tr><th>Exam</th><th>Scores</th><th>Date</th></tr></thead>
                <tbody>
                  {attempts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.tests?.title ?? 'Unknown exam'}</td>
                      <td>{scoreSummary(a.results ?? [])}</td>
                      <td>{new Date(a.submitted_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : purchases.length === 0 ? (
        <div className="panel empty-state"><strong>No purchases yet</strong>You haven't bought any exams yet.</div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="tutor-table-wrap" style={{ marginTop: 0 }}>
            <table className="tutor-table">
              <thead><tr><th>Exam</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td>{p.tests?.title ?? 'Unknown exam'}</td>
                    <td>{p.amount_kwacha === 0 ? 'Free' : `${p.currency} ${p.amount_kwacha}`}</td>
                    <td>{p.status === 'paid' || p.status === 'fake_paid' ? 'Paid' : p.status}</td>
                    <td>{new Date(p.paid_at ?? p.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PortalLayout>
  )
}

export default StudentAccount
