// Prueba local sin sesión, sin escrituras a Supabase y con datos ficticios.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const deps = process.env.KW_RENTA_QA_DEPS;
if (!deps) throw new Error('Define KW_RENTA_QA_DEPS con playwright, pdfjs-dist, @napi-rs/canvas y jspdf.umd.min.js.');
const requireQA = createRequire(resolve(deps, 'package.json'));
const { chromium } = requireQA('playwright');
const canvas = requireQA('@napi-rs/canvas');
Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, ImageData: canvas.ImageData, Path2D: canvas.Path2D });
const { getDocument } = await import(pathToFileURL(resolve(deps, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')));
const output = resolve(deps, 'resultado-renta');
const clientCount = Number(process.env.KW_RENTA_QA_CLIENTES || 2);
mkdirSync(output, { recursive: true });
const source = readFileSync('documentos/contratos/renta.html', 'utf8');
const main = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('function updatePreview()'));
let markup = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
markup = markup.replace(/<link[^>]*href="([^"?]+)(?:\?[^" ]*)?"[^>]*>/g, (tag, href) => {
  if (!href.startsWith('/assets/')) return '';
  return '<style>' + readFileSync('.' + href, 'utf8') + '</style>';
});
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.setContent(markup);
  await page.evaluate(() => {
    window.kwUI = { alert: (message) => { window.qaError = message; } };
    window.fitPreviewMobile = () => {};
  });
  await page.addScriptTag({ content: main.slice(0, main.indexOf('// Inicializar preview al cargar')) });
  await page.addScriptTag({ path: resolve(deps, 'jspdf.umd.min.js') });
  await page.addScriptTag({ path: resolve('assets/js/kw-pdf-vector.js') });
  await page.evaluate((clientCount) => {
    document.getElementById('f-num-clientes').innerHTML = '<option value="' + clientCount + '">' + clientCount + '</option>';
    renderClientesFields();
    const fields = { 'f-cliente0': 'ANA CLIENTE', 'f-cliente1': 'LUIS CLIENTE', 'f-asesor': 'MAYA GARCIA',
      'f-domicilio': 'c 8 DE MAYO 12 COL LOMAS DE TEPEMECATL 14735', 'f-domicilio-cliente1': 'CALLE SEGUNDA 25 COL DEL VALLE 03100',
      'f-inmueble': 'CALLE PRUEBA 50 COL DEL VALLE', 'f-monto': '27000', 'f-fecha': '2026-10-01' };
    for (let i = 2; i < clientCount; i++) {
      fields['f-cliente' + i] = 'CLIENTE DE PRUEBA NÚMERO ' + (i + 1);
      fields['f-domicilio-cliente' + i] = 'CALLE DEL ARRENDADOR ' + (i + 1) + ' NÚMERO 25 COLONIA DEL VALLE ALCALDÍA BENITO JUÁREZ CIUDAD DE MÉXICO 03100';
    }
    for (const [id, value] of Object.entries(fields)) {
      const field = document.getElementById(id);
      if (!field) continue;
      if (field.tagName === 'SELECT') field.innerHTML = '<option>' + value + '</option>';
      field.value = value;
    }
    updatePreview();
    window.kwPDFVector.descargar = async (doc, name, options) => {
      window.qaOverflow = [...doc.querySelectorAll('.print-page')].some((sheet) => {
        const footer = sheet.querySelector('.print-page-footer').getBoundingClientRect();
        return [...sheet.children].filter((el) => !el.classList.contains('print-page-footer'))
          .some((el) => el.getBoundingClientRect().bottom > footer.top);
      });
      const pdf = await window.kwPDFVector.crear(doc, options);
      window.qaPdf = pdf.output('datauristring').split(',')[1];
    };
    downloadPDF();
  }, clientCount);
  await page.waitForFunction(() => window.qaPdf || window.qaError, { timeout: 30000 });
  const result = await page.evaluate(() => ({ pdf: window.qaPdf, error: window.qaError, overflow: window.qaOverflow }));
  assert.ok(result.pdf, result.error);
  assert.equal(result.overflow, false, 'El contenido invade el pie de página');
  const bytes = Buffer.from(result.pdf, 'base64');
  writeFileSync(resolve(output, 'renta-dos-clientes.pdf'), bytes);
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false,
    standardFontDataUrl: resolve(deps, 'node_modules/pdfjs-dist/standard_fonts').replace(/\\/g, '/') + '/' }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const pdfPage = await pdf.getPage(i);
    const content = await pdfPage.getTextContent();
    text += content.items.map((item) => item.str).join('') + '\n';
    const viewport = pdfPage.getViewport({ scale: 1.6 });
    const image = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await pdfPage.render({ canvasContext: image.getContext('2d'), viewport }).promise;
    writeFileSync(resolve(output, 'pagina-' + i + '.png'), image.toBuffer('image/png'));
  }
  writeFileSync(resolve(output, 'texto.txt'), text);
  assert.ok(text.includes('MAYA GARCIA'), 'El PDF une las palabras del nombre');
  assert.ok(text.includes('ACUERDO DE PRESTACIÓN DE SERVICIOS'));
  assert.ok(text.includes('FILTRO DE ARRENDATARIOS: Investigación'), 'Falta espacio después de dos puntos');
  assert.ok(text.includes('VEINTISIETE MIL PESOS 00/100 M.N.'));
  assert.ok(!text.includes('M.N. pesos'));
  assert.ok(text.includes('ANA CLIENTE'));
  if (clientCount > 1) {
    assert.ok(text.includes('LUIS CLIENTE'));
    assert.ok(text.includes('C.P. 14735') && text.includes('C.P. 03100'));
  }
  for (let i = 1; i <= 7; i++) assert.ok(text.includes(i + '. '), 'No aparece la obligación ' + i);
  console.log(JSON.stringify({ clientes: clientCount, paginas: pdf.numPages, resultado: output, verificaciones: 'correctas' }));
} finally { await browser.close(); }
