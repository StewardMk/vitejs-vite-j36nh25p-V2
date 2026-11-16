// Shared helpers for the AI edge functions.
//
// requireStaff() makes sure the caller is a signed-in tutor or admin. The
// functions spend Anthropic API credit, so a student (or anyone holding only
// the public anon key) must not be able to trigger them.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  })
}

export async function requireStaff(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'Sign in as a tutor or admin to use this.' }, 401)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'Your session has expired. Sign in again.' }, 401)
  }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (!profile || (profile.role !== 'tutor' && profile.role !== 'admin')) {
    return jsonResponse({ error: 'Only tutors and admins can use this.' }, 403)
  }
  return null
}
