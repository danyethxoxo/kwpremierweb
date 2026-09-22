import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
function browser() {
  const calls = [];
  const context = vm.createContext({ window: { fetch: (...args) => { calls.push(args); return Promise.resolve(new Response()); } },
    location: { origin: 'https://www.kwpremieroficial.com', href: 'https://www.kwpremieroficial.com/', protocol: 'https:', hostname: 'www.kwpremieroficial.com' }, URL, Request, TextEncoder });
  vm.runInContext(readFileSync(new URL('assets/js/kw-security.js', root), 'utf8'), context);
  return { ...context.window, calls };
}
test('XSS: escape both quotes, preserve text, reject active URL protocols and external notifications', () => {
  const { kwSecurity: s } = browser();
  assert.equal(s.escapeHtml('\"><img src=x onerror=alert(1)>\''), '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&#39;');
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>', 'java\nscript:alert(1)', 'https://user:password@example.com/']) assert.equal(s.safeUrl(url), '');
  assert.equal(s.safeUrl('//evil.example/path', true), '');
  assert.equal(s.safeUrl('/hub/firmas.html', true), 'https://www.kwpremieroficial.com/hub/firmas.html');
});
test('SDK routes only Data API calls through gateway and preserves body, query, authorization and signal', async () => {
  const { kwSecureFetch, calls } = browser();
  const options = { method: 'POST', body: '{"nombre":"Ana"}', headers: { Authorization: 'Bearer test-user' } };
  await kwSecureFetch('https://iloetojomzqtadkithtv.supabase.co/rest/v1/profiles?select=id', options);
  assert.equal(calls[0][0], 'https://iloetojomzqtadkithtv.supabase.co/functions/v1/data-gateway/profiles?select=id');
  assert.equal(calls[0][1], options);
  await kwSecureFetch('https://iloetojomzqtadkithtv.supabase.co/auth/v1/user', options);
  assert(calls[1][0].includes('/auth/v1/user'));
  const request = new Request('https://iloetojomzqtadkithtv.supabase.co/rest/v1/profiles', options);
  await kwSecureFetch(request);
  assert.equal(await calls[2][0].text(), options.body);
  assert.equal(calls[2][0].headers.get('Authorization'), 'Bearer test-user');
});
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => item.name.startsWith('.') || item.name === 'node_modules' ? [] : item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)]);
}
test('all pages load security before Supabase and all inline JavaScript parses', () => {
  const paths = walk(root.pathname.replace(/^\/([A-Z]:)/i, '$1'));
  for (const file of paths.filter((p) => p.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    if (html.includes('<head')) assert(html.includes('/assets/js/kw-security.js?v=20260922'), file);
    if (html.includes('@supabase/supabase-js')) assert(html.indexOf('kw-security.js') < html.indexOf('@supabase/supabase-js'), file);
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/src=|application\/ld\+json|type=["']module/.test(match[1]) || !match[2].trim()) continue;
      assert.doesNotThrow(() => new vm.Script(match[2], { filename: file }));
    }
    if (html.includes('createClient(SUPABASE_URL, SUPABASE_KEY')) assert(html.includes('fetch: window.kwSecureFetch'), file);
  }
});
