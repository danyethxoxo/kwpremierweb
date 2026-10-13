import { strict as assert } from 'node:assert'
import { deviceTrusted, loginExpired } from '../supabase/functions/mfa-correo/policy.ts'

Deno.test('MFA trusts each device for less than three inactive days regardless of network', () => {
  const now = Date.now()
  const device = (age: number) => ({ ultimo_acceso: new Date(now - age).toISOString(), ultimo_ip_hash: 'verified-ip' })
  assert(deviceTrusted(device(3 * 86400000 - 1), 'verified-ip', now))
  assert(!deviceTrusted(device(3 * 86400000), 'verified-ip', now))
  assert(deviceTrusted(device(1000), 'other-ip', now))
  assert(deviceTrusted(device(1000), '', now))
  assert(!deviceTrusted({ ultimo_acceso: 'invalid', ultimo_ip_hash: null }, '', now))
  assert(!deviceTrusted(device(-1000), '', now))
  assert(!deviceTrusted(null, 'verified-ip', now))
  // Activity renews the trust window, independently of when the code was entered.
  assert(deviceTrusted(device(86400000), 'verified-ip', now))
})

Deno.test('daily login uses actual authentication, not token refresh', () => {
  const now = Date.now()
  const claims = (age: number) => ({ amr: [
    { method: 'password', timestamp: (now - age) / 1000 },
    { method: 'token_refresh', timestamp: now / 1000 }
  ] })
  assert(!loginExpired(claims(86400000 - 1), undefined, now))
  assert(loginExpired(claims(86400000), undefined, now))
  assert(loginExpired(claims(2 * 86400000), undefined, now))
})

