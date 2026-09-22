import { strict as assert } from 'node:assert'
import { allowedOrigins, boundedBody, clientIp, gatewayTarget, HttpError, validEmail, validPassword, validateJson } from '../supabase/functions/_shared/security-core.ts'
import { secureHandler } from '../supabase/functions/_shared/security.ts'

Deno.test('CORS accepts exact origins and rejects wildcards and URL paths', () => {
  assert(allowedOrigins('https://www.kwpremieroficial.com').has('https://www.kwpremieroficial.com'))
  for (const value of ['*', 'https://good.test/path', 'http://good.test']) assert.throws(() => allowedOrigins(value))
})
Deno.test('IP canonicalization ignores spoofed prefixes and groups missing/invalid headers', () => {
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 192.0.2.7' })), '192.0.2.7')
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '999.1.1.1' })), 'unknown')
  assert.equal(clientIp(new Headers()), 'unknown')
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '2001:0db8:0000:0000:0000:0000:0000:0001' })), '2001:db8::1')
})
Deno.test('email and password validation preserves accents and rejects malformed input', () => {
  assert(validEmail('cliente+ventas@example.com'))
  for (const value of ['a@', 'a@localhost', 'a@b.com\r\nBcc:otro@b.com', {}, 'a'.repeat(255) + '@b.com']) assert(!validEmail(value))
  assert(validPassword('una frase muy larga'))
  assert(!validPassword('corta'))
  assert(!validPassword('á'.repeat(37)))
  assert(!validPassword('una frase larga\n'))
})
Deno.test('body limit checks actual streamed bytes even without Content-Length', async () => {
  const req = new Request('https://example.test', { method: 'POST', body: 'x'.repeat(21) })
  await assert.rejects(() => boundedBody(req, 20), (error: unknown) => error instanceof HttpError && error.status === 413)
})
Deno.test('JSON rejects prototype keys and excessive recursion without stripping ordinary text', () => {
  assert.throws(() => validateJson(JSON.parse('{"__proto__":{"admin":true}}')))
  let deep: unknown = 'value'
  for (let i = 0; i < 25; i++) deep = { next: deep }
  assert.throws(() => validateJson(deep))
  validateJson({ nombre: "O'Connor", mensaje: "' OR 1=1; --", texto: '<script>alert(1)</script>' })
})
Deno.test('gateway only routes allowlisted paths on the configured host', () => {
  const base = 'https://project.supabase.co'
  assert.equal(gatewayTarget('https://project.supabase.co/functions/v1/data-gateway/profiles?select=id', base).href,
    'https://project.supabase.co/rest/v1/profiles?select=id')
  for (const path of ['https://evil.test', '../auth/v1', 'profiles%2f..', 'rpc/private.secret', 'profiles/other']) {
    assert.throws(() => gatewayTarget(`https://project.supabase.co/functions/v1/data-gateway/${path}`, base))
  }
})

Deno.test('middleware enforces auth, MFA, rates, CORS, malformed bodies and safe errors', async () => {
  const oldFetch = globalThis.fetch
  const vars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'DATA_GATEWAY_SECRET', 'ALLOWED_ORIGINS']
  const previous = vars.map((key) => Deno.env.get(key))
  Deno.env.set('SUPABASE_URL', 'https://project.supabase.co')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service')
  Deno.env.set('SUPABASE_ANON_KEY', 'test-anon')
  Deno.env.set('DATA_GATEWAY_SECRET', 'test-gateway')
  Deno.env.set('ALLOWED_ORIGINS', 'https://www.kwpremieroficial.com')
  let mfa = true, rate = true, outage = false, called = 0
  const scopes: string[] = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) {
      const token = new Headers(init?.headers).get('authorization')
      return Response.json(token === 'Bearer valid-user' ? { id: '11111111-1111-4111-8111-111111111111' } : { message: 'invalid' }, { status: token === 'Bearer valid-user' ? 200 : 401 })
    }
    if (url.includes('/rpc/security_consume_rate')) {
      const body = JSON.parse(String(init?.body))
      scopes.push(body.p_scope)
      return Response.json(outage ? { message: 'internal SQL detail' } : { allowed: rate, retry_after: 17 }, { status: outage ? 500 : 200 })
    }
    if (url.includes('/rpc/mfa_sesion_autorizada')) {
      assert.equal(new Headers(init?.headers).get('x-kw-gateway'), 'test-gateway')
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer valid-user')
      return Response.json(mfa)
    }
    throw new Error('Unexpected network request: ' + url)
  }
  const handler = secureHandler({ name: 'test' }, () => {
    called++
    return Response.json({ ok: true }, { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public' } })
  })
  const request = (token = 'valid-user', origin = 'https://www.kwpremieroficial.com', body = '{}') => new Request('https://project.supabase.co/functions/v1/test', {
    method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body,
  })
  try {
    assert.equal((await handler(request('valid-user', 'https://evil.test'))).status, 403)
    assert.equal(called, 0)
    assert.equal((await handler(request('invalid'))).status, 401)
    mfa = false
    assert.equal((await handler(request())).status, 403)
    assert.equal(called, 0)
    mfa = true
    const ok = await handler(request())
    assert.equal(ok.status, 200)
    assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://www.kwpremieroficial.com')
    assert.equal(ok.headers.get('Cache-Control'), 'no-store')
    assert.equal(called, 1)
    assert(scopes.includes('user:all') && scopes.includes('ip:all'))
    assert.equal((await handler(request('valid-user', 'https://www.kwpremieroficial.com', '{bad'))).status, 400)
    rate = false
    const limited = await handler(request())
    assert.equal(limited.status, 429)
    assert.equal(limited.headers.get('Retry-After'), '17')
    rate = true; outage = true
    const failed = await handler(request())
    assert.equal(failed.status, 503)
    assert(!await failed.text().then((text) => text.includes('SQL')))
  } finally {
    globalThis.fetch = oldFetch
    vars.forEach((key, i) => previous[i] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[i]!))
  }
})
