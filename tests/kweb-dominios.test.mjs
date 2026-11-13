import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../deployment/kweb-worker.mjs';
const source = fs.readFileSync(new URL('../assets/js/kw-security.js', import.meta.url), 'utf8');
function browser(href, active = false) {
  const url = new URL(href), redirected = [];
  const location = { origin: url.origin, hostname: url.hostname, host: url.host, protocol: url.protocol, pathname: url.pathname, search: url.search, hash: url.hash, href: url.href, replace: x => redirected.push(x) };
  const context = vm.createContext({ window: { fetch: async () => ({}) }, location, URL, Request, TextEncoder });
  vm.runInContext(active ? source.replace('var KWEB_ACTIVO = false;', 'var KWEB_ACTIVO = true;') : source, context);
  return { context, redirected };
}
test('migracion: conserva parametros y tokens; la portada y documentacion siguen en Premier', () => {
  for (const path of ['/hub/firmas.html?id=123#vista', '/restablecer-password.html#access_token=ejemplo', '/documentos/contratos/renta.html?id=1']) {
    const { redirected } = browser('https://www.kwpremieroficial.com' + path, true);
    assert.deepEqual(redirected, ['https://kweb.com.mx' + path]);
  }
  for (const path of ['/', '/index.html', '/integraciones/propiedades.html', '/api.html', '/market-center.html']) assert.equal(browser('https://www.kwpremieroficial.com' + path, true).redirected.length, 0);
  assert.equal(browser('https://www.kwpremieroficial.com/portal.html').redirected.length, 0);
});
test('KWEB acepta enlaces propios antiguos sin aceptar destinos externos', () => {
  const s = browser('https://kweb.com.mx/portal.html').context.window.kwSecurity;
  assert.equal(s.notificationUrl('https://www.kwpremieroficial.com/hub/firmas.html?id=2'), 'https://kweb.com.mx/hub/firmas.html?id=2');
  assert.equal(s.notificationUrl('https://evil.test/hub/firmas.html'), '');
  assert.equal(s.notificationUrl('https://usuario:clave@www.kwpremieroficial.com/hub/firmas.html'), '');
});
test('worker: entrada KWEB, dominio canonico y cabeceras; no reemplaza la landing de Premier', async () => {
  const env = { ASSETS: { fetch: async req => new Response(new URL(req.url).pathname, { headers: { 'content-type': 'text/html' } }) } };
  const root = await worker.fetch(new Request('https://kweb.com.mx/?ref=1'), env);
  assert.equal(root.headers.get('location'), 'https://kweb.com.mx/portal.html?ref=1');
  const www = await worker.fetch(new Request('https://www.kweb.com.mx/login.html?redirect=perfil'), env);
  assert.equal(www.headers.get('location'), 'https://kweb.com.mx/login.html?redirect=perfil');
  const page = await worker.fetch(new Request('https://kweb.com.mx/hub/firmas.html'), env);
  assert.equal(await page.text(), '/hub/firmas.html');
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  const publicPage = await worker.fetch(new Request('https://kweb.com.mx/market-center.html'), env);
  assert.equal(publicPage.headers.get('location'), 'https://www.kwpremieroficial.com/market-center.html');
});
