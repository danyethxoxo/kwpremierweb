import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
const root = new URL('../', import.meta.url);

test('barra lateral y búsqueda ocultan accesos internos a asociados, sin destellos al cargar', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    for (const role of ['asociado', 'staff', 'admin', 'master']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => {
        const u = new URL(r.request().url());
        if (u.hostname !== 'kw.local') return r.abort();
        if (u.pathname === '/portal.html') return r.fulfill({ contentType: 'text/html', body: `<html class="kw-auth-ok"><head><link rel="stylesheet" href="/assets/css/kw-base.css"></head><body><main id="contenido-panel"></main><script>
          window.kwSupabase={auth:{getSession:async()=>({data:{session:null}})}}; window.kwSecurity={escapeHtml:String,safeUrl:s=>s};
          window.kwSession={usuarioInicial:async()=>({data:{user:{id:'qa'}}}),perfilInicial:()=>new Promise(resolve=>window.qaPerfilListo=resolve)};
          </script><script src="/assets/js/drawer.js" data-menu="hub"></script></body></html>` });
        const p = new URL(u.pathname.slice(1), root);
        if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: '' });
        return r.fulfill({ contentType: u.pathname.endsWith('.js') ? 'application/javascript' : 'text/css', body: fs.readFileSync(p) });
      });
      await page.goto('https://kw.local/portal.html');
      await page.waitForFunction(() => !!window.qaPerfilListo);
      assert.equal(await page.locator('#drawer a[href*="accesosdirectos"]').count(), 0);
      for (const ruta of ['documentos/internos/index.html', 'hub/admin.html']) assert.equal(await page.locator('#drawer a[href*="' + ruta + '"]').isVisible(), false);
      await page.evaluate(role => window.qaPerfilListo({ data: { role, nombre: 'Prueba', apellido: 'Asesor' } }), role);
      await page.waitForFunction(() => document.querySelector('#drawer-usuario-nombre')?.textContent === 'Prueba Asesor');
      for (const ruta of ['documentos/internos/index.html', 'hub/admin.html']) {
        assert.equal(await page.locator('#drawer a[href*="' + ruta + '"]').evaluate(el => el.hidden), role === 'asociado');
      }
      await page.locator('#drawer-buscar-toggle').click();
      await page.locator('#search-bar').fill('panel');
      await page.waitForTimeout(250);
      assert.equal(await page.locator('#kw-buscar-resultados a[href*="hub/admin.html"]').count() > 0, role !== 'asociado');
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
