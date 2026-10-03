import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import SiteNav from './SiteNav'

interface RequireAdminLoginProps {
  children: React.ReactNode
}

/**
 * Gate for the admin panel (financials + user management). Deliberately
 * stricter than RequireTutorLogin: a tutor account does NOT pass here,
 * only role = 'admin'. Modeled closely on RequireTutorLogin so the two
 * gates behave identically from the outside.
 */
function RequireAdminLogin({ children }: RequireAdminLoginProps) {
  const [session, setSession] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  useEffect(() => {
    async function checkRole(userId: string) {
      const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
      setIsAdmin(data?.role === 'admin')
      setCheckingSession(false)
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) checkRole(data.session.user.id)
      else setCheckingSession(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) checkRole(newSession.user.id)
      else {
        setIsAdmin(false)
        setCheckingSession(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setLoginError(error.message)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
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
            <span className="eyebrow">Admin panel</span>
            <h1>Admin login</h1>
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

  if (!isAdmin) {
    return (
      <>
        <SiteNav />
        <div className="tutor-dashboard-page">
          <div className="tutor-login-card card">
            <span className="eyebrow">Admin panel</span>
            <h1>This account isn't an admin</h1>
            <p>Sign in with an admin account to reach this page.</p>
            <button className="btn-secondary" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <SiteNav />
      <div className="tutor-dashboard-header" style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 0' }}>
        <div />
        <button className="btn-secondary" onClick={handleSignOut}>
          Sign out
        </button>
      </div>
      {children}
    </>
  )
}

export default RequireAdminLogin
