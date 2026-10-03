import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthSession, signOutStudent } from '../lib/studentAuth'
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

function StudentAccount() {
  const { session, profile, loading: authLoading } = useAuthSession()
  const navigate = useNavigate()
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!session) {
      navigate('/login?next=/account', { replace: true })
      return
    }

    supabase
      .from('purchases')
      .select('id, status, amount_kwacha, currency, created_at, paid_at, tests ( id, title )')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPurchases((data as any[]) ?? [])
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
