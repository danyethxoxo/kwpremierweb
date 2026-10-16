// Read-only site inventory and isolated browser audit. Never uses a real session.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, process.env.KW_AUDIT_OUTPUT || 'artifacts/auditoria');
mkdirSync(output, { recursive: true });
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
const pages = tracked.filter(file => file.endsWith('.html'));
const routes = pages.concat(pages.filter(file => /^documentos\/(contratos|acuerdos)\/(?!index)/.test(file)).map(file => file + '?nuevo=1'));
const missing = [];
for (const file of tracked.filter(file => /\.(html|css)$/.test(file))) {
  const text = readFileSync(resolve(root, file), 'utf8');
  const refs = [...text.matchAll(/\b(?:src|href)=["']([^"'<>]+)["']/g), ...text.matchAll(/(?:url\(|@import\s+)["']?([^"')\s;]+)["']?\)?/g)];
  for (const match of refs) {
    const value = match[1];
    if (!value || /^(?:[a-z]+:|\/\/|#)/i.test(value) || /[${}<>]|&quot;/.test(value)) continue;
    const pathname = decodeURIComponent(value.split(/[?#]/)[0]);
    if (!pathname || !/\.[a-z0-9]{2,8}$/i.test(pathname)) continue;
    const target = resolve(root, pathname.startsWith('/') ? '.' + pathname : dirname(file) + '/' + pathname);
    if (!existsSync(target)) missing.push({ file, reference: value });
  }
}
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'qa@example.com', last_sign_in_at: new Date().toISOString(), user_metadata: {} };
const profile = { ...user, role: 'master', nombre: 'Auditoría', apellido: 'QA', foto_url: '/assets/img/logo-kw-premier.png', whatsapp: '5512345678', sitio_web: 'https://qa.kw.com', puede_dictaminar: true };
const sdk = `(() => {
const user=${JSON.stringify(user)}, profile=${JSON.stringify(profile)};
const session={user, access_token:'header.'+btoa(JSON.stringify({amr:[{method:'password',timestamp:Date.now()/1000}]}))+'.signature'};
const query=(table)=>{let single=false;const q=new Proxy({}, {get(_,key){
if(key==='then')return (ok,bad)=>{let data=table==='profiles'?[profile]:[];if(single)data=data[0]||null;return Promise.resolve({data,error:null,count:Array.isArray(data)?data.length:1}).then(ok,bad);};
return (...args)=>{if(key==='single'||key==='maybeSingle')single=true;return q;};}});return q;};
const client={auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),refreshSession:async()=>({data:{session}}),signOut:async()=>({error:null})},
from:query,rpc:async(name)=>({data:name==='firmas_disponibles'?{sin_tope:true}:[],error:null}),
functions:{invoke:async()=>({data:{ok:true,personas:[],asesores:[],cuentas:[],archivos:[],eventos:[]},error:null})},
storage:{from(){return {getPublicUrl(path){return {data:{publicUrl:'https://qa.invalid/'+path}};},list:async()=>({data:[],error:null})};}},
channel(){return {on(){return this;},subscribe(){return this;},unsubscribe(){}};},removeChannel(){}};
window.supabase={createClient(){return client;}};
})();`;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
const results = [];
const widths = (process.env.KW_AUDIT_WIDTHS || '1440,768,320').split(',').map(Number);
const filter = process.env.KW_AUDIT_FILTER ? new RegExp(process.env.KW_AUDIT_FILTER) : null;
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/functions/v1/mfa-correo')) return route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ activo: true, verificado: true, requerido: true, usuario: user, perfil: profile }) });
      if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/@supabase/')) return route.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: sdk });
      // No business writes, email or external integrations can leave the test.
      if (url.hostname !== 'kw.local') return route.abort();
      const file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!relative(root, file).startsWith('..') && existsSync(file) && statSync(file).isFile()) {
        let body = readFileSync(file);
        if (extname(file) === '.html') body = body.toString('utf8').replace(/\s+(?:integrity|crossorigin)="[^"]*"/g, '');
        return route.fulfill({ contentType: mime[extname(file)] || 'application/octet-stream', body });
      }
      return route.fulfill({ status: 404, body: '' });
    });
    for (const file of routes.filter(file => !filter || filter.test(file))) {
      const page = await context.newPage();
      const errors = [], notFound = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() === 404 && response.url().includes('kw.local')) notFound.push(new URL(response.url()).pathname); });
      const started = Date.now();
      let measurement = {};
      try {
        await page.goto('https://kw.local/' + file, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(700);
        if (file.includes('?nuevo=1')) await page.locator('details').evaluateAll(els => els.forEach(el => { el.open = true; }));
        measurement = await page.evaluate(() => {
          const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return !el.closest('[aria-hidden="true"]') && r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
          const name = el => el.getAttribute('aria-label') || el.getAttribute('title') || el.labels?.[0]?.textContent.trim() || el.textContent.trim() || el.querySelector('img')?.alt || '';
          const identify = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '.' + [...el.classList].slice(0, 2).join('.'));
          return {
            url: location.pathname, title: document.title,
            overflow: document.documentElement.scrollWidth - innerWidth,
            overflowing: [...document.querySelectorAll('body *')].filter(visible).filter(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right > innerWidth + 2 && !el.closest('.drawer,.kw-lateral,.kw-select-lista,.kw-menu,.page,.kw-documento-hojas,[hidden]'); }).slice(0, 12).map(identify),
            errorsVisible: [...document.querySelectorAll('.msg.error,.kw-error,[role="alert"]')].filter(visible).map(el => el.textContent.trim()).filter(Boolean),
            unlabeledButtons: [...document.querySelectorAll('button,[role="button"]')].filter(visible).filter(el => !name(el)).map(identify),
            unlabeledInputs: [...document.querySelectorAll('input:not([type="hidden"]),textarea,select')].filter(visible).filter(el => !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.title).map(identify),
            unlabeledInputMarkup: [...document.querySelectorAll('input:not([type="hidden"]),textarea,select')].filter(visible).filter(el => !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.title).slice(0,8).map(el => el.outerHTML),
            duplicateIds: [...new Set([...document.querySelectorAll('[id]')].map(el => el.id))].filter(id => [...document.querySelectorAll('[id]')].filter(el => el.id === id).length > 1),
            controls: document.querySelectorAll('button,a[href],input,select,textarea').length,
            bodyVisible: getComputedStyle(document.body).visibility,
            navMs: Math.round(performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0)
          };
        });
        await page.screenshot({ path: resolve(output, file.replaceAll('/', '-').replace(/[?=]/g, '-') + '-' + width + '.png') });
      } catch (error) { errors.push(error.message); }
      const result = { file, width, durationMs: Date.now() - started, ...measurement, errors: [...new Set(errors)], notFound: [...new Set(notFound)] };
      results.push(result);
      console.log(JSON.stringify(result));
      await page.close();
    }
    await context.close();
  }
} finally { await browser.close(); }
writeFileSync(resolve(output, 'resultado.json'), JSON.stringify({ capturedAt: new Date().toISOString(), mode: 'isolated-mock', pages: pages.length, missing, results }, null, 2));
console.log(JSON.stringify({ pages: pages.length, captures: results.length, missing }));
