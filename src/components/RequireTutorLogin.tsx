import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface RequireTutorLoginProps {
  children: React.ReactNode
}

function RequireTutorLogin({ children }: RequireTutorLoginProps) {
  const [session, setSession] = useState<any>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

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