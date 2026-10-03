import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthSession } from '../lib/studentAuth'
import { saveExamSession } from '../lib/examSession'
import SiteNav from './SiteNav'
import ConfirmModal from './ConfirmModal'

interface CatalogTest {
  id: string
  title: string
  profession: string | null
  description: string | null
  price_kwacha: number
  is_published: boolean
}

function formatPrice(kwacha: number) {
  if (kwacha === 0) return 'Free'
  return `K${kwacha.toLocaleString()}`
}

function ExamCatalog() {
  const { session, profile, loading: authLoading } = useAuthSession()
  const navigate = useNavigate()

  const [tests, setTests] = useState<CatalogTest[]>([])
  const [owned, setOwned] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [pendingBuy, setPendingBuy] = useState<CatalogTest | null>(null)
  const [busyTestId, setBusyTestId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!session) {
      navigate('/login?next=/exams', { replace: true })
      return
    }
    loadCatalog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session])

  async function loadCatalog() {
    setLoading(true)

    const [{ data: catalogData, error: catalogError }, { data: purchaseData }] = await Promise.all([
      supabase.from('exam_catalog').select('*').order('created_at', { ascending: false }),
      supabase
        .from('purchases')
        .select('test_id, status')
        .in('status', ['paid', 'fake_paid']),
    ])

    setLoading(false)

    if (catalogError) {
      setActionError(catalogError.message)
      return
    }

    setTests((catalogData as CatalogTest[]) ?? [])
    setOwned(new Set((purchaseData ?? []).map((p: any) => p.test_id)))
  }

  async function startExam(testId: string) {
    setBusyTestId(testId)
    setActionError('')

    const { data, error } = await supabase.rpc('start_purchased_exam', { p_test_id: testId })

    setBusyTestId(null)

    if (error) {
      setActionError(error.message)
      return
    }
    if (!data?.test) {
      setActionError(data?.error ?? 'Could not start that exam.')
      return
    }

    saveExamSession({
      test: data.test,
      studentName: profile?.full_name || session.user.email,
    })
    navigate('/exam')
  }

  async function confirmPurchase(test: CatalogTest) {
    setBusyTestId(test.id)
    setActionError('')

    const { data, error } = await supabase.rpc('create_fake_purchase', { p_test_id: test.id })

    if (error || data?.error) {
      setBusyTestId(null)
      setActionError(error?.message ?? data?.error ?? 'Payment could not be completed.')
      setPendingBuy(null)
      return
    }

    setPendingBuy(null)
    setOwned((prev) => new Set(prev).add(test.id))
    await startExam(test.id)
  }

  return (
    <>
      <SiteNav />
      <div className="tutor-dashboard-page">
        <div className="tutor-dashboard-header">
          <div>
            <span className="eyebrow">Exam catalog</span>
            <h1>Choose a practice exam</h1>
          </div>
        </div>

        {actionError && (
          <p className="student-entry-error" style={{ marginBottom: 16 }}>
            <span>{actionError}</span>
          </p>
        )}

        {loading ? (
          <p>Loading exams…</p>
        ) : tests.length === 0 ? (
          <p>No exams are published yet. Check back soon.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 20,
            }}
          >
            {tests.map((test) => {
              const isOwned = owned.has(test.id) || test.price_kwacha === 0
              const isBusy = busyTestId === test.id
              return (
                <div key={test.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <span className="folder-tab">{test.profession ?? 'OET'}</span>
                    <h3 style={{ margin: '10px 0 6px' }}>{test.title}</h3>
                    {test.description && (
                      <p style={{ color: 'var(--color-text-secondary, #555)', fontSize: 14 }}>
                        {test.description}
                      </p>
                    )}
                  </div>

                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong>{formatPrice(test.price_kwacha)}</strong>

                    {isOwned ? (
                      <button className="btn-primary" disabled={isBusy} onClick={() => startExam(test.id)}>
                        {isBusy ? 'Starting…' : 'Start exam'}
                      </button>
                    ) : (
                      <button className="btn-primary" disabled={isBusy} onClick={() => setPendingBuy(test)}>
                        {isBusy ? 'Processing…' : `Buy for ${formatPrice(test.price_kwacha)}`}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!pendingBuy}
        variant="plain"
        title="Confirm purchase"
        message={
          pendingBuy
            ? `Buy access to "${pendingBuy.title}" for ${formatPrice(pendingBuy.price_kwacha)}? You'll be able to start it right away.`
            : ''
        }
        confirmLabel="Confirm & pay"
        cancelLabel="Cancel"
        onConfirm={() => pendingBuy && confirmPurchase(pendingBuy)}
        onCancel={() => setPendingBuy(null)}
      />
    </>
  )
}

export default ExamCatalog
