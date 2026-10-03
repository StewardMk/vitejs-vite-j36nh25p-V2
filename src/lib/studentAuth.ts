import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface Profile {
  id: string
  full_name: string | null
  role: 'student' | 'tutor'
}

/**
 * Tracks the current Supabase Auth session plus that user's `profiles`
 * row (full name + role). Used by every student-facing page that needs
 * to know "is someone logged in, and what's their name" -- the catalog,
 * the account page, and the login/sign-up page itself.
 */
export function useAuthSession() {
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadProfile(userId: string) {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', userId)
        .single()
      if (!active) return
      setProfile((data as Profile) ?? null)
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) loadProfile(data.session.user.id)
      else setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) loadProfile(newSession.user.id)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return { session, profile, loading }
}

export async function signUpStudent(email: string, password: string, fullName: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })
}

export async function signInStudent(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOutStudent() {
  return supabase.auth.signOut()
}
