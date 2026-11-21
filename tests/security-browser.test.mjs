import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
function browser(responder=()=>Promise.resolve(new Response())) {
  const calls = [];
  const context = vm.createContext({ window: { fetch: (...args) => { calls.push(args); return responder(...args); } },
    location: { origin: 'https://www.kwpremieroficial.com', href: 'https://www.kwpremieroficial.com/', protocol: 'https:', hostname: 'www.kwpremieroficial.com' }, URL, Request, Headers, TextEncoder, AbortSignal });
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
  assert.equal(calls[0][1].body, options.body);
  assert.equal(calls[0][1].headers.get('Authorization'),options.headers.Authorization);
  assert.equal(calls[0][1].headers.get('x-region'),'us-west-2');
  await kwSecureFetch('https://iloetojomzqtadkithtv.supabase.co/auth/v1/user', options);
  assert(calls[1][0].includes('/auth/v1/user'));
  const request = new Request('https://iloetojomzqtadkithtv.supabase.co/rest/v1/profiles', options);
  await kwSecureFetch(request);
  assert.equal(await calls[2][0].text(), options.body);
  assert.equal(calls[2][0].headers.get('Authorization'), 'Bearer test-user');
});

test('inventario usa la region de la base y solo reintenta lecturas ante indisponibilidad',async()=>{
 const url='https://iloetojomzqtadkithtv.supabase.co/rest/v1/rpc/propiedades_inventario_pagina';
 let total=0;
 const {kwSecureFetch,calls}=browser(async()=>new Response('{}',{status:++total===1?503:200}));
 const abort=new AbortController();
 const options={method:'POST',body:'{"p_pagina":1}',headers:{Authorization:'Bearer fixture'},signal:abort.signal};
 assert.equal((await kwSecureFetch(url,options)).status,200);
 assert.equal(calls.length,2);
 assert.equal(calls[0][1].headers.get('x-region'),'us-west-2');
 assert.equal(calls[1][1].headers.get('x-region'),null);
 for(const call of calls){assert.equal(call[1].body,options.body);assert.equal(call[1].headers.get('Authorization'),'Bearer fixture');assert.equal(call[1].signal,abort.signal);}
 for(const status of [401,403,429]){
  const b=browser(async()=>new Response('{}',{status}));
  assert.equal((await b.kwSecureFetch(url,options)).status,status);assert.equal(b.calls.length,1);
 }
 const write=browser(async()=>new Response('{}',{status:503}));
 await write.kwSecureFetch('https://iloetojomzqtadkithtv.supabase.co/rest/v1/propiedades',options);
 assert.equal(write.calls.length,1);assert.equal(write.calls[0][1].body,options.body);assert.equal(write.calls[0][1].headers.get('x-region'),'us-west-2');
 const profile=browser(async()=>new Response('{}',{status:503}));
 await profile.kwSecureFetch('https://iloetojomzqtadkithtv.supabase.co/rest/v1/profiles?select=id',{headers:{Authorization:'Bearer fixture'}});
 assert.equal(profile.calls.length,2);assert.equal(profile.calls[1][1].headers.get('Authorization'),'Bearer fixture');
 const cancelled=browser(async()=>{throw Object.assign(new Error('cancelada'),{name:'AbortError'});});
 await assert.rejects(()=>cancelled.kwSecureFetch(url,options),/cancelada/);assert.equal(cancelled.calls.length,1);
 const request=browser(async()=>new Response('{}',{status:503}));
 await request.kwSecureFetch(new Request(url,options));
 assert.equal(request.calls.length,2);
 assert.equal(await request.calls[0][0].text(),options.body);assert.equal(await request.calls[1][0].text(),options.body);
});

test('review notifications repair legacy routes without allowing external destinations', () => {
  const { kwSecurity: s } = browser();
  assert.equal(s.notificationUrl('/kwpremierweb/hub/admin.html', 'resena'), 'https://www.kwpremieroficial.com/hub/resenas.html');
  assert.equal(s.notificationUrl('/hub/admin.html', 'resena'), 'https://www.kwpremieroficial.com/hub/resenas.html');
  assert.equal(s.notificationUrl('/kwpremierweb/hub/admin.html#asesores', 'reclutamiento'), 'https://www.kwpremieroficial.com/hub/admin.html#asesores');
  assert.equal(s.notificationUrl('https://evil.example/', 'resena'), '');
  assert.equal(s.notificationUrl('javascript:alert(1)', 'resena'), '');
});
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => item.name.startsWith('.') || ['node_modules','tmp','artifacts','outputs'].includes(item.name) ? [] : item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)]);
}
test('all pages load security before Supabase and all inline JavaScript parses', () => {
  const paths = walk(root.pathname.replace(/^\/([A-Z]:)/i, '$1'));
  for (const file of paths.filter((p) => p.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    if (html.includes('<head')) assert.match(html,/src=["']\/assets\/js\/kw-security\.js\?v=[^"']+["']/, file);
    if (html.includes('@supabase/supabase-js')) assert(html.indexOf('kw-security.js') < html.indexOf('@supabase/supabase-js'), file);
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/src=|application\/ld\+json|type=["']module/.test(match[1]) || !match[2].trim()) continue;
      assert.doesNotThrow(() => new vm.Script(match[2], { filename: file }));
    }
    if (html.includes('createClient(SUPABASE_URL, SUPABASE_KEY')) assert(html.includes('fetch: window.kwSecureFetch'), file);
  }
});
test('shared browser scripts parse', () => {
  const scripts = walk(new URL('assets/js/', root).pathname.replace(/^\/([A-Z]:)/i, '$1'));
  for (const file of scripts.filter((path) => path.endsWith('.js'))) {
    assert.doesNotThrow(() => new vm.Script(readFileSync(file, 'utf8'), { filename: file }), file);
  }
});
