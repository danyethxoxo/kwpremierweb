import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const leer = p => fs.readFileSync(new URL(p, root), 'utf8');
const output = path.resolve('outputs/fichas-tecnicas');

test('Detalle conserva texto completo, todas las fotos, mapa y dos páginas en escritorio y móvil', async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://ficha.example/**', async route => {
        const p = new URL(route.request().url()).pathname;
        if (p === '/') return route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' });
        if (p.startsWith('/assets/')) return route.fulfill({ body: fs.readFileSync(new URL(p.slice(1), root)), contentType: p.endsWith('.ttf') ? 'font/ttf' : 'image/png' });
        return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#e8e2d7"/><path d="M70 300 600 70 1130 300V740H70Z" fill="#fafafa"/><rect x="200" y="350" width="250" height="300" fill="#a2b6bf"/><rect x="650" y="350" width="300" height="300" fill="#a2b6bf"/><text x="80" y="95" font-size="50">Fotografía ${p.slice(1)}</text></svg>` });
      });
      await page.route('https://tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eee9df"/><path d="M0 80H256M80 0V256M180 0V256M0 180H256" stroke="white" stroke-width="15"/><text x="10" y="35" font-size="14">Mapa de prueba</text></svg>' }));
      await page.goto('https://ficha.example/');
      await page.addScriptTag({ content: leer('assets/vendor/jspdf/jspdf-4.2.1.umd.min.js') });
      await page.addScriptTag({ content: leer('assets/js/kw-ficha-propiedad.js') });
      await page.evaluate(async () => {
        window.textos = [];
        const fill = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...args) { window.textos.push(String(t)); return fill.call(this, t, ...args); };
        window.propiedadPrueba = { titulo: 'Departamento en venta con terraza, luz natural y excelentes espacios en Del Valle Norte', tipo: 'Departamento', operacion: 'venta', precio: 7450000, moneda: 'MXN', calle: 'San Francisco 87', colonia: 'Del Valle Norte', municipio: 'Benito Juárez', estado: 'Ciudad de México', cp: '03103', lat: 19.391, lng: -99.162,
          recamaras: 3, banos: 2, estacionamientos: 2, m2_construccion: 165, m2_terreno: 200,
          descripcion: 'Departamento con espacios amplios, iluminación natural y una distribución funcional. Cuenta con sala, comedor y cocina equipada. '.repeat(11) + 'FINAL ÍNTEGRO DE LA DESCRIPCIÓN.',
          caracteristicas: ['Terraza', 'Elevador', 'Vigilancia', 'Cocina equipada', 'Balcón', 'Bodega', 'Área de lavado', 'Acceso controlado', 'Jardín común', 'Salón de usos múltiples'], imagenes: Array.from({ length: 14 }, (_, i) => 'https://ficha.example/' + (i + 1)) };
        await kwFichaPropiedad.abrir({ plantilla: 'expediente', propiedad: window.propiedadPrueba, asesor: { nombre: 'Daniel Guerrero', email: 'asesor@example.com', whatsapp: '55 1234 5678' }, url: 'https://asesor.kw.com/propiedad' });
      });
      assert.equal(await page.locator('.kw-ficha-canvas').count(), 2);
      const marco = await page.locator('.kw-ficha-dialog').boundingBox();
      assert.ok(marco.x >= 0 && marco.x + marco.width <= width);
      const scroll = await page.locator('.kw-ficha-vista').evaluate(el => ({ alto: el.clientHeight, contenido: el.scrollHeight }));
      assert.ok(scroll.contenido > scroll.alto || width < 700, JSON.stringify({ width, scroll }));
      assert.equal(await page.locator('.kw-ficha-foto.elegida').count(), 14);
      const textos = await page.evaluate(() => window.textos.join(' '));
      for (const texto of ['FINAL ÍNTEGRO DE LA DESCRIPCIÓN.', 'Jardín común', 'San Francisco 87', 'Benito Juárez', 'OpenStreetMap']) assert.ok(textos.includes(texto), texto);
      for (let i = 0; i < 2; i++) {
        const png = await page.locator('.kw-ficha-canvas').nth(i).evaluate(c => c.toDataURL().split(',')[1]);
        fs.writeFileSync(path.join(output, `detalle-vista-${i + 1}-${width}.png`), Buffer.from(png, 'base64'));
      }
      await page.locator('.kw-ficha-vista').evaluate(el => { el.scrollTop = el.scrollHeight; });
      if (width >= 700) assert.ok(await page.locator('.kw-ficha-vista').evaluate(el => el.scrollTop > 0));
      await page.screenshot({ path: path.join(output, `detalle-selector-${width}.png`) });
      const evento = page.waitForEvent('download');
      await page.locator('.kw-ficha-boton-pdf').click();
      const archivo = path.join(output, `detalle-${width}.pdf`);
      await (await evento).saveAs(archivo);
      await page.addScriptTag({ content: leer('assets/vendor/firmas/pdf-3.11.174.min.js') });
      await page.route('https://ficha.example/pdf.worker.js', r => r.fulfill({ contentType: 'application/javascript', body: leer('assets/vendor/firmas/pdf.worker-3.11.174.min.js') }));
      const renders = await page.evaluate(async bytes => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://ficha.example/pdf.worker.js';
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
        const result = [];
        for (let n = 1; n <= doc.numPages; n++) { const p = await doc.getPage(n), v = p.getViewport({ scale: 1.3 }), c = document.createElement('canvas'); c.width = v.width; c.height = v.height; await p.render({ canvasContext: c.getContext('2d'), viewport: v }).promise; result.push(c.toDataURL().split(',')[1]); }
        return result;
      }, [...fs.readFileSync(archivo)]);
      assert.equal(renders.length, 2);
      for (const [i, png] of renders.entries()) fs.writeFileSync(path.join(output, `detalle-pdf-${i + 1}-${width}.png`), Buffer.from(png, 'base64'));
      await page.locator('input[value="redes"]').check();
      await page.waitForFunction(() => document.querySelectorAll('.kw-ficha-canvas').length === 1 && !document.querySelector('.kw-ficha-boton-pdf').disabled);
      const direccion = await page.evaluate(() => kwFichaPropiedad.crearModelo({ propiedad: window.propiedadPrueba }).ubicacionRedes);
      assert.deepEqual(direccion, ['Del Valle Norte', 'Benito Juárez, CDMX']);
      const redes = await page.locator('.kw-ficha-canvas').evaluate(c => c.toDataURL().split(',')[1]);
      fs.writeFileSync(path.join(output, `redes-${width}.png`), Buffer.from(redes, 'base64'));
      await page.locator('input[value="clasica"]').check();
      await page.waitForFunction(() => document.querySelector('.kw-ficha-canvas').width === 1600 && !document.querySelector('.kw-ficha-boton-pdf').disabled);
      assert.equal(await page.locator('.kw-ficha-foto.elegida').count(), 4);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
