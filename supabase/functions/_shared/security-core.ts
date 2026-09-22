// Pure helpers shared by the gateway and its regression tests.
export class HttpError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) { super(message) }
}

export function allowedOrigins(value: string): Set<string> {
  return new Set(value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const url = new URL(s)
    if (url.origin !== s || (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
      throw new Error('Invalid origin configuration')
    }
    return s
  }))
}

export function clientIp(headers: Headers, header = 'x-forwarded-for'): string {
  // The ingress must overwrite this header or append the connecting peer.
  // Never trust a client-supplied prefix of X-Forwarded-For.
  const raw = (headers.get(header) || '').split(',').at(-1)?.trim() || ''
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(raw) && raw.split('.').every((n) => Number(n) <= 255)) {
    return raw.split('.').map(Number).join('.')
  }
  if (raw.includes(':') && /^[0-9a-f:]+$/i.test(raw)) {
    try { return new URL(`http://[${raw}]/`).hostname.slice(1, -1) } catch { /* invalid IP */ }
  }
  // Missing/invalid IPs share a bucket; changing a malformed header cannot reset it.
  return 'unknown'
}

export function validEmail(value: unknown): boolean {
  return typeof value === 'string' && value.length <= 254 &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(value)
}

export function validPassword(value: unknown): boolean {
  // Supabase Auth owns hashing. Do not pre-hash passwords in the browser.
  return typeof value === 'string' && value.length >= 12 &&
    new TextEncoder().encode(value).length <= 72 && !/[\x00-\x1f\x7f]/.test(value)
}

export function validUuid(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function safeHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 8192 || /[\s<>"\\]/.test(value)) return false
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password } catch { return false }
}

export async function boundedBody(req: Request, maxBytes: number): Promise<Uint8Array> {
  if (Number(req.headers.get('content-length')) > maxBytes) throw new HttpError(413, 'Solicitud demasiado grande')
  const reader = req.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, 'Solicitud demasiado grande') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}

export function validateJson(value: unknown, depth = 0, budget = { nodes: 0 }): void {
  if (depth > 20 || ++budget.nodes > 50000) throw new HttpError(400, 'Estructura demasiado compleja')
  if (value === null || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new HttpError(400, 'Campo no permitido')
    validateJson(child, depth + 1, budget)
  }
}

export function gatewayTarget(requestUrl: string, supabaseUrl: string): URL {
  const url = new URL(requestUrl)
  const prefix = '/data-gateway/'
  const start = url.pathname.indexOf(prefix)
  const path = start < 0 ? '' : url.pathname.slice(start + prefix.length)
  // Fixed host and API prefix: never accept arbitrary upstream URLs or paths.
  if (!/^(?:[a-z_][a-z0-9_]*|rpc\/[a-z_][a-z0-9_]*)$/.test(path)) {
    throw new HttpError(404, 'Ruta no encontrada')
  }
  return new URL(`/rest/v1/${path}${url.search}`, supabaseUrl)
}
