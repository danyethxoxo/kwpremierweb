import { plantillaCorreo } from '../_shared/mailer.ts'
import { clientIp } from '../_shared/security-core.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'
import { deviceTrusted, loginExpired, loginExpiresAt, TRUST_DAYS } from './policy.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'KW Premier <seguridad@kwpremieroficial.com>'

const CODE_MINUTES = 5
const RESEND_SECONDS = 60
const MAX_SENDS_PER_HOUR = 5

function cors(_req: Request) { return {} }

function response(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function jwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  if (!part) return {}
  try {
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')))
  } catch { return {} }
}

async function sha256(value: string) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function clientIpHash(req: Request) {
  const ip = clientIp(req.headers, Deno.env.get('TRUSTED_IP_HEADER') || 'x-forwarded-for')
  // The raw IP is never stored. The service secret makes the value useless
  // as a public IP lookup while still letting us detect a changed network.
  return ip === 'unknown' ? '' : sha256(`ip:${ip}:${SERVICE_ROLE_KEY}`)
}

function generateCode() {
  const limit = Math.floor(0x100000000 / 1000000) * 1000000
  const values = new Uint32Array(1)
  do crypto.getRandomValues(values); while (values[0] >= limit)
  return String(values[0] % 1000000).padStart(6, '0')
}

function normalizeEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase()
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(email) && email.length <= 254 ? email : ''
}

