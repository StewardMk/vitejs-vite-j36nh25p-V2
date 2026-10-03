import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface RequireTutorLoginProps {
  children: React.ReactNode
}

function RequireTutorLogin({ children }: RequireTutorLoginProps) {
  const [session, setSession] = useState<any>(null)
  const [isTutor, setIsTutor] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  useEffect(() => {
    async function checkRole(userId: string) {
      const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
      setIsTutor(data?.role === 'tutor')
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
        setIsTutor(false)
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

  if (!isTutor) {
    return (
      <div style={{ maxWidth: 400, margin: '40px auto', padding: 24, textAlign: 'center' }}>
        <h2>Tutor access only</h2>
        <p style={{ color: 'crimson' }}>
          This account isn't set up as a tutor account, so it can't access this page.
        </p>
        <button onClick={handleSignOut}>Sign out</button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ textAlign: 'right', padding: '8px 24px' }}>
        <button onClick={handleSignOut}>Sign out</button>
      </div>
      {children}
    </div>
  )
}

export default RequireTutorLogin