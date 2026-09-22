import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'
import { allowedOrigins, boundedBody, clientIp, HttpError, validateJson } from './security-core.ts'

type Options = {
  name: string
  methods?: string[]
  auth?: 'user' | 'optional' | 'service' | ((req: Request) => 'user' | 'optional' | 'service')
  mfa?: boolean
  userLimit?: number
  ipLimit?: number
  maxBytes?: number
  json?: boolean
}
type Context = { userId?: string; token?: string }
type Handler = (req: Request, context: Context) => Response | Promise<Response>
const DEFAULT_ORIGINS = 'https://www.kwpremieroficial.com,https://kwpremieroficial.com'

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new HttpError(503, 'Servicio no disponible')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function consumeLimit(scope: string, subject: string, limit: number): Promise<void> {
  const { data, error } = await adminClient().rpc('security_consume_rate', {
    p_scope: scope, p_subject: subject, p_limit: limit, p_window: 60,
  })
  if (error || !data || typeof data.allowed !== 'boolean') throw new HttpError(503, 'Servicio no disponible')
  if (!data.allowed) throw new HttpError(429, 'Demasiadas solicitudes. Intenta mas tarde.', data.retry_after || 60)
}

async function authenticate(req: Request, options: Options): Promise<Context> {
  if (options.auth === 'service') return {}
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (options.auth === 'optional') {
    // Anonymous credentials never become a user identity. PostgREST still
    // validates the actual token and RLS on the forwarded request.
    if (!token || token.startsWith('sb_publishable_') || token === Deno.env.get('SUPABASE_ANON_KEY')) return {}
  }
  if (!token || !/^Bearer\s+/i.test(req.headers.get('authorization') || '')) throw new HttpError(401, 'No autenticado')
  const { data, error } = await adminClient().auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Sesion invalida')
  await consumeLimit('user:all', data.user.id, 600)
  await consumeLimit(`user:${options.name}`, data.user.id, options.userLimit ?? 60)
  if (options.mfa !== false) {
    const secret = Deno.env.get('DATA_GATEWAY_SECRET')
    if (!secret) throw new HttpError(503, 'Servicio no disponible')
    const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}`, 'x-kw-gateway': secret } },
    })
    const { data: approved, error: mfaError } = await caller.rpc('mfa_sesion_autorizada')
    if (mfaError || approved !== true) throw new HttpError(403, 'Se requiere verificacion en dos pasos')
  }
  return { userId: data.user.id, token }
}

export function secureHandler(options: Options, handler: Handler): (req: Request) => Promise<Response> {
  return async (req) => {
    const headers = new Headers({
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'Vary': 'Origin',
      'Strict-Transport-Security': 'max-age=31536000',
    })
    try {
      const origins = allowedOrigins(Deno.env.get('ALLOWED_ORIGINS') || DEFAULT_ORIGINS)
      const origin = req.headers.get('origin')
      if (origin && !origins.has(origin)) throw new HttpError(403, 'Origen no permitido')
      if (origin) headers.set('Access-Control-Allow-Origin', origin)
      const methods = options.methods || ['POST']
      headers.set('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '))
      headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info, x-api-key, prefer, range, range-unit, accept, accept-profile, content-profile')
      headers.set('Access-Control-Expose-Headers', 'content-range, range-unit, retry-after')
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (!methods.includes(req.method)) throw new HttpError(405, 'Metodo no permitido')
      const url = new URL(req.url)
      // Supabase terminates TLS at its ingress and forwards HTTP internally.
      // Its trusted ingress overwrites X-Forwarded-Proto with the client scheme.
      if (url.protocol !== 'https:' && req.headers.get('x-forwarded-proto') !== 'https' &&
          !(Deno.env.get('ALLOW_LOCAL_HTTP') === 'true' &&
          ['localhost', '127.0.0.1', 'kong'].includes(url.hostname))) throw new HttpError(400, 'HTTPS requerido')
      const ip = clientIp(req.headers, Deno.env.get('TRUSTED_IP_HEADER') || 'x-forwarded-for')
      await consumeLimit('ip:all', ip, 1200)
      await consumeLimit(`ip:${options.name}`, ip, options.ipLimit ?? 180)
      const context = await authenticate(req, { ...options, auth: typeof options.auth === 'function' ? options.auth(req) : options.auth })
      if (options.name === 'api-propiedades' && !context.userId) {
        const key = req.headers.get('x-api-key') || ''
        if (!/^kwp_live_[a-f0-9]{32}$/.test(key)) throw new HttpError(401, 'Llave de API invalida')
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
        const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
        const { data, error } = await adminClient().from('api_llaves').select('id').eq('llave_hash', hash).eq('activa', true).maybeSingle()
        if (error) throw new HttpError(503, 'Servicio no disponible')
        if (!data) throw new HttpError(401, 'Llave de API invalida')
        await consumeLimit('api-key', data.id, 120)
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        const bytes = await boundedBody(req, options.maxBytes ?? 1024 * 1024)
        if (bytes.length && options.json !== false) {
          if (!(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Se requiere JSON')
          let body: unknown
          try { body = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new HttpError(400, 'JSON invalido') }
          validateJson(body)
        }
        req = new Request(req.url, { method: req.method, headers: req.headers, body: new Uint8Array(bytes).buffer, signal: req.signal })
      }
      const result = await handler(req, context)
      const merged = new Headers(result.headers)
      for (const key of [...merged.keys()]) if (key.toLowerCase().startsWith('access-control-')) merged.delete(key)
      headers.forEach((value, key) => merged.set(key, value))
      // Never return provider, SQL, stack trace or configuration details.
      if (result.status >= 500) {
        merged.set('Content-Type', 'application/json')
        merged.delete('Content-Length')
        return new Response(JSON.stringify({ error: 'Servicio no disponible' }), { status: result.status, headers: merged })
      }
      return new Response(result.body, { status: result.status, headers: merged })
    } catch (error) {
      const known = error instanceof HttpError
      headers.set('Content-Type', 'application/json')
      if (known && error.retryAfter) headers.set('Retry-After', String(error.retryAfter))
      if (!known) console.error('Security request failed', options.name)
      return new Response(JSON.stringify({ error: known ? error.message : 'Servicio no disponible' }), {
        status: known ? error.status : 503, headers,
      })
    }
  }
}

export function secureServe(options: Options, handler: Handler): void {
  Deno.serve(secureHandler(options, handler))
}
