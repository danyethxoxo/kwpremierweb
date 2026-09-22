import { consumeLimit, secureServe } from '../_shared/security.ts'
import { clientIp, gatewayTarget, HttpError } from '../_shared/security-core.ts'

secureServe({ name: 'data-gateway', auth: 'optional', methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
  userLimit: 300, ipLimit: 600, maxBytes: 8 * 1024 * 1024 }, async (req, context) => {
  const base = Deno.env.get('SUPABASE_URL')!
  const secret = Deno.env.get('DATA_GATEWAY_SECRET')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!secret || !anon) throw new HttpError(503, 'Servicio no disponible')
  const target = gatewayTarget(req.url, base)
  if (req.method === 'POST' && ['prospectos', 'prospectos_reclutamiento', 'resenas'].includes(target.pathname.split('/').at(-1)!)) {
    await consumeLimit('public-form:ip', clientIp(req.headers, Deno.env.get('TRUSTED_IP_HEADER') || 'x-forwarded-for'), 10)
    if (context.userId) await consumeLimit('public-form:user', context.userId, 10)
  }
  // Allowlist headers. In particular: no caller-supplied API key, schema,
  // gateway secret or service-role token may reach the database.
  const headers = new Headers({ apikey: anon, Authorization: `Bearer ${context.token || anon}`,
    'x-kw-gateway': secret, 'Content-Type': 'application/json' })
  for (const name of ['accept', 'prefer', 'range', 'range-unit']) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }
  const response = await fetch(target, { method: req.method, headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    redirect: 'error', signal: AbortSignal.timeout(30000) })
  return response
})
