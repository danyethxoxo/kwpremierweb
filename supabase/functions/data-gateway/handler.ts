import { consumeLimit } from '../_shared/security.ts'
import { clientIp, gatewayTarget, HttpError, validEmail, validUuid } from '../_shared/security-core.ts'

const PUBLIC_FORM_TABLES = new Set(['prospectos', 'prospectos_reclutamiento', 'resenas'])
const PUBLIC_FORM_KEYS: Record<string, string[]> = {
  prospectos: ['asesor_id', 'nombre', 'correo', 'telefono', 'mensaje', 'origen', 'apodo', 'kw_form_started_at'],
  prospectos_reclutamiento: ['nombre', 'correo', 'telefono', 'experiencia', 'mensaje', 'apodo', 'kw_form_started_at'],
  resenas: ['nombre', 'texto', 'estrellas', 'rol', 'apodo', 'kw_form_started_at'],
}

const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/

function textField(form: Record<string, unknown>, key: string, max: number, required = false): string {
  const value = form[key]
  if (value == null) {
    if (required) throw new HttpError(400, 'Formulario incompleto')
    return ''
  }
  if (typeof value !== 'string') throw new HttpError(400, 'Formulario invalido')
  const text = value.trim()
  if (text.length > max || CONTROL_CHARS.test(text)) throw new HttpError(400, 'Formulario invalido')
  if (required && !text) throw new HttpError(400, 'Formulario incompleto')
  return text
}

async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function fakeCreatedResponse(): Response {
  // Do not tell automated senders that the honeypot caught them. The browser
  // receives the same empty 201 response as a successful insert.
  return new Response(null, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}

async function preparePublicForm(table: string, input: unknown): Promise<{ clean: Record<string, unknown>; bot: boolean; identity?: string }> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Envia un formulario por solicitud')
  const form = input as Record<string, unknown>
  const encoded = JSON.stringify(form)
  if (!encoded || encoded.length > 20000) throw new HttpError(413, 'Formulario demasiado grande')
  for (const key of Object.keys(form)) {
    if (!PUBLIC_FORM_KEYS[table].includes(key)) throw new HttpError(400, 'Campo no permitido')
  }

  const honeypot = textField(form, 'apodo', 200)
  const started = Number(form.kw_form_started_at)
  // The hidden field is only a signal; rate limits and validation remain the
  // real control because a determined sender can imitate elapsed time.
  const tooFast = Number.isFinite(started) && started > 0 && Date.now() - started < 650
  if (honeypot || tooFast) return { clean: {}, bot: true }

  if (table === 'prospectos') {
    const asesorId = textField(form, 'asesor_id', 36, true)
    const nombre = textField(form, 'nombre', 120, true)
    const correo = textField(form, 'correo', 160)
    const telefono = textField(form, 'telefono', 40)
    const mensaje = textField(form, 'mensaje', 1000)
    const origen = textField(form, 'origen', 20, true)
    if (!validUuid(asesorId) || nombre.length < 2 || (!correo && !telefono) || !['micrositio', 'propiedad'].includes(origen)) {
      throw new HttpError(400, 'Formulario invalido')
    }
    if ((correo && !validEmail(correo)) || (telefono && !/^[0-9+().\-\s]{7,40}$/.test(telefono))) {
      throw new HttpError(400, 'Datos de contacto invalidos')
    }
    return {
      bot: false,
      clean: { asesor_id: asesorId, nombre, correo: correo || null, telefono: telefono || null, mensaje: mensaje || null, origen },
      identity: correo.toLowerCase() || telefono.replace(/\D/g, ''),
    }
  }

  if (table === 'prospectos_reclutamiento') {
    const nombre = textField(form, 'nombre', 120, true)
    const correo = textField(form, 'correo', 160)
    const telefono = textField(form, 'telefono', 40)
    const experiencia = textField(form, 'experiencia', 20)
    const mensaje = textField(form, 'mensaje', 1000)
    if (nombre.length < 2 || (!correo && !telefono) || !['', 'ninguna', 'algo', 'mucha'].includes(experiencia)) {
      throw new HttpError(400, 'Formulario invalido')
    }
    if ((correo && !validEmail(correo)) || (telefono && !/^[0-9+().\-\s]{7,40}$/.test(telefono))) {
      throw new HttpError(400, 'Datos de contacto invalidos')
    }
    return {
      bot: false,
      clean: { nombre, correo: correo || null, telefono: telefono || null, experiencia: experiencia || null, mensaje: mensaje || null },
      identity: correo.toLowerCase() || telefono.replace(/\D/g, ''),
    }
  }

  const nombre = textField(form, 'nombre', 120, true)
  const texto = textField(form, 'texto', 600, true)
  const rol = textField(form, 'rol', 120)
  const estrellas = form.estrellas
  if (nombre.length < 2 || texto.length < 3 || !Number.isInteger(estrellas) || Number(estrellas) < 1 || Number(estrellas) > 5) {
    throw new HttpError(400, 'Formulario invalido')
  }
  return {
    bot: false,
    clean: { nombre, texto, estrellas, rol: rol || null },
    identity: await fingerprint(`${nombre.toLowerCase()}|${texto.toLowerCase()}|${estrellas}`),
  }
}

export async function forwardData(req: Request, context: { userId?: string; token?: string }): Promise<Response> {
  const base = Deno.env.get('SUPABASE_URL')!
  const secret = Deno.env.get('DATA_GATEWAY_SECRET')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!secret || !anon) throw new HttpError(503, 'Servicio no disponible')
  const target = gatewayTarget(req.url, base)
  const table = target.pathname.split('/').at(-1)!
  let outboundBody: BodyInit | undefined = ['GET', 'HEAD'].includes(req.method) ? undefined : req.body
  if (req.method === 'POST' && PUBLIC_FORM_TABLES.has(table)) {
    let form: unknown
    try { form = await req.clone().json() } catch { throw new HttpError(400, 'Formulario invalido') }
    const prepared = await preparePublicForm(table, form)
    if (prepared.bot) return fakeCreatedResponse()

    const ip = clientIp(req.headers, Deno.env.get('TRUSTED_IP_HEADER') || 'x-forwarded-for')
    const perRouteLimit = table === 'prospectos' ? 6 : 4
    await consumeLimit('public-form:ip', ip, 12)
    await consumeLimit(`public-form:${table}:ip`, ip, perRouteLimit)
    if (prepared.identity) {
      await consumeLimit(`public-form:${table}:identity`, await fingerprint(prepared.identity), 3, 3600)
    }
    if (context.userId) await consumeLimit('public-form:user', context.userId, 10, 3600)

    // Strip anti-abuse fields before forwarding. They are deliberately not
    // database columns, so a direct crafted payload cannot smuggle them into
    // PostgREST or change the stored record shape.
    outboundBody = JSON.stringify(prepared.clean)
  }
  // No caller-supplied key, schema or gateway secret reaches the database.
  const headers = new Headers({ apikey: anon, Authorization: `Bearer ${context.token || anon}`,
    'x-kw-gateway': secret, 'Content-Type': 'application/json' })
  for (const name of ['accept', 'prefer', 'range', 'range-unit']) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }
  const upstream = await fetch(target, { method: req.method, headers,
    body: outboundBody,
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
