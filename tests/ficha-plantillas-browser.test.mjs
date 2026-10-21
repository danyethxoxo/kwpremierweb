import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const source = fs.readFileSync(new URL('../assets/js/kw-ficha-propiedad.js', import.meta.url), 'utf8');
const jspdf = fs.readFileSync(new URL('../assets/vendor/jspdf/jspdf-4.2.1.umd.min.js', import.meta.url), 'utf8');
const output = path.join(os.tmpdir(), 'kw-ficha-plantillas');

test('Clásica oculta o restaura los datos del asesor en vista y PDF sin perder fotos', async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://fotos.example/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' });
        if (pathname.includes('logo-kw-premier')) return route.fulfill({ contentType: 'image/png', body: fs.readFileSync(new URL('..' + pathname, import.meta.url)) });
        const i = Number(pathname.slice(1)) || 0;
        await route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' },
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${['#c5b9a6', '#aebcaf', '#b0bcc7', '#ccc0b4'][i % 4]}"/><path d="M0 650 300 300 700 650 900 150 1200 550V800H0Z" fill="#ffffff" opacity=".4"/><text x="60" y="100" font-size="45" fill="#302c2c">FOTO ${i + 1}</text></svg>` });
      });
      await page.goto('https://fotos.example/');
      await page.setContent('<html><head></head><body style="margin:0;font-family:Arial"><button>Propiedades</button></body></html>');
      await page.addScriptTag({ content: jspdf });
      await page.addScriptTag({ content: source });
      const titulo = 'Departamento con terraza y jardín en una excelente ubicación, cerca de parques y escuelas. '.repeat(4).slice(0, 300).trim();
      await page.evaluate(async titulo => {
        const Original = window.jspdf.jsPDF;
        window.pdfTextos = [];
        window.jspdf.jsPDF = function (options) {
          const pdf = new Original(options);
          const originalText = pdf.text.bind(pdf);
          pdf.text = function (text, ...args) { window.pdfTextos.push(text); return originalText(text, ...args); };
          return pdf;
        };
        await window.kwFichaPropiedad.abrir({ propiedad: { titulo, precio: 12650000, operacion: 'venta',
          recamaras: 3, banos: 2, estacionamientos: 2, m2_construccion: 185,
          calle: 'Avenida Ejemplo 25', colonia: 'Polanco', municipio: 'Miguel Hidalgo', estado: 'Ciudad de México',
          imagenes: [0, 1, 2, 3].map(i => 'https://fotos.example/' + i) },
          asesor: { nombre: 'María Fernanda', apellido: 'López', whatsapp: '+52 55 1234 5678', email: 'maria@kwpremier.com' } });
      }, titulo);
      const hashes = new Set();
      assert.deepEqual(await page.locator('.kw-ficha-diseno input').evaluateAll(inputs => inputs.map(input => input.value)), ['clasica', 'redes', 'mosaico']);
      for (const [indice, mostrar] of [true, false, true].entries()) {
        const diseno = `clasica-${mostrar ? 'con' : 'sin'}-asesor-${indice}`;
        await page.locator('input[name="kw-ficha-asesor"]').setChecked(mostrar);
        hashes.add(await page.locator('.kw-ficha-canvas').evaluate(c => c.toDataURL()));
        assert.equal(await page.locator('.kw-ficha-foto.elegida').count(), 4);
        await page.evaluate(() => { window.pdfTextos = []; });
        const downloadPromise = page.waitForEvent('download');
        await page.locator('.kw-ficha-boton-pdf').click();
        const download = await downloadPromise;
        const target = path.join(output, `${diseno}-${width}.pdf`);
        await download.saveAs(target);
        assert.ok(fs.readFileSync(target).subarray(0, 5).equals(Buffer.from('%PDF-')));
        const textos = await page.evaluate(() => window.pdfTextos.flat().join(' '));
        for (const dato of ['MARÍA FERNANDA LÓPEZ', '+52 55 1234 5678', 'MARIA@KWPREMIER.COM', 'ASESOR INMOBILIARIO']) {
          assert.equal(textos.toLocaleUpperCase('es-MX').includes(dato), mostrar, dato);
        }
        assert.ok(textos.toLocaleUpperCase('es-MX').replace(/\s+/g, ' ').includes(titulo.toLocaleUpperCase('es-MX')), 'el PDF conserva el título completo');
        const png = await page.locator('.kw-ficha-canvas').evaluate(canvas => canvas.toDataURL().split(',')[1]);
        fs.writeFileSync(path.join(output, `${diseno}-${width}.png`), Buffer.from(png, 'base64'));
        await page.screenshot({ path: path.join(output, `selector-${diseno}-${width}.png`) });
        const box = await page.locator('.kw-ficha-dialog').boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width);
        assert.equal(await page.locator('.kw-ficha-diseno input:disabled').count(), 0);
      }
      assert.equal(hashes.size, 2, 'oculta y vuelve a restaurar la misma vista');
      await page.locator('.kw-ficha-selector summary').click();
      for (const i of [1, 2, 3]) await page.locator('.kw-ficha-foto input').nth(i).uncheck();
      await page.waitForFunction(() => !document.querySelector('.kw-ficha-boton-pdf').disabled);
      await page.locator('input[name="kw-ficha-asesor"]').uncheck();
      assert.equal(await page.locator('.kw-ficha-foto.elegida').count(), 1);
      const png = await page.locator('.kw-ficha-canvas').evaluate(canvas => canvas.toDataURL().split(',')[1]);
      fs.writeFileSync(path.join(output, `clasica-sin-asesor-una-foto-${width}.png`), Buffer.from(png, 'base64'));
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('Redes y Mosaico usan Poppins y exportan PNG y PDF 4:5 sin datos del asesor', async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://fotos.example/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' });
        if (pathname.endsWith('.ttf')) return route.fulfill({ contentType: 'font/ttf', body: fs.readFileSync(new URL('..' + pathname, import.meta.url)) });
        if (pathname.includes('logo-kw-premier')) return route.fulfill({ contentType: 'image/png', body: fs.readFileSync(new URL('..' + pathname, import.meta.url)) });
        return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#dfd9cd"/><path d="M0 600 900 350 1200 450V800H0Z" fill="#a49c88"/><rect x="100" y="80" width="1000" height="500" fill="#f7f5f0"/><rect x="750" y="120" width="300" height="350" fill="#a7bcc1"/><rect x="340" y="420" width="500" height="220" rx="30" fill="#777e7f"/></svg>' });
      });
      await page.goto('https://fotos.example/');
      await page.addScriptTag({ content: jspdf });
      await page.addScriptTag({ content: source });
      await page.evaluate(async () => {
        const originalFillText = CanvasRenderingContext2D.prototype.fillText;
        window.textosRedes = [];
        CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
          window.textosRedes.push({ text: String(text), font: this.font });
          return originalFillText.call(this, text, ...args);
        };
        const Original = window.jspdf.jsPDF;
        window.jspdf.jsPDF = function (options) {
          const pdf = new Original(options);
          window.medidasPDF = [pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight()];
          return pdf;
        };
        await kwFichaPropiedad.abrir({ propiedad: { titulo: 'Departamento en renta', tipo: 'Departamento', operacion: 'renta', precio: 10000000,
          calle: 'Calle Cualquiera 123', estado: 'Cualquier Lugar', recamaras: 3, banos: 2, estacionamientos: 1,
          m2_construccion: 80, imagenes: [0, 1, 2, 3].map(i => 'https://fotos.example/' + i) },
          asesor: { nombre: 'DATOS DEL ASESOR', email: 'privado@example.com' } });
      });
      await page.evaluate(() => { window.textosRedes = []; });
      await page.locator('.kw-ficha-diseno input[value="redes"]').check();
      await page.waitForFunction(() => document.querySelector('.kw-ficha-canvas').width === 1080 && !document.querySelector('.kw-ficha-boton-png').disabled);
      assert.equal(await page.locator('.kw-ficha-asesor').isVisible(), false);
      assert.equal(await page.locator('.kw-ficha-foto.elegida').count(), 1);
      assert.equal(await page.evaluate(() => document.fonts.check('700 60px PoppinsFicha')), true);
      const textos = await page.evaluate(() => window.textosRedes);
      assert.ok(textos.some(item => item.text === 'Departamento en renta' && item.font.includes('PoppinsFicha')));
      assert.equal(textos.some(item => /DATOS DEL ASESOR|privado@example/.test(item.text)), false);
      const pngEvent = page.waitForEvent('download');
      await page.locator('.kw-ficha-boton-png').click();
      const png = await pngEvent;
      const pngPath = path.join(output, `redes-${width}.png`);
      await png.saveAs(pngPath);
      const bytes = fs.readFileSync(pngPath);
      assert.equal(bytes.readUInt32BE(16), 1080);
      assert.equal(bytes.readUInt32BE(20), 1350);
      const pdfEvent = page.waitForEvent('download');
      await page.locator('.kw-ficha-boton-pdf').click();
      const pdf = await pdfEvent;
      await pdf.saveAs(path.join(output, `redes-${width}.pdf`));
      const [w, h] = await page.evaluate(() => window.medidasPDF);
      assert.ok(Math.abs(w / h - 4 / 5) < .0001);
      await page.screenshot({ path: path.join(output, `selector-redes-${width}.png`) });
      await page.locator('.kw-ficha-selector summary').click();
      await page.locator('.kw-ficha-foto input').nth(2).check();
      await page.waitForFunction(() => !document.querySelector('.kw-ficha-boton-png').disabled);
      assert.equal(await page.locator('.kw-ficha-foto.elegida').count(), 1);
      assert.equal(await page.locator('.kw-ficha-foto input').nth(0).isChecked(), false);
      await page.locator('.kw-ficha-diseno input[value="clasica"]').check();
      await page.waitForFunction(() => document.querySelector('.kw-ficha-canvas').width === 1600 && !document.querySelector('.kw-ficha-boton-png').disabled);
      assert.equal(await page.locator('.kw-ficha-foto.elegida').count(), 4);
      assert.equal(await page.locator('.kw-ficha-asesor').isVisible(), true);
      await page.locator('.kw-ficha-diseno input[value="mosaico"]').check();
      await page.waitForFunction(() => document.querySelector('.kw-ficha-canvas').width === 1080 && !document.querySelector('.kw-ficha-boton-png').disabled);
      assert.equal(await page.locator('.kw-ficha-foto.elegida').count(), 4);
      assert.equal(await page.locator('.kw-ficha-asesor').isVisible(), false);
      const fondo = await page.locator('.kw-ficha-canvas').evaluate(c => [...c.getContext('2d').getImageData(10, 1000, 1, 1).data]);
      assert.deepEqual(fondo, [206, 0, 37, 255]);
      const mosaicoPNG = page.waitForEvent('download');
      await page.locator('.kw-ficha-boton-png').click();
      await (await mosaicoPNG).saveAs(path.join(output, `mosaico-${width}.png`));
      const mosaicoPDF = page.waitForEvent('download');
      await page.locator('.kw-ficha-boton-pdf').click();
      await (await mosaicoPDF).saveAs(path.join(output, `mosaico-${width}.pdf`));
      const medidasMosaico = await page.evaluate(() => window.medidasPDF);
      assert.ok(Math.abs(medidasMosaico[0] / medidasMosaico[1] - 4 / 5) < .0001);
      await page.screenshot({ path: path.join(output, `selector-mosaico-${width}.png`) });
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
