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

function ExamCatalog({ embedded = false }: { embedded?: boolean }) {
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
      navigate('/login?next=/account', { replace: true })
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

  function loadLencoScript(url: string) {
    return new Promise<void>((resolve, reject) => {
      if ((window as any).LencoPay) return resolve()
      const existing = document.querySelector(`script[src="${url}"]`)
      if (existing) {
        existing.addEventListener('load', () => resolve())
        return
      }
      const el = document.createElement('script')
      el.src = url
      el.onload = () => resolve()
      el.onerror = () => reject(new Error('Could not load the payment window. Check your connection and try again.'))
      document.head.appendChild(el)
    })
  }

  // Ask the server whether Lenco has confirmed the payment, retrying briefly for slow mobile money.
  async function confirmWithServer(reference: string) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { data } = await supabase.functions.invoke('lenco-pay', { body: { action: 'verify', reference } })
      if (data?.ok) return true
      if (data?.status && !['pending', 'unknown'].includes(data.status)) return false
      await new Promise((r) => setTimeout(r, 3000))
    }
    return false
  }

  async function confirmPurchase(test: CatalogTest) {
    setBusyTestId(test.id)
    setActionError('')
    setPendingBuy(null)

    const { data, error } = await supabase.functions.invoke('lenco-pay', { body: { action: 'init', testId: test.id } })
    if (error || data?.error) {
      setBusyTestId(null)
      setActionError(
        data?.code === 'not_configured'
          ? 'Online payments are not available yet. Please try again later.'
          : data?.error ?? error?.message ?? 'Could not start the payment.'
      )
      return
    }
    if (data.alreadyOwned) {
      setOwned((prev) => new Set(prev).add(test.id))
      await startExam(test.id)
      return
    }

    try {
      await loadLencoScript(data.widgetUrl)
    } catch (e: any) {
      setBusyTestId(null)
      setActionError(e.message)
      return
    }

    const finish = async () => {
      setActionError('')
      const ok = await confirmWithServer(data.reference)
      if (ok) {
        setOwned((prev) => new Set(prev).add(test.id))
        await startExam(test.id)
      } else {
        setBusyTestId(null)
        setActionError('We have not received confirmation of your payment yet. If money left your account, refresh this page in a few minutes. The exam will unlock automatically.')
      }
    }

    const [firstName, ...rest] = String(data.name || '').split(' ')
    ;(window as any).LencoPay.getPaid({
      key: data.publicKey,
      reference: data.reference,
      email: data.email,
      amount: data.amount,
      currency: data.currency,
      label: data.label,
      channels: ['mobile-money', 'card'],
      customer: { firstName: firstName || undefined, lastName: rest.join(' ') || undefined },
      onSuccess: () => { void finish() },
      onConfirmationPending: () => { void finish() },
      onClose: () => setBusyTestId(null),
    })
  }

  return (
    <>
      {!embedded && <SiteNav />}
      <div className={embedded ? undefined : 'tutor-dashboard-page'}>
        {!embedded && (
          <div className="tutor-dashboard-header">
            <div>
              <span className="eyebrow">Exam catalog</span>
              <h1>Choose a practice exam</h1>
            </div>
          </div>
        )}

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
