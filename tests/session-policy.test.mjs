import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';

const day = 86400000;
function session(started, extra = []) {
  const payload = Buffer.from(JSON.stringify({ amr: [{ method: 'password', timestamp: started / 1000 }, ...extra] })).toString('base64url');
  return { access_token: 'header.' + payload + '.signature', user: { last_sign_in_at: new Date(started).toISOString() } };
}
function browser(responses = [], current = session(Date.now())) {
  const stored = new Map(), requests = [];
  let refreshes = 0;
  const context = vm.createContext({ window: {}, localStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    crypto: webcrypto, btoa, atob, AbortController, clearTimeout, Date,
    setTimeout: (callback, delay) => delay < 12000 ? setTimeout(callback, 0) : 0,
    fetch: async (url, options) => {
      requests.push({ url, options });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next || Response.json({ activo: true, verificado: true });
    }
  });
  vm.runInContext(readFileSync(new URL('../assets/js/kw-session.js', import.meta.url), 'utf8'), context);
  const client = { auth: {
    getSession: async () => ({ data: { session: current } }),
    refreshSession: async () => { refreshes++; return { data: { session: current } }; }
  } };
  return { api: context.window.kwSession, client, requests, stored, refreshes: () => refreshes };
}

test('password is requested after 24 hours, refreshing the token does not restart that clock', () => {
  const { api } = browser();
  const now = Date.now();
  assert.equal(api.loginExpired(session(now - day + 1), now), false);
  assert.equal(api.loginExpired(session(now - day), now), true);
  assert.equal(api.loginExpired(session(now - 2 * day, [{ method: 'token_refresh', timestamp: now / 1000 }]), now), true);
  assert.equal(api.loginExpired(session(now - 1000), now), false);
});

test('device identifier survives navigation and sign-in cycles', () => {
  const { api, stored } = browser();
  const token = api.deviceToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(api.deviceToken(), token);
  assert.equal(stored.get('kw_device_token_v1'), token);
});

test('temporary MFA outages retry without requesting a password or dropping the session', async () => {
  const { api, client, requests } = browser([Response.json({}, { status: 503 }), new TypeError('network down')]);
  const state = await api.mfaState(client);
  assert.equal(state.verificado, true);
  assert.equal(requests.length, 3);
  assert.ok(requests.every(({ options }) => JSON.parse(options.body).accion === 'estado'));
});

test('persistent outages remain errors, 401 refreshes once, and missing/old sessions do not call MFA', async () => {
  let b = browser([Response.json({}, { status: 503 }), Response.json({}, { status: 503 }), Response.json({}, { status: 503 })]);
  await assert.rejects(() => b.api.mfaState(b.client), /comprobar/);
  b = browser([Response.json({}, { status: 401 })]);
  assert.equal((await b.api.mfaState(b.client)).verificado, true);
  assert.equal(b.refreshes(), 1);
  b = browser([], null);
  assert.equal((await b.api.mfaState(b.client)).sin_sesion, true);
  assert.equal(b.requests.length, 0);
  b = browser([], session(Date.now() - day - 1000));
  assert.equal((await b.api.mfaState(b.client)).requiere_login, true);
  assert.equal(b.requests.length, 0);
});

test('protected pages use the same session policy and no four-second login redirect', () => {
  function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.name.startsWith('.') || entry.name === 'node_modules' ? [] :
      entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
  }
  for (const path of walk(process.cwd()).filter((path) => path.endsWith('.html'))) {
    const html = readFileSync(path, 'utf8');
    if (!html.includes('<script src="/assets/js/auth-guard.js')) continue;
    assert.ok(html.includes('/assets/js/auth-guard.js?v=20261001'), path);
    assert.ok(html.indexOf('/assets/js/kw-session.js?v=20261001') < html.indexOf('<script src="/assets/js/auth-guard.js'), path);
    assert.ok(!/setTimeout\([\s\S]{0,400}kw-auth-ok[\s\S]{0,400}4000/.test(html), path);
  }
});

test('back navigation rechecks the session; connection errors offer retry without login or sign-out', async () => {
  function element() {
    const classes = new Set();
    return { children: [], style: {}, classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
      setAttribute() {}, addEventListener() {}, replaceChildren() { this.children = []; },
      append(...items) { this.children.push(...items); }, appendChild(item) { item.parentNode = this; this.children.push(item); },
      removeChild(item) { this.children = this.children.filter((child) => child !== item); }
    };
  }
  const events = new Map(), redirects = [], signouts = [], ready = [];
  const root = element(), body = element();
  let state = { activo: true, verificado: true }, calls = 0;
  const window = {
    kwSession: { deviceToken: () => 'a'.repeat(43), loginExpired: () => false, mfaState: async () => { calls++; if (state instanceof Error) throw state; return state; } },
    supabase: { createClient: () => ({ auth: { signOut: async (options) => { signouts.push(options); return {}; }, getSession: async () => ({ data: { session: {} } }) } }) },
    addEventListener: (name, callback) => events.set(name, callback), dispatchEvent: (event) => ready.push(event.type)
  };
  const context = vm.createContext({ window,
    document: { body, head: element(), documentElement: root, visibilityState: 'visible', createElement: element, getElementById: () => null, addEventListener() {} },
    location: { pathname: '/hub/firmas.html', search: '', replace: (url) => redirects.push(url) },
    localStorage: { setItem() {}, removeItem() {} }, Date,
    CustomEvent: class { constructor(type) { this.type = type; } }, setTimeout: () => 0, setInterval: () => 0
  });
  vm.runInContext(readFileSync(new URL('../assets/js/auth-guard.js', import.meta.url), 'utf8'), context);
  await window.kwRevisarSesion();
  assert.equal(root.classList.contains('kw-auth-ok'), true);
  assert.equal(calls, 1);
  assert.deepEqual(ready, ['kw-auth-ready']);
  state = new Error('temporary outage');
  events.get('pageshow')({ persisted: true });
  await window.kwRevisarSesion();
  assert.equal(root.classList.contains('kw-auth-ok'), false);
  assert.equal(redirects.length, 0);
  assert.equal(signouts.length, 0);
  state = { activo: true, verificado: true };
  await window.kwRevisarSesion();
  assert.equal(root.classList.contains('kw-auth-ok'), true);
  assert.equal(ready.length, 1);
  state = { requiere_login: true };
  await window.kwRevisarSesion();
  assert.equal(signouts.length, 1);
  assert.equal(signouts[0].scope, 'local');
  assert.match(redirects[0], /login.html\?redirect=/);
});
