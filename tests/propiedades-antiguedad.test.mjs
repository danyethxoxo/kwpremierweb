import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium } from 'playwright';

const html = fs.readFileSync(new URL('../propiedades.html', import.meta.url), 'utf8');
const start = html.indexOf('  function antiguedadPublicacion(');
const source = html.slice(start, html.indexOf('\n  function tarjeta(', start));
test('antiguedad: hoy, singular, plural, meses y fechas ausentes o invalidas', () => {
  const scope = vm.createContext({});
  vm.runInContext(source, scope);
  const now = Date.parse('2026-11-01T18:00:00Z');
  const relative = days => scope.antiguedadPublicacion(new Date(now - days * 86400000).toISOString(), now);
  assert.equal(relative(0), 'Hoy');
  assert.equal(relative(1), 'Hace 1 día');
  assert.equal(relative(2), 'Hace 2 días');
  assert.equal(relative(30), 'Hace 1 mes');
  assert.equal(relative(60), 'Hace 2 meses');
  assert.equal(relative(365), 'Hace 1 año');
  for (const value of [null, '', 'no-es-fecha', '2099-01-01']) assert.equal(scope.antiguedadPublicacion(value, now), '');
});

test('tarjetas: fecha al extremo derecho de las caracteristicas en celular y escritorio', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  function funcion(name) {
    const start = html.indexOf('  function ' + name + '(');
    return html.slice(start, html.indexOf('\n  }', start) + 4);
  }
  try {
    const page = await browser.newPage();
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 850 });
      await page.setContent(`<html class="kw-auth-ok"><style>${styles}\n:root{--border:#ddd;--muted:#777}body{margin:0;background:white}#fixture{width:min(100%,380px);margin:auto}</style><body><div id="fixture"></div></body></html>`);
      await page.addScriptTag({ content: `var sitioAsesor=null;window.kwSitioAsesor={personalizar:x=>x};
        ${['escapeHtml','fmtPrecio','etiquetaOperacion','nombreMarketCenter'].map(funcion).join('\n')}
        ${html.slice(html.indexOf('  var ICO ='), html.indexOf('  function val(id)'))}
        document.getElementById('fixture').innerHTML=tarjeta({id:'prueba',titulo:'Departamento en venta',precio:2500000,operacion:'venta',recamaras:3,banos:2,m2_construccion:120,created_at:new Date(Date.now()-86400000).toISOString()},0);` });
      assert.equal(await page.locator('.prop-antiguedad').textContent(), 'Hace 1 día');
      assert.equal(await page.locator('.prop-antiguedad').isVisible(), true);
      assert.ok(await page.locator('.prop-antiguedad').evaluate(el => {
        const row = el.parentElement.getBoundingClientRect();
        const date = el.getBoundingClientRect();
        return Math.abs(row.right - date.right) < 1 && el.parentElement.scrollWidth <= row.width + 1;
      }));
      fs.mkdirSync(new URL('../artifacts/propiedades-antiguedad/', import.meta.url), { recursive: true });
      await page.screenshot({ path: new URL(`../artifacts/propiedades-antiguedad/${width}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1') });
    }
  } finally { await browser.close(); }
});
