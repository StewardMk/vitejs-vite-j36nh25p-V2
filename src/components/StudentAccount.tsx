import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthSession, signOutStudent } from '../lib/studentAuth'
import { formatListeningReading, formatWriting } from '../lib/oetGrading'
import SiteNav from './SiteNav'

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
}

interface AttemptRow {
  id: string
  submitted_at: string
  tests: { title: string } | null
  results: AttemptResultRow[]
}

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

function StudentAccount() {
  const { session, profile, loading: authLoading } = useAuthSession()
  const navigate = useNavigate()
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [attempts, setAttempts] = useState<AttemptRow[]>([])
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
        .select('id, submitted_at, tests ( title ), results ( subtest_type, raw_score, scorable_count )')
        .eq('user_id', session.user.id)
        .order('submitted_at', { ascending: false }),
    ]).then(([purchaseRes, attemptRes]) => {
      setPurchases((purchaseRes.data as any[]) ?? [])
      setAttempts((attemptRes.data as any[]) ?? [])
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session])

  async function handleSignOut() {
    await signOutStudent()
    navigate('/')
  }

  if (authLoading || !session) return null

  return (
    <>
      <SiteNav />
      <div className="tutor-dashboard-page">
        <div className="tutor-dashboard-header">
          <div>
            <span className="eyebrow">My account</span>
            <h1>{profile?.full_name || session.user.email}</h1>
          </div>
          <button className="btn-secondary" onClick={handleSignOut}>
            Sign out
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <Link to="/exams" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Browse exams
          </Link>
        </div>

        <h2 style={{ fontSize: 18, marginBottom: 12 }}>My results</h2>

        {loading ? (
          <p>Loading…</p>
        ) : attempts.length === 0 ? (
          <p style={{ marginBottom: 32 }}>
            You haven't completed an exam yet. Results from exams taken before this page existed
            won't appear here.
          </p>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 32 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border-light)' }}>
                  <th style={{ padding: '12px 16px' }}>Exam</th>
                  <th style={{ padding: '12px 16px' }}>Scores</th>
                  <th style={{ padding: '12px 16px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px 16px' }}>{a.tests?.title ?? 'Unknown exam'}</td>
                    <td style={{ padding: '12px 16px' }}>{scoreSummary(a.results ?? [])}</td>
                    <td style={{ padding: '12px 16px' }}>{new Date(a.submitted_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Purchase history</h2>

        {loading ? (
          <p>Loading…</p>
        ) : purchases.length === 0 ? (
          <p>You haven't bought any exams yet.</p>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border-light)' }}>
                  <th style={{ padding: '12px 16px' }}>Exam</th>
                  <th style={{ padding: '12px 16px' }}>Amount</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px 16px' }}>{p.tests?.title ?? 'Unknown exam'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {p.amount_kwacha === 0 ? 'Free' : `${p.currency} ${p.amount_kwacha}`}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {p.status === 'paid' || p.status === 'fake_paid' ? 'Paid' : p.status}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {new Date(p.paid_at ?? p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

export default StudentAccount
