import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const source = fs.readFileSync(new URL('../assets/js/kw-ficha-propiedad.js', import.meta.url), 'utf8');

test('elige fotos de toda la galería, cambia portada y actualiza el PDF en escritorio y móvil', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.route('https://fotos.example/**', async route => {
        const index = Number(new URL(route.request().url()).pathname.slice(1));
        await route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' },
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="rgb(${index * 10},70,120)"/></svg>` });
      });
      await page.setContent('<html><head></head><body style="margin:0;font-family:Arial"><button id="origen">Propiedades</button></body></html>');
      await page.addScriptTag({ content: source });
      await page.evaluate(async () => {
        window.pdfs = [];
        window.jspdf = { jsPDF: function () {
          const imagenes = [];
          return new Proxy({}, { get: (_, method) => {
            if (method === 'getTextWidth') return text => text.length * 5;
            if (method === 'splitTextToSize') return text => [text];
            if (method === 'addImage') return image => imagenes.push(image);
            if (method === 'output') return () => { window.pdfs.push(imagenes); return new Blob(['pdf'], { type: 'application/pdf' }); };
            return () => {};
          } });
        } };
        await window.kwFichaPropiedad.abrir({ propiedad: { titulo: 'Casa con jardín en Polanco', precio: 6500000,
          operacion: 'venta', recamaras: 3, banos: 2, calle: 'Av. Ejemplo 25', colonia: 'Polanco',
          imagenes: Array.from({ length: 20 }, (_, index) => 'https://fotos.example/' + index) }, asesor: { nombre: 'Asesor Premier' } });
      });
      const tarjetas = page.locator('.kw-ficha-foto');
      assert.equal(await tarjetas.count(), 20);
      await page.locator('.kw-ficha-selector summary').click();
      assert.equal(await tarjetas.nth(4).locator('input').isDisabled(), true);
      await page.locator('.kw-ficha-boton-pdf').click();
      await page.waitForFunction(() => window.pdfs.length === 1);
      await tarjetas.nth(0).locator('input').uncheck();
      await tarjetas.nth(19).locator('input').check();
      await tarjetas.nth(19).locator('button').click();
      await page.waitForFunction(() => !document.querySelector('.kw-ficha-boton-pdf').disabled);
      const pixel = await page.locator('.kw-ficha-canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(1200, 500, 1, 1).data]);
      assert.deepEqual(pixel, [190, 70, 120, 255]);
      assert.equal(await tarjetas.nth(19).locator('button').textContent(), 'Portada');
      await page.locator('.kw-ficha-boton-pdf').click();
      await page.waitForFunction(() => window.pdfs.length === 2);
      assert.equal(await page.evaluate(() => window.pdfs[0][0] !== window.pdfs[1][0]), true);
      const dialog = await page.locator('.kw-ficha-dialog').boundingBox();
      assert.ok(dialog.x >= 0 && dialog.x + dialog.width <= width);
      await page.screenshot({ path: path.join(os.tmpdir(), 'kw-ficha-fotos-' + width + '.png') });
      for (const index of [19, 1, 2, 3]) await tarjetas.nth(index).locator('input').uncheck();
      assert.equal(await page.locator('.kw-ficha-boton-pdf').isDisabled(), true);
      await tarjetas.nth(15).locator('input').check();
      await page.waitForFunction(() => !document.querySelector('.kw-ficha-boton-pdf').disabled);
      await page.locator('.kw-ficha-cerrar').click();
      await page.close();
    }
  } finally { await browser.close(); }
});
