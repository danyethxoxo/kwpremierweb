import { HttpError, validUuid } from '../_shared/security-core.ts'
import { syncMailbox } from './mail-sync.ts'

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
export const PROSPECTOS_PAGE = 'https://kweb.com.mx/hub/prospectos-gmail.html'
type Context = { userId?: string; token?: string }
type Backend = (action: string, user: string, session: string, data?: Record<string, unknown>) => Promise<any>
type Options = { backend: Backend; encryptionRoot: string; redirectUri: string; fetcher?: typeof fetch; approvedClientIds?: string[] }
const enc = new TextEncoder()
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0))
const url64 = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export async function fingerprint(value: string) {
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('')
}
export async function secretBox(root: string) {
 if (root.length < 24) throw new HttpError(503, 'Servicio no disponible')
 const source = await crypto.subtle.importKey('raw', enc.encode(root), 'HKDF', false, ['deriveKey'])
 const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('KWEB:prospectos:v1'), info: enc.encode('gmail-oauth') }, source, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
 return {
  async seal(value: unknown, user: string, purpose: string) {
   const iv = crypto.getRandomValues(new Uint8Array(12))
   const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(user + ':' + purpose) }, key, enc.encode(JSON.stringify(value)))
   return { v: 1, iv: b64(iv), data: b64(new Uint8Array(data)) }
  },
  async open(box: any, user: string, purpose: string) {
   try {
    if (box?.v !== 1 || typeof box.iv !== 'string' || typeof box.data !== 'string') throw Error()
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv), additionalData: enc.encode(user + ':' + purpose) }, key, unb64(box.data))
    return JSON.parse(new TextDecoder().decode(data))
   } catch { throw new HttpError(409, 'Vuelve a configurar la vinculación de Gmail.') }
  },
 }
}
export async function syncConnectedMailbox(options: {
 user: string; current: any; encryptionRoot: string; rules: any; fetcher?: typeof fetch
 save: (payload: Record<string, unknown>) => Promise<any>
}) {
 if (!options.current?.config || !options.current?.conexion) throw new HttpError(409, 'Vincula Gmail antes de sincronizar.')
 const fetcher = options.fetcher || fetch
 const google = async (url: string, init: RequestInit) => {
  try { return await fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(12000) }) }
  catch { throw new HttpError(502, 'No se pudo comunicar con Google. Intenta de nuevo.') }
 }
 const box = await secretBox(options.encryptionRoot)
 const secret = await box.open(options.current.config.secreto, options.user, 'config')
 const credentials = await box.open(options.current.conexion.credenciales, options.user, 'tokens')
 const renewed = await google('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: options.current.config.client_id, client_secret: secret, refresh_token: credentials.refresh_token, grant_type: 'refresh_token' }) })
 if (!renewed.ok) throw new HttpError(409, 'La autorización de Gmail venció. Vuelve a vincular la cuenta.')
 const token = await renewed.json()
 if (typeof token.access_token !== 'string') throw new HttpError(502, 'Gmail no devolvió un permiso de lectura válido.')
 const result = await syncMailbox({ fetcher: google, accessToken: token.access_token, historyId: String(options.current.conexion.history_id || ''), rules: options.rules })
 const saved = await options.save({ history_id: result.historyId, registros: result.leads })
 return { ok: true, revisados: result.revisados, importados: Number(saved?.importados || 0), ultima_revision_at: saved?.ultima_revision_at || new Date().toISOString(), respaldo: result.fallback }
}
function value(data: any, name: string, max: number) {
 const v = data?.[name]
 if (typeof v !== 'string' || !v.trim() || v.length > max || /[\x00-\x1f\x7f]/.test(v)) throw new HttpError(400, 'Datos incompletos o inválidos.')
 return v.trim()
}
export function createGmailHandler(options: Options) {
 const fetcher = options.fetcher || fetch
 const reply = (data: unknown) => Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
 async function google(url: string, init: RequestInit) {
  try { return await fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(12000) }) }
  catch { throw new HttpError(502, 'No se pudo comunicar con Google. Intenta de nuevo.') }
 }
 async function gmailProfile(access: string) {
  const r = await google('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: 'Bearer ' + access } })
  if (!r.ok) throw new HttpError(409, 'Google no permitió leer Gmail. Comprueba que Gmail API esté habilitada y que autorizaste la lectura.')
  const profile = await r.json()
  if (typeof profile.emailAddress !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.emailAddress)) throw new HttpError(409, 'No se pudo identificar la cuenta de Gmail.')
  const historyId = /^\d+$/.test(String(profile.historyId || '')) ? String(profile.historyId) : ''
  return { correo: profile.emailAddress.toLowerCase(), historyId }
 }
 return async function handle(req: Request, context: Context): Promise<Response> {
  if (req.method === 'GET') {
   // El callback no intercambia credenciales. Solo entrega el codigo al flujo
   // autenticado, usando nombres que no interfieren con el login de Supabase.
   const q = new URL(req.url).searchParams, target = new URL(PROSPECTOS_PAGE)
   const code = q.get('code') || '', state = q.get('state') || ''
   if (code && code.length <= 4096 && /^[a-f0-9]{64}$/.test(state)) target.hash = new URLSearchParams({ gmail_code: code, gmail_state: state }).toString()
   else target.hash = new URLSearchParams({ gmail_error: q.get('error') === 'access_denied' ? 'cancelado' : 'invalido' }).toString()
   return new Response(null, { status: 303, headers: { Location: target.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
  }
  if (!context.userId || !context.token) throw new HttpError(401, 'No autenticado')
  let session: string
  try { const part = context.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); session = JSON.parse(atob(part)).session_id }
  catch { throw new HttpError(401, 'Sesión inválida') }
  if (!validUuid(session)) throw new HttpError(401, 'Sesión inválida')
  const user = context.userId
  const backend = (action: string, data?: Record<string, unknown>) => options.backend(action, user, session, data)
  const data = await req.json().catch(() => { throw new HttpError(400, 'Datos inválidos') })
  const action = value(data, 'accion', 32)
  // Este RPC valida ademas la cuenta del piloto y la sesion vigente.
  const current = await backend('estado')
  if (action === 'estado') return reply({ configurada: !!current.config, client_id: current.config?.client_id || '', redirect_uri: options.redirectUri,
   vinculada: !!current.conexion, correo: current.conexion?.correo || '', vinculada_at: current.conexion?.vinculada_at || null,
   comprobada_at: current.conexion?.comprobada_at || null })
  const box = await secretBox(options.encryptionRoot)
  if (action === 'configurar') {
   const clientId = value(data, 'client_id', 256), clientSecret = value(data, 'client_secret', 512)
   if (!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new HttpError(400, 'El ID de cliente de Google no es válido.')
   if (!options.approvedClientIds?.includes(clientId)) throw new HttpError(400, 'Usa el cliente OAuth aprobado de KWPremier para Prospectos.')
   if (current.conexion) throw new HttpError(409, 'Desvincula Gmail antes de cambiar la configuración.')
   await backend('configurar', { client_id: clientId, secreto: await box.seal(clientSecret, user, 'config') })
   return reply({ ok: true })
  }
  if (!current.config) throw new HttpError(409, 'Configura primero el cliente OAuth de Gmail.')
  const clientId = current.config.client_id
  if (action === 'iniciar') {
   if (current.conexion) throw new HttpError(409, 'Desvincula la cuenta actual antes de conectar otra.')
   const state = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('')
   const verifier = url64(crypto.getRandomValues(new Uint8Array(32)))
   await backend('crear_estado', { hash: await fingerprint(state), verificador: await box.seal({ verifier, clientId }, user, 'estado') })
   const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
   url.search = new URLSearchParams({ client_id: clientId, redirect_uri: options.redirectUri, response_type: 'code', scope: GMAIL_SCOPE,
    access_type: 'offline', prompt: 'consent select_account', state, code_challenge: url64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier)))), code_challenge_method: 'S256' }).toString()
   return reply({ url: url.href })
  }
  if (action === 'vincular') {
   const code = value(data, 'code', 4096), state = value(data, 'state', 64)
   if (!/^[a-f0-9]{64}$/.test(state)) throw new HttpError(400, 'La vinculación no es válida. Inténtalo de nuevo.')
   const pending = await backend('consumir_estado', { hash: await fingerprint(state) })
   if (!pending) throw new HttpError(400, 'La vinculación venció o ya fue utilizada. Conecta Gmail nuevamente.')
   const { verifier, clientId: originalClient } = await box.open(pending, user, 'estado')
   if (originalClient !== clientId) throw new HttpError(409, 'La configuración cambió. Conecta Gmail nuevamente.')
   if (current.conexion) throw new HttpError(409, 'Ya hay una cuenta vinculada. Desvincúlala antes de conectar otra.')
   const secret = await box.open(current.config.secreto, user, 'config')
   const r = await google('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, code, code_verifier: verifier, redirect_uri: options.redirectUri, grant_type: 'authorization_code' }) })
   if (!r.ok) throw new HttpError(400, 'Google no completó la vinculación. Revisa el cliente OAuth y vuelve a conectar.')
   const token = await r.json()
   if (typeof token.access_token !== 'string' || typeof token.refresh_token !== 'string' || !String(token.scope || '').split(' ').includes(GMAIL_SCOPE)) throw new HttpError(400, 'Google debe autorizar la lectura de Gmail y el acceso sin conexión. Vuelve a conectar.')
   const profile = await gmailProfile(token.access_token)
   await backend('conectar', { client_id: clientId, correo: profile.correo, scopes: GMAIL_SCOPE, credenciales: await box.seal({ refresh_token: token.refresh_token }, user, 'tokens') })
   if (profile.historyId) await options.backend('checkpoint', user, session, { history_id: profile.historyId })
   return reply({ ok: true, correo: profile.correo })
  }
  if (action === 'sincronizar') {
   if (!current.conexion) throw new HttpError(409, 'Vincula Gmail antes de sincronizar.')
   const rules = await options.backend('reglas', user, session)
   const result = await syncConnectedMailbox({ user, current, encryptionRoot: options.encryptionRoot, rules, fetcher,
    save: data => options.backend('importar', user, session, data) })
   return reply(result)
  }
  if (action === 'desconectar') {
   const removed = await backend('desconectar')
   let revoked = true
   if (removed) {
    try {
     const token = await box.open(removed.credenciales, user, 'tokens')
     const r = await google('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: token.refresh_token }) })
     revoked = r.ok
     await r.arrayBuffer()
    } catch { revoked = false }
   }
   return reply({ ok: true, revocada: revoked })
  }
  throw new HttpError(400, 'Acción inválida')
 }
}

