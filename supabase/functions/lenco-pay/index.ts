// Supabase Edge Function: lenco-pay
//
// Real payments through Lenco (Zambia: mobile money + cards, ZMW).
//
//   POST { action: 'init',   testId }     signed-in student. Creates a pending purchase at the
//                                          price stored in the database and returns what the
//                                          browser needs to open the Lenco widget.
//   POST { action: 'verify', reference }  signed-in student. Asks Lenco whether that payment
//                                          succeeded and, if the amount matches, marks it paid.
//   POST (header X-Lenco-Signature)       Lenco webhook. Verified by signature, then re-checked
//                                          with Lenco before anything is marked paid.
//
// The browser is never trusted: the amount comes from public.tests, and a purchase is only
// marked paid after this function has asked Lenco itself.
//
// Secrets: LENCO_SECRET_KEY, LENCO_PUBLIC_KEY, LENCO_ENV ('sandbox' or 'production'; default
// sandbox), optional LENCO_API_BASE (default https://api.lenco.co/access/v2).
// Deploy with JWT verification OFF (the webhook has no user token; actions check it themselves).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

const SECRET = Deno.env.get('LENCO_SECRET_KEY')
const PUBLIC_KEY = Deno.env.get('LENCO_PUBLIC_KEY')
const ENV = Deno.env.get('LENCO_ENV') === 'production' ? 'production' : 'sandbox'
const API_BASE = Deno.env.get('LENCO_API_BASE') ?? 'https://api.lenco.co/access/v2'
const WIDGET_URL = ENV === 'production' ? 'https://pay.lenco.co/js/v1/inline.js' : 'https://pay.sandbox.lenco.co/js/v1/inline.js'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function webhookSignature(rawBody: string): Promise<string> {
  // Lenco: key = SHA256(api secret); signature = HMAC-SHA512(key, payload), hex.
  const enc = new TextEncoder()
  const key = hex(await crypto.subtle.digest('SHA-256', enc.encode(SECRET!)))
  const hmacKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', hmacKey, enc.encode(rawBody)))
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

/** Ask Lenco about a reference, then mark the matching pending purchase paid. */
async function settle(reference: string): Promise<{ ok: boolean; status: string; message?: string }> {
  const { data: purchase } = await admin
    .from('purchases')
    .select('id, user_id, test_id, amount_kwacha, currency, status, provider')
    .eq('provider', 'lenco')
    .eq('provider_reference', reference)
    .maybeSingle()
  if (!purchase) return { ok: false, status: 'unknown', message: 'No purchase with that reference.' }
  if (purchase.status === 'paid') return { ok: true, status: 'paid' }

  const res = await fetch(`${API_BASE}/collections/status/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body?.data) return { ok: false, status: 'pending', message: body?.message ?? 'Lenco could not confirm this payment yet.' }

  const d = body.data
  if (d.status !== 'successful') return { ok: false, status: String(d.status ?? 'pending'), message: d.reasonForFailure ?? undefined }

  // The amount must cover the price and the currency must match.
  if (Number(d.amount) < Number(purchase.amount_kwacha) || String(d.currency ?? 'ZMW') !== purchase.currency) {
    return { ok: false, status: 'amount_mismatch', message: 'Amount or currency does not match the exam price.' }
  }

  // Someone may already own this exam (another paid purchase): don't violate the unique index.
  const { data: already } = await admin
    .from('purchases').select('id').eq('user_id', purchase.user_id).eq('test_id', purchase.test_id)
    .in('status', ['paid', 'fake_paid']).maybeSingle()
  if (already) {
    await admin.from('purchases').update({ status: 'duplicate_paid', paid_at: new Date().toISOString() }).eq('id', purchase.id)
    return { ok: true, status: 'paid' }
  }

  const { error } = await admin
    .from('purchases').update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', purchase.id).eq('status', 'pending')
  if (error) return { ok: false, status: 'error', message: error.message }
  return { ok: true, status: 'paid' }
}

async function getUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data } = await userClient.auth.getUser()
  return data?.user ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!SECRET || !PUBLIC_KEY) return json({ error: 'Online payments are not set up yet.', code: 'not_configured' }, 503)

  try {
    // ---- Lenco webhook
    const signature = req.headers.get('x-lenco-signature')
    if (signature) {
      const raw = await req.text()
      if (!safeEqual(signature.toLowerCase(), await webhookSignature(raw))) return json({ error: 'Bad signature' }, 401)
      const evt = JSON.parse(raw)
      const data = evt?.data ?? {}
      const reference = data.reference ?? data.clientReference ?? data.transactionReference
      const ev = String(evt?.event ?? '')
      if (reference && (ev.includes('collection') || ev.includes('transaction')) && ev.includes('success')) {
        await settle(String(reference)) // unknown references are ignored: other Lenco events share this URL
      }
      return json({ ok: true }) // always acknowledge so Lenco stops retrying
    }

    // ---- Signed-in student actions
    const user = await getUser(req)
    if (!user) return json({ error: 'Sign in to pay for an exam.' }, 401)
    const body = await req.json().catch(() => ({}))

    if (body.action === 'init') {
      const { data: profile } = await admin.from('profiles').select('is_banned, is_approved, full_name').eq('id', user.id).maybeSingle()
      if (!profile || profile.is_banned) return json({ error: 'Your account is suspended. Contact support.' }, 403)
      if (!profile.is_approved) return json({ error: 'Your account is awaiting admin approval.' }, 403)

      const { data: test } = await admin.from('tests').select('id, title, price_kwacha, is_published').eq('id', body.testId).maybeSingle()
      if (!test || !test.is_published) return json({ error: 'That exam is not available.' }, 404)
      if (test.price_kwacha <= 0) return json({ error: 'That exam is free.' }, 400)

      const { data: owned } = await admin.from('purchases').select('id').eq('user_id', user.id).eq('test_id', test.id)
        .in('status', ['paid', 'fake_paid']).maybeSingle()
      if (owned) return json({ alreadyOwned: true })

      const reference = `yo-${crypto.randomUUID()}`
      const { error } = await admin.from('purchases').insert({
        user_id: user.id, test_id: test.id, amount_kwacha: test.price_kwacha, currency: 'ZMW',
        status: 'pending', provider: 'lenco', provider_reference: reference,
      })
      if (error) return json({ error: error.message }, 500)

      return json({
        reference, publicKey: PUBLIC_KEY, widgetUrl: WIDGET_URL, amount: test.price_kwacha, currency: 'ZMW',
        email: user.email, name: profile.full_name ?? '', label: test.title,
      })
    }

    if (body.action === 'verify') {
      const reference = String(body.reference ?? '')
      const { data: mine } = await admin.from('purchases').select('id').eq('provider', 'lenco')
        .eq('provider_reference', reference).eq('user_id', user.id).maybeSingle()
      if (!mine) return json({ error: 'Payment not found.' }, 404)
      return json(await settle(reference))
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