Deno.test('MFA endpoint renews known devices across networks and rejects inactive devices', async () => {
  const oldFetch = globalThis.fetch
  const names = ['SUPABASE_URL', 'SERVICE_ROLE_KEY']
  const previous = names.map((name) => Deno.env.get(name))
  Deno.env.set('SUPABASE_URL', 'https://project.supabase.co')
  Deno.env.set('SERVICE_ROLE_KEY', 'test-service')
  const now = Date.now()
  const userId = '11111111-1111-4111-8111-111111111111'
  const sessionId = '22222222-2222-4222-8222-222222222222'
  const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const verifiedIp = await hash('ip:192.0.2.7:test-service')
  let age = 1000, ipHash = verifiedIp, deleted = 0, authorized = 0, touched = 0, enrolled = true
  let profileRole = 'asesor'
  let identityReads = 0
  let readGate: Promise<void> | null = null
  const reads = new Set<string>()
  const knownHash = await hash(`${userId}:device:${'a'.repeat(43)}:test-service`)
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method || 'GET'
    if (method === 'GET' && ['/mfa_metodos', '/profiles', '/mfa_dispositivos'].some(path => url.pathname.endsWith(path))) {
      reads.add(url.pathname)
      if (readGate) await readGate
    }
    if (url.pathname.endsWith('/auth/v1/user')) { identityReads++; return Response.json({ id: userId, email: 'test@example.com', last_sign_in_at: new Date(now).toISOString() }) }
    if (url.pathname.endsWith('/mfa_metodos')) return Response.json(enrolled ? [{ activo: true, destino: 'security@example.com' }] : [])
    if (url.pathname.endsWith('/profiles')) return Response.json([{ id: userId, role: profileRole, nombre: 'QA' }])
    if (url.pathname.endsWith('/mfa_dispositivos')) {
      if (method === 'GET') return Response.json(url.searchParams.get('token_hash') === 'eq.' + knownHash
        ? [{ id: 'known-device', ultimo_ip_hash: ipHash, ultimo_acceso: new Date(now - age).toISOString() }] : [])
      touched++
      return new Response(null, { status: 204 })
    }
    if (url.pathname.endsWith('/mfa_sesiones')) {
      if (method === 'DELETE') deleted++
      else if (method === 'POST') {
        authorized++
        const row = JSON.parse(String(init?.body))
        assert(Date.parse(row.verificado_hasta) <= now + 86400000)
      }
      else throw new Error('An existing session must not override device/IP trust')
      return new Response(null, { status: 204 })
    }
    throw new Error('Unexpected request: ' + url.pathname)
  }
  try {
    const { handleMfa } = await import('../supabase/functions/mfa-correo/handler.ts')
    const request = (loginAge = 1000, deviceToken = 'a'.repeat(43)) => {
      const claims = { session_id: sessionId, amr: [{ method: 'password', timestamp: (now - loginAge) / 1000 }] }
      const token = 'header.' + btoa(JSON.stringify(claims)).replace(/=/g, '') + '.signature'
      return new Request('https://project.supabase.co/functions/v1/mfa-correo', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.7' },
        body: JSON.stringify({ accion: 'estado', dispositivo_token: deviceToken })
      })
    }
    const initial = await (await handleMfa(request())).json()
    assert.equal(initial.verificado, true)
    assert.equal(initial.usuario.id, userId)
    assert.equal(initial.perfil.id, userId)
    assert.equal(initial.perfil.nombre, 'QA')
    assert.equal(authorized, 1)
    assert.equal(touched, 1)
    ipHash = 'another-network'
    assert.equal((await (await handleMfa(request())).json()).verificado, true)
    assert.equal(deleted, 0)
    assert.equal(touched, 2)
    ipHash = verifiedIp; age = 3 * 86400000
    const inactive = await (await handleMfa(request())).json()
    assert.equal(inactive.verificado, false)
    assert.equal(inactive.usuario, undefined)
    assert.equal(inactive.perfil, undefined)
    assert.equal(deleted, 1)
    assert.equal((await (await handleMfa(request(2 * 86400000))).json()).requiere_login, true)
    assert.equal(deleted, 2)
    assert.equal(touched, 2)
    age = 1000
    assert.equal((await (await handleMfa(request(1000, 'b'.repeat(43)))).json()).verificado, false)
    assert.equal((await (await handleMfa(request())).json()).verificado, true)
    assert.equal(touched, 3)
    enrolled = false
    const before = authorized
    assert.equal((await (await handleMfa(request())).json()).verificado, true)
    assert.equal(authorized, before + 1)
    enrolled = true
    reads.clear()
    let releaseReads!: () => void
    readGate = new Promise(resolve => { releaseReads = resolve })
    const parallel = handleMfa(request())
    for (let i = 0; i < 50 && reads.size < 3; i++) await new Promise(resolve => setTimeout(resolve, 1))
    releaseReads()
    assert.equal(reads.size, 3, 'las tres lecturas deben empezar antes de recibir cualquiera')
    assert.equal((await (await parallel).json()).verificado, true)
    readGate = null
    enrolled = false
    profileRole = 'admin'
    const privileged = await (await handleMfa(request())).json()
    assert.equal(privileged.verificado, false)
    assert.equal(privileged.usuario, undefined)
    assert.equal(privileged.perfil, undefined)
    enrolled = true
    profileRole = 'asesor'
    const verifiedRequest = request()
    const verifiedUser = { id: userId, email: 'test@example.com', last_sign_in_at: new Date(now).toISOString(),
      aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date(now).toISOString() }
    const beforeIdentity = identityReads
    assert.equal((await (await handleMfa(verifiedRequest, {
      token: verifiedRequest.headers.get('Authorization')!.replace(/^Bearer /, ''), user: verifiedUser,
    })).json()).verificado, true)
    assert.equal(identityReads, beforeIdentity, 'no revalidar el token que acaba de validar el middleware')
    await handleMfa(request(), { token: 'another-token', user: verifiedUser })
    assert.equal(identityReads, beforeIdentity + 1, 'un contexto de otro token no se reutiliza')
  } finally {
    globalThis.fetch = oldFetch
    names.forEach((name, index) => previous[index] === undefined ? Deno.env.delete(name) : Deno.env.set(name, previous[index]!))
  }
})
