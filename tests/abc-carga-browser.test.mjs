import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const ruta = '/documentos/internos/dt/abc-tracker.html';
const guard = `
window.kwSupabase = {
  auth: { getUser: async () => ({data:{user:{id:'qa',email:'qa@example.com'}}}),
    getSession: async () => ({data:{session:{access_token:'qa'}}}) },
  from(tabla) {
    const datos = {profiles:[{id:'qa',role:'staff',nombre:'QA'}],
      abc_temas:[{id:1,orden:1,sesion:1,nombre:'Tema QA'}],
      abc_asesores:[{kwid:'1',nombre:'Asesor QA',dt_asignado:'DT QA',activo:true}],
      abc_avance:[{kwid:'1',tema_id:1}]};
    let single = false;
    const query = new Proxy({}, {get(target, key) {
      if(key==='then') return (resolve,reject) => Promise.resolve({data:single?(datos[tabla]||[])[0]:(datos[tabla]||[])}).then(resolve,reject);
      return () => { if(key==='single'||key==='maybeSingle') single=true; return query; };
    }});
    return query;
  },
  channel() {return {on(){return this;},subscribe(){return this;}};}
};
document.documentElement.classList.add('kw-auth-ok');
window.kwRevisarSesion=async()=>{};
window.kwLogout=()=>{};
`;

test('ABC permanece usable con Excel lento, sin descargar el exportador, en escritorio y móvil', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errores = [], exportadores = [];
      let liberarSync;
      const sync = new Promise(resolve => { liberarSync = resolve; });
      page.on('pageerror', error => errores.push(error.message));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.includes('/functions/v1/')) {
          await sync;
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({nuevos:[],reactivados:[],bajas:[]}) });
        }
        if (url.pathname.includes('/xlsx@')) {
          exportadores.push(url.href);
          return route.fulfill({ contentType: 'application/javascript', body: `window.XLSX={utils:{json_to_sheet:()=>({}),book_new:()=>({}),book_append_sheet:()=>{}},writeFile:()=>{window.qaExportado=true;}};` });
        }
        if (url.hostname !== 'kw.local') return route.abort();
        if (url.pathname === '/assets/js/auth-guard.js') return route.fulfill({contentType:'application/javascript',body:guard});
        const file = path.join(root, decodeURIComponent(url.pathname));
        if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({status:404,body:''});
        const contentType = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
        return route.fulfill({contentType, body:fs.readFileSync(file)});
      });
      await page.goto('http://kw.local' + ruta, {waitUntil:'domcontentloaded'});
      await page.locator('.fila').first().waitFor({state:'visible',timeout:5000});
      await page.waitForFunction(() => document.getElementById('btn-sync').disabled);
      assert.equal(exportadores.length, 0);
      await page.evaluate(() => {
        const input = document.getElementById('busq');
        input.value = 'Asesor QA';
        input.dispatchEvent(new Event('input', {bubbles:true}));
      });
      assert.equal(await page.locator('.fila').count(), 1);
      await page.evaluate(() => document.getElementById('btn-exportar').click());
      await page.waitForFunction(() => window.qaExportado === true);
      assert.equal(exportadores.length, 1);
      liberarSync();
      await page.waitForFunction(() => !document.getElementById('btn-sync').disabled);
      assert.deepEqual(errores, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
