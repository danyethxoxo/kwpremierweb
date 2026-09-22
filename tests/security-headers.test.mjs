import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../deployment/security-headers-worker.mjs';
test('HTTPS proxy redirects HTTP and attaches security headers without changing page content', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('<h1>KW</h1>', { headers: { 'Access-Control-Allow-Origin': '*' } });
  try {
    const redirect = await worker.fetch(new Request('http://www.kwpremieroficial.com/perfil.html?test=1'));
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('Location'), 'https://www.kwpremieroficial.com/perfil.html?test=1');
    const page = await worker.fetch(new Request('https://www.kwpremieroficial.com/'));
    assert.equal(await page.text(), '<h1>KW</h1>');
    assert.equal(page.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(page.headers.get('Strict-Transport-Security'), 'max-age=31536000');
    assert(page.headers.get('Content-Security-Policy').includes("frame-ancestors 'self'"));
    assert.equal(page.headers.get('Access-Control-Allow-Origin'), null);
  } finally { globalThis.fetch = original; }
});
