import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

interface PurchaseRow {
  id: string
  user_email: string
  user_name: string | null
  test_title: string
  amount_kwacha: number
  currency: string
  status: string
  provider: string
  created_at: string
  paid_at: string | null
}

interface UserRow {
  id: string
  email: string
  full_name: string | null
  role: 'student' | 'tutor' | 'admin'
  is_banned: boolean
  created_at: string
}

interface UserDetail {
  user: UserRow
  purchases: { test_title: string; amount_kwacha: number; status: string; created_at: string; paid_at: string | null }[]
  attempts: { test_title: string; submitted_at: string; subtest_type: string; raw_score: number | null; scorable_count: number | null }[]
}

const PAID_STATUSES = ['paid', 'fake_paid']

function formatKwacha(n: number) {
  return `K${n.toLocaleString()}`
}

function dayKey(iso: string) {
  return iso.slice(0, 10)
}

function MiniBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, padding: '0 4px' }}>
      {data.map((d) => (
        <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div
            title={`${d.label}: ${formatKwacha(d.value)}`}
            style={{
              width: '100%',
              maxWidth: 28,
              height: `${Math.max(2, (d.value / max) * 90)}px`,
              background: 'var(--color-primary)',
              borderRadius: '4px 4px 0 0',
            }}
          />
          <span style={{ fontSize: 9, color: 'var(--color-ink-muted)', whiteSpace: 'nowrap' }}>
            {d.label.slice(5)}
          </span>
        </div>
      ))}
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function AdminPanel() {
  const [tab, setTab] = useState<'overview' | 'transactions' | 'users'>('overview')
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [detailUserId, setDetailUserId] = useState<string | null>(null)
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [userActionError, setUserActionError] = useState<Record<string, string>>({})
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    setLoadError('')

    const [{ data: purchaseData, error: purchaseError }, { data: userData, error: userError }] = await Promise.all([
      supabase.rpc('admin_list_purchases'),
      supabase.rpc('admin_list_users'),
    ])

    setLoading(false)

    if (purchaseError || userError) {
      setLoadError(purchaseError?.message ?? userError?.message ?? 'Could not load admin data.')
      return
    }

    setPurchases((purchaseData as PurchaseRow[]) ?? [])
    setUsers((userData as UserRow[]) ?? [])
  }

  const revenueRows = useMemo(() => purchases.filter((p) => PAID_STATUSES.includes(p.status)), [purchases])

  const totalRevenue = useMemo(() => revenueRows.reduce((sum, p) => sum + p.amount_kwacha, 0), [revenueRows])

  const trend = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const p of revenueRows) {
      const key = dayKey(p.paid_at ?? p.created_at)
      byDay.set(key, (byDay.get(key) ?? 0) + p.amount_kwacha)
    }
    const days = Array.from(byDay.keys()).sort().slice(-14)
    return days.map((label) => ({ label, value: byDay.get(label) ?? 0 }))
  }, [revenueRows])

  const perExam = useMemo(() => {
    const byExam = new Map<string, { revenue: number; count: number }>()
    for (const p of revenueRows) {
      const existing = byExam.get(p.test_title) ?? { revenue: 0, count: 0 }
      existing.revenue += p.amount_kwacha
      existing.count += 1
      byExam.set(p.test_title, existing)
    }
    return Array.from(byExam.entries())
      .map(([title, stats]) => ({ title, ...stats }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [revenueRows])

  async function openUserDetail(userId: string) {
    setDetailUserId(userId)
    setDetail(null)
    setDetailLoading(true)
    const { data, error } = await supabase.rpc('admin_user_detail', { p_user_id: userId })
    setDetailLoading(false)
    if (error || data?.error) {
      setUserActionError((prev) => ({ ...prev, [userId]: error?.message ?? data?.error }))
      return
    }
    setDetail(data as UserDetail)
  }

  async function changeRole(userId: string, role: string) {
    setBusyUserId(userId)
    setUserActionError((prev) => ({ ...prev, [userId]: '' }))
    const { data, error } = await supabase.rpc('admin_set_user_role', { p_user_id: userId, p_role: role })
    setBusyUserId(null)
    if (error || data?.error) {
      setUserActionError((prev) => ({ ...prev, [userId]: error?.message ?? data?.error }))
      return
    }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: role as UserRow['role'] } : u)))
  }

  async function toggleBan(userId: string, banned: boolean) {
    setBusyUserId(userId)
    setUserActionError((prev) => ({ ...prev, [userId]: '' }))
    const { data, error } = await supabase.rpc('admin_set_user_banned', { p_user_id: userId, p_banned: banned })
    setBusyUserId(null)
    if (error || data?.error) {
      setUserActionError((prev) => ({ ...prev, [userId]: error?.message ?? data?.error }))
      return
    }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_banned: banned } : u)))
  }

  return (
    <div className="tutor-dashboard-page" style={{ maxWidth: 1100 }}>
      <div className="tutor-dashboard-header">
        <div>
          <span className="eyebrow">Admin panel</span>
          <h1>Financials &amp; user management</h1>
        </div>
      </div>

      <div className="tutor-tabs">
        <button className={`tutor-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
          Overview
        </button>
        <button className={`tutor-tab ${tab === 'transactions' ? 'active' : ''}`} onClick={() => setTab('transactions')}>
          Transactions
        </button>
        <button className={`tutor-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          Users
        </button>
      </div>

      {loadError && (
        <p className="student-entry-error" style={{ marginBottom: 16 }}>
          <span>{loadError}</span>
        </p>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : tab === 'overview' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            <StatTile label="Total revenue" value={formatKwacha(totalRevenue)} />
            <StatTile label="Paid transactions" value={String(revenueRows.length)} />
            <StatTile label="All transactions" value={String(purchases.length)} />
            <StatTile label="Registered users" value={String(users.length)} />
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginTop: 0 }}>Revenue, last 14 days</h3>
            {trend.length === 0 ? <p>No paid transactions yet.</p> : <MiniBarChart data={trend} />}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Revenue by exam</h3>
            {perExam.length === 0 ? (
              <p>No paid transactions yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border-light)' }}>
                    <th style={{ padding: '8px 4px' }}>Exam</th>
                    <th style={{ padding: '8px 4px' }}>Sales</th>
                    <th style={{ padding: '8px 4px' }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {perExam.map((row) => (
                    <tr key={row.title} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '8px 4px' }}>{row.title}</td>
                      <td style={{ padding: '8px 4px' }}>{row.count}</td>
                      <td style={{ padding: '8px 4px' }}>{formatKwacha(row.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : tab === 'transactions' ? (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border-light)' }}>
                <th style={{ padding: '12px 16px' }}>Student</th>
                <th style={{ padding: '12px 16px' }}>Exam</th>
                <th style={{ padding: '12px 16px' }}>Amount</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Provider</th>
                <th style={{ padding: '12px 16px' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 ? (
                <tr>
                  <td style={{ padding: 16 }} colSpan={6}>
                    No transactions yet.
                  </td>
                </tr>
              ) : (
                purchases.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px 16px' }}>{p.user_name || p.user_email}</td>
                    <td style={{ padding: '12px 16px' }}>{p.test_title}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {p.amount_kwacha === 0 ? 'Free' : `${p.currency} ${p.amount_kwacha}`}
                    </td>
                    <td style={{ padding: '12px 16px' }}>{p.status}</td>
                    <td style={{ padding: '12px 16px' }}>{p.provider}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {new Date(p.paid_at ?? p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border-light)' }}>
                <th style={{ padding: '12px 16px' }}>Name</th>
                <th style={{ padding: '12px 16px' }}>Email</th>
                <th style={{ padding: '12px 16px' }}>Role</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Joined</th>
                <th style={{ padding: '12px 16px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={{ padding: '12px 16px' }}>{u.full_name || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>{u.email}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <select
                      value={u.role}
                      disabled={busyUserId === u.id}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                    >
                      <option value="student">student</option>
                      <option value="tutor">tutor</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {u.is_banned ? <span style={{ color: 'var(--color-danger)' }}>Banned</span> : 'Active'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn-secondary" onClick={() => openUserDetail(u.id)}>
                      View
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={busyUserId === u.id}
                      onClick={() => toggleBan(u.id, !u.is_banned)}
                    >
                      {u.is_banned ? 'Unban' : 'Ban'}
                    </button>
                  </td>
                  {userActionError[u.id] && (
                    <td style={{ padding: '0 16px', color: 'var(--color-danger)', fontSize: 12 }} colSpan={6}>
                      {userActionError[u.id]}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailUserId && (
        <div className="modal-overlay" role="presentation" onClick={() => setDetailUserId(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header plain">
              <h3>User detail</h3>
            </div>
            <div className="modal-body" style={{ textAlign: 'left', alignItems: 'stretch' }}>
              {detailLoading || !detail ? (
                <p>Loading…</p>
              ) : (
                <>
                  <p>
                    <strong>{detail.user.full_name || detail.user.email}</strong>
                    <br />
                    {detail.user.email} · {detail.user.role}
                    {detail.user.is_banned ? ' · banned' : ''}
                  </p>

                  <h4>Purchases ({detail.purchases.length})</h4>
                  {detail.purchases.length === 0 ? (
                    <p style={{ fontSize: 13 }}>No purchases.</p>
                  ) : (
                    <ul style={{ fontSize: 13, paddingLeft: 18 }}>
                      {detail.purchases.map((p, i) => (
                        <li key={i}>
                          {p.test_title} — {formatKwacha(p.amount_kwacha)} ({p.status})
                        </li>
                      ))}
                    </ul>
                  )}

                  <h4>Exam attempts ({detail.attempts.length})</h4>
                  {detail.attempts.length === 0 ? (
                    <p style={{ fontSize: 13 }}>
                      No linked attempts yet. (Self-service attempts aren't connected to accounts yet -- see the
                      pending follow-up on that.)
                    </p>
                  ) : (
                    <ul style={{ fontSize: 13, paddingLeft: 18 }}>
                      {detail.attempts.map((a, i) => (
                        <li key={i}>
                          {a.test_title} — {a.subtest_type}: {a.raw_score ?? '—'}/{a.scorable_count ?? '—'}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setDetailUserId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPanel
