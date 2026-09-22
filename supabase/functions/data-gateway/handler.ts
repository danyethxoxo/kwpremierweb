import { consumeLimit } from '../_shared/security.ts'
import { clientIp, gatewayTarget, HttpError, validEmail } from '../_shared/security-core.ts'

export async function forwardData(req: Request, context: { userId?: string; token?: string }): Promise<Response> {
  const base = Deno.env.get('SUPABASE_URL')!
  const secret = Deno.env.get('DATA_GATEWAY_SECRET')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!secret || !anon) throw new HttpError(503, 'Servicio no disponible')
  const target = gatewayTarget(req.url, base)
  if (req.method === 'POST' && ['prospectos', 'prospectos_reclutamiento', 'resenas'].includes(target.pathname.split('/').at(-1)!)) {
    const form = await req.clone().json()
    if (!form || typeof form !== 'object' || Array.isArray(form)) throw new HttpError(400, 'Envia un formulario por solicitud')
    if (form.correo && !validEmail(form.correo)) throw new HttpError(400, 'Correo invalido')
    await consumeLimit('public-form:ip', clientIp(req.headers, Deno.env.get('TRUSTED_IP_HEADER') || 'x-forwarded-for'), 10)
    if (context.userId) await consumeLimit('public-form:user', context.userId, 10)
  }
  // No caller-supplied key, schema or gateway secret reaches the database.
  const headers = new Headers({ apikey: anon, Authorization: `Bearer ${context.token || anon}`,
    'x-kw-gateway': secret, 'Content-Type': 'application/json' })
  for (const name of ['accept', 'prefer', 'range', 'range-unit']) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }
  const upstream = await fetch(target, { method: req.method, headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    redirect: 'error', signal: AbortSignal.timeout(30000) })
  const resultHeaders = new Headers(upstream.headers)
  // Fetch decodes compressed upstream bodies. Do not advertise the original
  // compressed size/encoding when forwarding its decoded stream.
  for (const name of ['content-encoding', 'content-length', 'connection', 'transfer-encoding']) resultHeaders.delete(name)
  if (!upstream.ok) {
    const messages: Record<number, string> = { 400: 'Datos invalidos', 401: 'Sesion invalida',
      403: 'No tienes permiso para esta operacion', 404: 'Registro no encontrado', 409: 'La operacion entra en conflicto con un registro existente' }
    resultHeaders.set('Content-Type', 'application/json')
    // Retain database error code for existing clients, not SQL internals.
    const detail = await upstream.json().catch(() => ({}))
    return new Response(JSON.stringify({ code: detail.code, message: messages[upstream.status] || 'No se pudo completar la solicitud' }), {
      status: upstream.status, headers: resultHeaders,
    })
  }
  return new Response(upstream.body, { status: upstream.status, headers: resultHeaders })
}