function deviceToken(value: unknown) {
  const token = String(value || '')
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : ''
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!local || !domain) return 'correo configurado'
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(3, Math.min(8, local.length - 2)))}@${domain}`
}

function deviceName(req: Request) {
  const ua = req.headers.get('User-Agent') || ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const system = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : ''
  return `${browser}${system ? ` en ${system}` : ''}`
}

export async function handleMfa(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return response(req, { error: 'Metodo no permitido.' }, 405)
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return response(req, { error: 'Configuracion incompleta.' }, 500)
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return response(req, { error: 'No autenticado.' }, 401)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: identity, error: identityError } = await admin.auth.getUser(token)
    if (identityError || !identity?.user) return response(req, { error: 'Sesion invalida.' }, 401)
    const claims = jwtPayload(token)
    const sessionId = String(claims.session_id || '')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) return response(req, { error: 'Sesion invalida.' }, 401)

    const userId = identity.user.id
    const loginEmail = String(identity.user.email || '').toLowerCase()
    const body = await req.json().catch(() => ({}))
    const action = String(body.accion || '')
    const rawDevice = deviceToken(body.dispositivo_token)
    const deviceHash = rawDevice ? await sha256(`${userId}:device:${rawDevice}:${SERVICE_ROLE_KEY}`) : ''
    const ipHash = await clientIpHash(req)
    const now = new Date()
    if (loginExpired(claims, identity.user.last_sign_in_at, now.getTime())) {
      const { error } = await admin.from('mfa_sesiones').delete().eq('session_id', sessionId).eq('user_id', userId)
      if (error) return response(req, { error: 'No se pudo renovar la sesion.' }, 500)
      return response(req, { requiere_login: true }, action === 'estado' ? 200 : 401)
    }
    const trustLimit = new Date(now.getTime() - TRUST_DAYS * 86400000).toISOString()
    const verifiedUntil = new Date(Math.min(now.getTime() + TRUST_DAYS * 86400000,
      loginExpiresAt(claims, identity.user.last_sign_in_at))).toISOString()

    const { data: method, error: methodLookupError } = await admin.from('mfa_metodos').select('destino,activo').eq('user_id', userId).maybeSingle()
    if (methodLookupError) return response(req, { error: 'No se pudo comprobar la seguridad de la cuenta.' }, 500)
    const { data: profile, error: profileLookupError } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
    if (profileLookupError) return response(req, { error: 'No se pudo comprobar el rol de la cuenta.' }, 500)
    const privileged = profile?.role === 'master' || profile?.role === 'admin'
    const required = privileged || !!method
    const active = method?.activo === true && !!method?.destino
    const needsEnrollment = required && !active
    let trusted = false
    if (active && deviceHash) {
      const { data: device, error: deviceLookupError } = await admin.from('mfa_dispositivos').select('id,ultimo_acceso,ultimo_ip_hash').eq('user_id', userId)
        .eq('token_hash', deviceHash).is('revocado_en', null).gte('ultimo_acceso', trustLimit).maybeSingle()
      if (deviceLookupError) return response(req, { error: 'No se pudo comprobar este dispositivo.' }, 500)
      if (device && deviceTrusted(device, ipHash, now.getTime())) {
        const { error: touchError } = await admin.from('mfa_dispositivos').update({ ultimo_acceso: now.toISOString(), ultimo_ip_hash: ipHash, nombre: deviceName(req) }).eq('id', device.id)
        const { error: sessionError } = await admin.from('mfa_sesiones').upsert({ session_id: sessionId, user_id: userId, verificado_hasta: verifiedUntil })
        if (touchError || sessionError) return response(req, { error: 'No se pudo autorizar este dispositivo.' }, 500)
        trusted = true
      }
    }
    // La autorización anterior de esta sesión no sustituye al dispositivo/IP.
    // Al cambiar de red o pasar cinco días sin uso se requiere otro código.
    if (active && !trusted) {
      const { error: revokeError } = await admin.from('mfa_sesiones').delete().eq('session_id', sessionId).eq('user_id', userId)
      if (revokeError) return response(req, { error: 'No se pudo comprobar la sesion.' }, 500)
    }
    const verified = trusted

    if (action === 'estado') return response(req, {
      requerido: required,
      activo: active,
      verificado: !required || (active && verified),
      requiere_alta: !!method && needsEnrollment,
      requiere_mfa: privileged && needsEnrollment,
      dispositivo_confiable: trusted,
      enviado_a: active ? maskEmail(method.destino) : null,
    })

    if (action === 'revocar_actual' || action === 'revocar_todos') {
      let revokeError: unknown = null
      if (action === 'revocar_actual' && deviceHash) ({ error: revokeError } = await admin.from('mfa_dispositivos').update({ revocado_en: now.toISOString() }).eq('user_id', userId).eq('token_hash', deviceHash))
      if (action === 'revocar_todos') ({ error: revokeError } = await admin.from('mfa_dispositivos').update({ revocado_en: now.toISOString() }).eq('user_id', userId).is('revocado_en', null))
      const { error: deleteSessionsError } = await admin.from('mfa_sesiones').delete().eq('user_id', userId)
      if (revokeError || deleteSessionsError) return response(req, { error: 'No se pudieron revocar las sesiones.' }, 500)
      return response(req, { ok: true })
    }

    let purpose = ''
    let destination = ''
    if (action === 'enviar') {
      if (!active) return response(req, { error: 'Configura primero un correo de seguridad.' }, 409)
      purpose = 'acceso'; destination = method.destino
    } else if (action === 'preparar') {
      destination = normalizeEmail(body.correo_alternativo)
      if (!destination) return response(req, { error: 'Escribe un correo de seguridad valido.' }, 400)
      if (destination === loginEmail) return response(req, { error: 'El correo de seguridad debe ser distinto al correo de acceso.' }, 400)
      if (active && !verified) return response(req, { error: 'Verifica primero este dispositivo.' }, 403)
      purpose = 'activar'
    }

    if (purpose) {
      if (!RESEND_API_KEY) return response(req, { error: 'El envio de correos no esta configurado.' }, 500)
      const hourAgo = new Date(now.getTime() - 3600000).toISOString()
      const { count } = await admin.from('mfa_correo_codigos').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', hourAgo)
      if ((count || 0) >= MAX_SENDS_PER_HOUR) return response(req, { error: 'Limite de envios alcanzado. Intenta en una hora.' }, 429)
      const { data: last } = await admin.from('mfa_correo_codigos').select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (last?.created_at) {
        const elapsed = (now.getTime() - new Date(last.created_at).getTime()) / 1000
        if (elapsed < RESEND_SECONDS) return response(req, { error: `Espera ${Math.ceil(RESEND_SECONDS - elapsed)} segundos antes de reenviar.` }, 429)
      }
      const code = generateCode()
      const codeHash = await sha256(`${userId}:${purpose}:${code}:${SERVICE_ROLE_KEY}`)
      await admin.from('mfa_correo_codigos').update({ usado: true }).eq('user_id', userId).eq('usado', false)
      const { error: insertError } = await admin.from('mfa_correo_codigos').insert({ user_id: userId, codigo_hash: codeHash, expira_en: new Date(now.getTime() + CODE_MINUTES * 60000).toISOString(), proposito: purpose, destino: destination })
      if (insertError) return response(req, { error: 'No se pudo generar el codigo.' }, 500)
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ from: EMAIL_FROM, to: [destination], subject: purpose === 'activar' ? 'Confirma tu correo de seguridad' : 'Código para un dispositivo nuevo', html: plantillaCorreo({ intro: 'Se solicitó una verificación para tu cuenta de KW Premier.', title: 'Tu código de seguridad', content: 'Vence en ' + CODE_MINUTES + ' minutos, funciona una sola vez y fue solicitado desde ' + deviceName(req) + '.', code, note: 'Si no fuiste tú, cambia tu contraseña y avisa a administración.' }) }),
      })
      if (!sent.ok) {
        await admin.from('mfa_correo_codigos').update({ usado: true }).eq('user_id', userId).eq('usado', false)
        console.error('Resend failed', sent.status, await sent.text())
        return response(req, { error: 'No se pudo enviar el correo.' }, 502)
      }
      return response(req, { ok: true, enviado_a: maskEmail(destination) })
    }

    if (action === 'verificar' || action === 'confirmar') {
      if (!rawDevice || !deviceHash) return response(req, { error: 'No se pudo identificar este dispositivo.' }, 400)
      const code = String(body.codigo || '').trim()
      const purposeToCheck = action === 'confirmar' ? 'activar' : 'acceso'
      if (!/^\d{6}$/.test(code)) return response(req, { error: 'Codigo invalido.' }, 400)
      const codeHash = await sha256(`${userId}:${purposeToCheck}:${code}:${SERVICE_ROLE_KEY}`)
      const { data: consumed, error: consumeError } = await admin.rpc('mfa_consumir_codigo', { p_user_id: userId, p_proposito: purposeToCheck, p_codigo_hash: codeHash })
      if (consumeError) return response(req, { error: 'No se pudo validar el codigo.' }, 500)
      const result = consumed?.[0]
      if (result?.resultado !== 'ok') {
        const message = result?.resultado === 'incorrecto' ? 'Codigo incorrecto.' : result?.resultado === 'bloqueado' ? 'Demasiados intentos. Solicita otro codigo.' : 'El codigo vencio o ya fue usado.'
        return response(req, { error: message }, result?.resultado === 'bloqueado' ? 429 : 400)
      }
      if (purposeToCheck === 'activar') {
        const { error: methodError } = await admin.from('mfa_metodos').upsert({ user_id: userId, canal: 'correo', destino: result.destino, activo: true, verificado_en: now.toISOString(), updated_at: now.toISOString() })
        if (methodError) return response(req, { error: 'No se pudo activar el segundo paso.' }, 500)
        const { error: revokeOldError } = await admin.from('mfa_dispositivos').update({ revocado_en: now.toISOString() }).eq('user_id', userId).is('revocado_en', null)
        if (revokeOldError) return response(req, { error: 'No se pudieron renovar los dispositivos.' }, 500)
      }
      const { error: deviceError } = await admin.from('mfa_dispositivos').upsert({ user_id: userId, token_hash: deviceHash, nombre: deviceName(req), ultimo_acceso: now.toISOString(), ultimo_ip_hash: ipHash || null, revocado_en: null }, { onConflict: 'user_id,token_hash' })
      const { error: authorizeError } = await admin.from('mfa_sesiones').upsert({ session_id: sessionId, user_id: userId, verificado_hasta: verifiedUntil })
      if (deviceError || authorizeError) return response(req, { error: 'El codigo fue valido, pero no se pudo autorizar el dispositivo. Solicita uno nuevo.' }, 500)
      return response(req, { ok: true, confiable_hasta: verifiedUntil })
    }

    if (action === 'desactivar') {
      return response(req, { error: 'La verificacion en dos pasos es obligatoria y no se puede desactivar.' }, 403)
    }
    return response(req, { error: 'Accion no reconocida.' }, 400)
  } catch (error) {
    console.error(error)
    return response(req, { error: 'Error inesperado.' }, 500)
  }
}
