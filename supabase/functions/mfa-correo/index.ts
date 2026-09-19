// Segundo factor por correo alternativo, ligado al session_id del JWT.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'KW Premier <onboarding@resend.dev>'
const ALLOWED_ORIGINS = (Deno.env.get('MFA_ALLOWED_ORIGINS') ||
  'https://danyethxoxo.github.io,http://localhost:3000,http://127.0.0.1:5500')
  .split(',').map((value) => value.trim()).filter(Boolean)
const CODE_MINUTES = 5
const SESSION_HOURS = 4
const MAX_ATTEMPTS = 5
const RESEND_SECONDS = 60
const MAX_SENDS_PER_HOUR = 5

function corsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function respond(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  if (!part) return {}
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  try { return JSON.parse(atob(padded)) } catch { return {} }
}

async function sha256(value: string) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function generateCode() {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return String(values[0] % 1000000).padStart(6, '0')
}

function normalizeEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase()
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(email) && email.length <= 254 ? email : ''
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!local || !domain) return 'correo configurado'
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(3, Math.min(8, local.length - 2)))}@${domain}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return respond(req, { error: 'Metodo no permitido.' }, 405)
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return respond(req, { error: 'Configuracion incompleta.' }, 500)
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return respond(req, { error: 'No autenticado.' }, 401)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: identity, error: identityError } = await admin.auth.getUser(token)
    if (identityError || !identity?.user) return respond(req, { error: 'Sesion invalida.' }, 401)
    const claims = decodeJwtPayload(token)
    const sessionId = String(claims.session_id || '')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) return respond(req, { error: 'Sesion sin identificador valido.' }, 401)
    const userId = identity.user.id
    const loginEmail = String(identity.user.email || '').toLowerCase()
    const body = await req.json().catch(() => ({}))
    const action = String(body.accion || '')
    const { data: method } = await admin.from('mfa_metodos').select('destino, activo').eq('user_id', userId).maybeSingle()
    const { data: verifiedSession } = await admin.from('mfa_sesiones').select('verificado_hasta')
      .eq('session_id', sessionId).eq('user_id', userId).gt('verificado_hasta', new Date().toISOString()).maybeSingle()
    const active = method?.activo === true
    const verified = !!verifiedSession

    if (action === 'estado') return respond(req, { activo: active, verificado: !active || verified, enviado_a: active ? maskEmail(method.destino) : null })

    let purpose = ''
    let destination = ''
    if (action === 'enviar') {
      if (!active) return respond(req, { error: 'Configura primero un correo alternativo.' }, 409)
      purpose = 'acceso'
      destination = method.destino
    } else if (action === 'preparar') {
      destination = normalizeEmail(body.correo_alternativo)
      if (!destination) return respond(req, { error: 'Escribe un correo alternativo valido.' }, 400)
      if (destination === loginEmail) return respond(req, { error: 'Usa un correo distinto al correo con el que inicias sesion.' }, 400)
      if (active && !verified) return respond(req, { error: 'Completa primero el segundo paso de esta sesion.' }, 403)
      purpose = 'activar'
    }

    if (purpose) {
      if (!RESEND_API_KEY) return respond(req, { error: 'El envio de correos no esta configurado.' }, 500)
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { count } = await admin.from('mfa_correo_codigos').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since)
      if ((count || 0) >= MAX_SENDS_PER_HOUR) return respond(req, { error: 'Limite de envios alcanzado. Intenta en una hora.' }, 429)
      const { data: last } = await admin.from('mfa_correo_codigos').select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (last?.created_at) {
        const elapsed = (Date.now() - new Date(last.created_at).getTime()) / 1000
        if (elapsed < RESEND_SECONDS) return respond(req, { error: `Espera ${Math.ceil(RESEND_SECONDS - elapsed)} segundos antes de reenviar.` }, 429)
      }
      const code = generateCode()
      const codeHash = await sha256(`${userId}:${purpose}:${code}:${SERVICE_ROLE_KEY}`)
      await admin.from('mfa_correo_codigos').update({ usado: true }).eq('user_id', userId).eq('usado', false)
      const { error: insertError } = await admin.from('mfa_correo_codigos').insert({ user_id: userId, codigo_hash: codeHash, expira_en: new Date(Date.now() + CODE_MINUTES * 60 * 1000).toISOString(), proposito: purpose, destino: destination })
      if (insertError) return respond(req, { error: 'No se pudo generar el codigo.' }, 500)
      const mailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: EMAIL_FROM, to: [destination], subject: purpose === 'activar' ? 'Confirma tu correo de seguridad' : 'Tu codigo de acceso', html: `<div style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.55;max-width:480px"><p>Tu codigo de seguridad de KW Premier es:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#8a0000">${code}</p><p>Vence en ${CODE_MINUTES} minutos y solo puede usarse una vez.</p><p style="color:#666">Si no solicitaste este codigo, cambia tu contrasena y avisa a administracion.</p></div>` }),
      })
      if (!mailResponse.ok) {
        await admin.from('mfa_correo_codigos').update({ usado: true }).eq('user_id', userId).eq('usado', false)
        console.error('Resend failed', mailResponse.status, await mailResponse.text())
        return respond(req, { error: 'No se pudo enviar el correo. Intenta mas tarde.' }, 502)
      }
      return respond(req, { ok: true, enviado_a: maskEmail(destination) })
    }

    if (action === 'verificar' || action === 'confirmar') {
      const code = String(body.codigo || '').trim()
      const requestedPurpose = action === 'confirmar' ? 'activar' : 'acceso'
      if (!/^\d{6}$/.test(code)) return respond(req, { error: 'Codigo invalido.' }, 400)
      const { data: row } = await admin.from('mfa_correo_codigos').select('id,codigo_hash,expira_en,intentos,usado,destino,proposito').eq('user_id', userId).eq('proposito', requestedPurpose).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!row || row.usado || new Date(row.expira_en).getTime() <= Date.now()) return respond(req, { error: 'El codigo vencio o ya fue usado. Solicita uno nuevo.' }, 400)
      if (row.intentos >= MAX_ATTEMPTS) {
        await admin.from('mfa_correo_codigos').update({ usado: true }).eq('id', row.id)
        return respond(req, { error: 'Demasiados intentos. Solicita un codigo nuevo.' }, 429)
      }
      const receivedHash = await sha256(`${userId}:${requestedPurpose}:${code}:${SERVICE_ROLE_KEY}`)
      if (receivedHash !== row.codigo_hash) {
        await admin.from('mfa_correo_codigos').update({ intentos: row.intentos + 1 }).eq('id', row.id).eq('intentos', row.intentos)
        return respond(req, { error: 'Codigo incorrecto.' }, 400)
      }
      await admin.from('mfa_correo_codigos').update({ usado: true }).eq('id', row.id)
      if (requestedPurpose === 'activar') await admin.from('mfa_metodos').upsert({ user_id: userId, canal: 'correo', destino: row.destino, activo: true, verificado_en: new Date().toISOString(), updated_at: new Date().toISOString() })
      const verifiedUntil = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString()
      const { error: sessionError } = await admin.from('mfa_sesiones').upsert({ session_id: sessionId, user_id: userId, verificado_hasta: verifiedUntil })
      if (sessionError) return respond(req, { error: 'No se pudo confirmar la sesion.' }, 500)
      return respond(req, { ok: true, verificado_hasta: verifiedUntil })
    }

    if (action === 'desactivar') {
      if (!active || !verified) return respond(req, { error: 'Debes verificar esta sesion antes de desactivar el segundo paso.' }, 403)
      const { error } = await admin.from('mfa_metodos').update({ activo: false, updated_at: new Date().toISOString() }).eq('user_id', userId)
      if (error) return respond(req, { error: 'No se pudo desactivar.' }, 500)
      await admin.from('mfa_sesiones').delete().eq('user_id', userId)
      return respond(req, { ok: true })
    }
    return respond(req, { error: 'Accion no reconocida.' }, 400)
  } catch (error) {
    console.error(error)
    return respond(req, { error: 'Error inesperado.' }, 500)
  }
})
