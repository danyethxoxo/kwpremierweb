import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = fs.readFileSync(path.join(root, 'hub/firmas.html'), 'utf8');
const start = source.indexOf('  function prepararPanelHistorial(');
const layout = source.slice(start, source.indexOf('\n  }', start) + 4);
test('firmas: filtros laterales, foco, cierre y valores conservados al cambiar de ancho', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'kw.local') return route.abort();
      const file = path.join(root, url.pathname);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      let body = fs.readFileSync(file);
      if (file.endsWith('.html')) {
        body = body.toString('utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace('<html lang="es">', '<html lang="es" class="kw-auth-ok">')
          .replace('</body>', `<script src="/assets/js/kw-ui.js"></script><script src="/assets/js/drawer.js" data-menu="hub"></script>
            <script>const $=id=>document.getElementById(id);${layout}
            prepararPanelHistorial();document.getElementById('pantalla-carga').remove();</script>
            <script src="/assets/js/kw-lateral.js"></script></body>`);
      }
      return route.fulfill({ body, contentType: file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream' });
    });
    await page.goto('http://kw.local/hub/firmas.html');
    assert.deepEqual(errors, []);
    await page.evaluate(() => {
      document.getElementById('resumen').innerHTML = ['Esperando firmas', 'Firmados', 'Borradores'].map((name, i) =>
        `<button class="kw-conteo"><span class="kw-conteo-num">${[30,103,8][i]}</span><span class="kw-conteo-txt">${name}</span></button>`).join('');
      document.getElementById('lista-envios').innerHTML = ['CONTRATO_DE_ARRENDAMIENTO_Y_ANEXOS.pdf', 'Acuerdo entre asesores.pdf'].map(name =>
        `<div class="tabla-fila"><label class="fila-check"><input type="checkbox"></label><button class="zona-doc"><span class="env-nombre">${name}</span><span class="env-quien">Sin identificar</span></button>
        <button class="zona-info"><span class="env-tags"></span><span class="env-estado"><span class="env-punto"></span><span class="env-estado-txt">Esperando firmas 2/4</span></span><span class="env-fecha">7 oct 2026</span></button>
        <span class="fila-botones"><button class="env-menu-btn" aria-label="Editar">✎</button><button class="env-menu-btn" aria-label="Opciones">⋮</button></span></div>`).join('');
    });
    const filters = page.locator('#firmas-panel-pagina');
    const trigger = page.getByRole('button', { name: 'Filtros', exact: true });
    assert.equal(await page.locator('#firmas-panel-pagina #f-estado').count(), 1);
    await page.locator('#f-estado').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#f-estado').isVisible(), false, await filters.evaluate(el => JSON.stringify({ class: el.className, visibility: getComputedStyle(el).visibility, display: getComputedStyle(el).display })));
    await trigger.click();
    await page.getByRole('dialog', { name: 'Resumen y filtros de firmas' }).waitFor();
    await page.locator('#f-estado').selectOption('completado');
    await page.locator('.kw-select:has(#f-estado) .kw-select-btn').click();
    await page.keyboard.press('Escape');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('body').evaluate(el => el.style.overflow), 'hidden');
    await page.locator('#f-orden').selectOption('fecha-asc');
    await page.locator('#f-desde').click();
    await page.locator('.kw-calendario').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('body').evaluate(el => el.style.overflow), 'hidden');
    await page.locator('#f-desde').click();
    await page.locator('.kw-calendario [data-fecha]').first().click();
    const date = await page.locator('#f-desde').inputValue();
    assert.match(date, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    await page.getByRole('button', { name: 'Cerrar filtros' }).focus();
    await page.keyboard.press('Shift+Tab');
    assert.ok(await filters.evaluate(el => el.contains(document.activeElement)));
    fs.mkdirSync(path.join(root, 'artifacts/firmas-mobile'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'artifacts/firmas-mobile/filters.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.locator('#f-estado').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#f-estado').isVisible(), false);
    assert.ok(await trigger.evaluate(el => el === document.activeElement));
    await page.screenshot({ path: path.join(root, 'artifacts/firmas-mobile/list.png'), animations: 'disabled' });
    for (const width of [320, 610, 901]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.locator('.tabla-fila').first().evaluate(el => el.getBoundingClientRect().right <= document.documentElement.clientWidth));
      await page.screenshot({ path: path.join(root, `artifacts/firmas-mobile/list-${width}.png`), animations: 'disabled' });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#f-estado').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#f-estado').inputValue(), 'completado');
    assert.equal(await page.locator('#f-orden').inputValue(), 'fecha-asc');
    assert.equal(await page.locator('#f-desde').inputValue(), date);
    await page.setViewportSize({ width: 320, height: 700 });
    await trigger.click();
    assert.equal(await page.locator('#f-estado').inputValue(), 'completado');
    await page.getByRole('button', { name: 'Cerrar filtros' }).click();
    assert.equal(await page.locator('#f-estado').count(), 1);
    assert.equal(await page.locator('#notif-bell-slot').count(), 1);
  } finally { await browser.close(); }
});
