import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface Profile {
  id: string
  full_name: string | null
  role: 'student' | 'tutor' | 'admin'
  /** false = new account still waiting for an admin to approve it. */
  is_approved?: boolean
}

/** Students must be approved by an admin; tutors and admins never wait. */
export function isPendingApproval(profile: Pick<Profile, 'role' | 'is_approved'> | null) {
  return !!profile && profile.role === 'student' && profile.is_approved === false
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
        .select('*')
        .eq('id', userId)
        .single()
      if (!active) return
      if (isPendingApproval(data as Profile | null)) {
        // Not approved yet: end the session so the rest of the site treats
        // this visitor as signed out.
        await supabase.auth.signOut()
        return
      }
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
  const result = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })
  // New accounts wait for admin approval, so never keep the new session.
  if (!result.error && result.data.session) await supabase.auth.signOut()
  return result
}

export async function signInStudent(email: string, password: string) {
  const result = await supabase.auth.signInWithPassword({ email, password })
  if (result.error || !result.data.user) return { ...result, pending: false }
  const { data } = await supabase.from('profiles').select('*').eq('id', result.data.user.id).single()
  if (isPendingApproval(data as Profile | null)) {
    await supabase.auth.signOut()
    return { ...result, pending: true }
  }
  return { ...result, pending: false }
}

export async function signOutStudent() {
  return supabase.auth.signOut()
}
