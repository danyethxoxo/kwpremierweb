import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('hub/firmas.html', root), 'utf8');
let main = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).find(s => s.includes('let miUserId'));
main = main.slice(0, main.lastIndexOf("  if (document.documentElement.classList.contains('kw-auth-ok'))")) + `
window.qaFirmantes={preparar:prepararFirmantes,leer:leerFirmantes,agregar:agregarFirmante,
configurar:()=>{miUserId='usuario';miPerfil={nombre:'Asesor Premier',correo:'asesor@ejemplo.com'};mostrarVista('editor');}};
})();`;

test('selección voluntaria, sugerencias, favoritos inmediatos con guardado y búsqueda sin acentos', async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const width of [1366, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'kw.local') return route.abort();
        const file = new URL('.' + url.pathname, root);
        if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        let body = fs.readFileSync(file);
        if (url.pathname.endsWith('.html')) body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace('<html lang="es">', '<html lang="es" class="kw-auth-ok">');
        return route.fulfill({ body, contentType: url.pathname.endsWith('.html') ? 'text/html' : url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript' });
      });
      await page.goto('http://kw.local/hub/firmas.html');
      await page.addScriptTag({ url: '/assets/js/kw-ui.js' });
      await page.addScriptTag({ url: '/assets/js/kw-firma-puente.js' });
      await page.evaluate(() => {
        window.qaFavoritos = [];
        window.kwSupabase = { from() {
          let mode = '', filtros = {};
          const q = { select() { return q; }, eq(key, value) { filtros[key] = value; return q; },
            order: async () => ({ data: window.qaFavoritos, error: null }),
            upsert: async persona => { await new Promise(r => setTimeout(r, 700)); if (window.qaFallar) return { error: 'fallo' }; window.qaFavoritos = [persona]; return { error: null }; },
            delete() { mode = 'delete'; return q; },
            then(resolve) { if (mode === 'delete') window.qaFavoritos = window.qaFavoritos.filter(p => p.correo !== filtros.correo); return Promise.resolve({ error: null }).then(resolve); }
          }; return q;
        } };
      });
      await page.addScriptTag({ url: '/assets/js/kw-firmantes-personales.js' });
      await page.addScriptTag({ content: main });
      await page.evaluate(async () => {
        qaFirmantes.configurar();
        await kwFirmantesPersonales.iniciar({ userId: 'usuario', leer: qaFirmantes.leer, agregar: qaFirmantes.agregar });
        qaFirmantes.preparar();
        kwFirmantesPersonales.candidatos([{ nombre: 'Lucía Pérez', correo: 'lucia@ejemplo.com' }, { nombre: 'Cliente sin correo', correo: '' }]);
        document.getElementById('pantalla-carga').remove();
      });
      const iniciales = await page.evaluate(() => qaFirmantes.leer());
      assert.deepEqual(iniciales, []);
      assert.equal(await page.locator('#firmo-si').count(), 0);
      await page.locator('#posibles-firmantes summary').click();
      assert.equal(await page.locator('#posibles-firmantes-lista .firmante-persona').count(), 5);
      assert.equal(await page.locator('#posibles-firmantes-lista .firmante-persona-agregar').first().locator('span').innerText(), 'Tú');
      const lucia = page.locator('#posibles-firmantes-lista .firmante-persona').filter({ hasText: 'Lucía Pérez' });
      await lucia.locator('.firmante-persona-agregar').click();
      assert.equal(await page.locator('.firmante-fila').count(), 1);
      assert.equal(await lucia.locator('.firmante-persona-agregar').isDisabled(), true);
      await lucia.locator('.firmante-favorito').click();
      assert.equal(await lucia.locator('.firmante-favorito').getAttribute('aria-pressed'), 'true');
      assert.equal(await lucia.locator('.firmante-favorito').getAttribute('aria-busy'), 'true');
      assert.equal(await page.evaluate(() => window.qaFavoritos.length), 0);
      await page.waitForFunction(() => window.qaFavoritos.length === 1);
      await page.locator('[data-tab="favoritos"]').click();
      assert.equal(await page.locator('[data-panel="favoritos"]').isVisible(), true);
      await page.locator('#favoritos-firmantes-buscar').fill('LUCIA');
      assert.equal(await page.locator('#favoritos-firmantes-lista .firmante-persona').count(), 1);
      await page.evaluate(async () => kwFirmantesPersonales.iniciar({ userId: 'usuario', leer: qaFirmantes.leer, agregar: qaFirmantes.agregar }));
      assert.equal(await page.locator('#favoritos-firmantes-lista .firmante-persona').count(), 1);
      await page.locator('#favoritos-firmantes-lista .firmante-favorito').click();
      await page.waitForFunction(() => window.qaFavoritos.length === 0);
      assert.equal(await page.locator('#favoritos-firmantes-lista .firmante-persona').count(), 0);
      await page.locator('[data-tab="firmantes"]').click();
      await page.evaluate(() => { window.qaFallar = true; kwUI.alert = async () => {}; });
      await lucia.locator('.firmante-favorito').click();
      assert.equal(await lucia.locator('.firmante-favorito').getAttribute('aria-pressed'), 'true');
      await page.waitForFunction(() => document.querySelector('#posibles-firmantes-lista [data-favorito-correo="lucia@ejemplo.com"]').getAttribute('aria-busy') === 'false');
      assert.equal(await lucia.locator('.firmante-favorito').getAttribute('aria-pressed'), 'false');
      await page.screenshot({ path: path.join(os.tmpdir(), `kw-firmantes-personales-${width}.png`) });
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('el PDF conserva las personas capturadas al pasar del formulario a Firmas', async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.route('http://kw.local/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto('http://kw.local/acuerdo');
    const puente = fs.readFileSync(new URL('assets/js/kw-firma-puente.js', root), 'utf8');
    await page.addScriptTag({ content: puente });
    await page.evaluate(async () => {
      document.body.innerHTML = '<div hidden><input id="f-vendedor-nombre" value="Lucía Pérez"><input id="f-vendedor-correo" value="lucia@ejemplo.com"></div>';
      await kwFirmaPuente.guardar(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), 'Acuerdo.pdf', { documentoId: 'acuerdo-original' });
    });
    await page.goto('http://kw.local/firmas');
    await page.addScriptTag({ content: puente });
    const traslado = await page.evaluate(async () => {
      const p = await kwFirmaPuente.consumir();
      return { nombre: p.nombre, documentoId: p.documentoId, esPDF: p.blob.type === 'application/pdf', personas: p.posiblesFirmantes, siguiente: await kwFirmaPuente.consumir() };
    });
    assert.deepEqual(traslado, { nombre: 'Acuerdo.pdf', documentoId: 'acuerdo-original', esPDF: true, personas: [{ nombre: 'Lucía Pérez', correo: 'lucia@ejemplo.com' }], siguiente: null });
  } finally { await browser.close(); }
});
