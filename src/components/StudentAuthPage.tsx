import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { signUpStudent, signInStudent } from '../lib/studentAuth'
import SiteNav from './SiteNav'

function extractErrorMessage(error: any) {
  return error?.message || 'Something went wrong. Please try again.'
}

/**
 * Public sign-up / log-in page for students. Reuses the same visual
 * language as StudentEntry (the access-code screen) so the two don't
 * feel like different products.
 */
function StudentAuthPage() {
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'signup'>(
    searchParams.get('mode') === 'login' ? 'login' : 'signup',
  )
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkEmail, setCheckEmail] = useState(false)
  const [awaitingApproval, setAwaitingApproval] = useState(false)

  const navigate = useNavigate()
  const next = searchParams.get('next') || '/exams'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    if (mode === 'signup' && !fullName.trim()) {
      setError('Enter your full name.')
      return
    }

    setLoading(true)

    if (mode === 'signup') {
      const { data, error: signUpError } = await signUpStudent(email.trim(), password, fullName.trim())
      setLoading(false)
      if (signUpError) {
        setError(extractErrorMessage(signUpError))
        return
      }
      if (data.user && !data.session && !data.user.email_confirmed_at && data.user.identities?.length) {
        // Email confirmation is turned on for this project -- the student
        // must click the link in their inbox first.
        setCheckEmail(true)
        return
      }
      // Every new account waits for an admin to approve it.
      setAwaitingApproval(true)
      return
    }

    const { error: signInError, pending } = await signInStudent(email.trim(), password)
    setLoading(false)
    if (signInError) {
      setError(extractErrorMessage(signInError))
      return
    }
    if (pending) {
      setAwaitingApproval(true)
      return
    }
    navigate(next, { replace: true })
  }

  if (awaitingApproval) {
    return (
      <>
        <SiteNav />
        <div className="student-entry-page">
          <div className="student-entry-layout">
            <div className="student-entry-card" style={{ margin: '0 auto' }}>
              <h2>Waiting for approval</h2>
              <p className="student-entry-card-subtitle">
                Your account is created but an administrator has to approve it before you can
                sign in and see the practice tests. Please try again later.
              </p>
              <button
                className="btn-primary student-entry-submit"
                onClick={() => { setAwaitingApproval(false); setMode('login'); setPassword('') }}
              >
                Back to log in
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (checkEmail) {
    return (
      <>
        <SiteNav />
        <div className="student-entry-page">
          <div className="student-entry-layout">
            <div className="student-entry-card" style={{ margin: '0 auto' }}>
              <h2>Check your email</h2>
              <p className="student-entry-card-subtitle">
                We sent a confirmation link to <strong>{email}</strong>. Click it, then come back
                here and log in.
              </p>
              <button className="btn-primary student-entry-submit" onClick={() => setMode('login')}>
                Go to log in
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <SiteNav />
      <div className="student-entry-page">
      <div className="student-entry-layout">
        <div className="student-entry-intro">
          <span className="eyebrow">OET Training Centre</span>
          <h1>
            Practice tests,
            <span> on your own time.</span>
          </h1>
          <p>
            Create an account to buy and take full computer-based OET practice exams --
            Listening, Reading and Writing, graded and ready to review.
          </p>
        </div>

        <div className="student-entry-card">
          <h2>{mode === 'signup' ? 'Create your account' : 'Log in'}</h2>
          <p className="student-entry-card-subtitle">
            {mode === 'signup'
              ? 'Takes less than a minute.'
              : 'Welcome back -- enter your details to continue.'}
          </p>

          <form className="student-entry-form" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="student-entry-field">
                <label htmlFor="full-name">Full name</label>
                <input
                  id="full-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="As you'd like it to appear on your results"
                  autoComplete="name"
                  disabled={loading}
                />
              </div>
            )}

            <div className="student-entry-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="student-entry-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="student-entry-error">
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="btn-primary student-entry-submit" disabled={loading}>
              {loading
                ? mode === 'signup'
                  ? 'Creating account...'
                  : 'Logging in...'
                : mode === 'signup'
                ? 'Create account'
                : 'Log in'}
            </button>
          </form>

          <div className="student-entry-card-footer">
            {mode === 'signup' ? (
              <span>
                Already have an account?{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setError('') }}>
                  Log in
                </a>
              </span>
            ) : (
              <span>
                New here?{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); setMode('signup'); setError('') }}>
                  Create an account
                </a>
              </span>
            )}
          </div>

          <div className="student-entry-card-footer">
            <Link to="/exam">Have an access code from your tutor instead?</Link>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}

export default StudentAuthPage
