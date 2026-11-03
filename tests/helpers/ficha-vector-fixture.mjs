import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const tile = Buffer.from('Glh4AgoOdHJhbnNwb3J0YXRpb24ogCAaBWNsYXNzGgRuYW1lIg0KC3Jlc2lkZW50aWFsIhEKD0NhbGxlIGRlIHBydWViYRISEgQAAAEBGAIiCAkAvAkKgEAAGl14AgoTdHJhbnNwb3J0YXRpb25fbmFtZSiAIBoFY2xhc3MaBG5hbWUiDQoLcmVzaWRlbnRpYWwiEQoPQ2FsbGUgZGUgcHJ1ZWJhEhISBAAAAQEYAiIICQC8CQqAQAAaRXgCCgNwb2kogCAaBWNsYXNzGgRuYW1lIggKBm11c2V1bSIRCg9NdXNlbyBkZSBwcnVlYmESDxIEAAABARgBIgUJ3gHUBg==', 'base64');
export async function instalarVectorFicha(page) {
  await page.route('**/assets/vendor/fichas/vector.js*', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(new URL('assets/vendor/fichas/vector.js', root)) }));
  await page.route('**/assets/fonts/poppins/*.ttf', r => r.fulfill({ contentType: 'font/ttf', body: fs.readFileSync(new URL(new URL(r.request().url()).pathname.slice(1), root)) }));
  await page.route('https://tiles.openfreemap.org/**', r => r.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: r.request().url().endsWith('/planet') ? 'application/json' : 'application/x-protobuf', body: r.request().url().endsWith('/planet') ? JSON.stringify({ tiles: ['https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf'] }) : tile }));
}

export async function inspeccionarPDFVector(page, archivo) {
  if (!await page.evaluate(() => !!window.pdfjsLib)) await page.addScriptTag({ content: fs.readFileSync(new URL('assets/vendor/firmas/pdf-3.11.174.min.js', root), 'utf8') });
  const worker = new URL('/qa-vector-worker.js', page.url()).href;
  await page.route(worker, r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(new URL('assets/vendor/firmas/pdf.worker-3.11.174.min.js', root)) }));
  const result = await page.evaluate(async ({ bytes, worker }) => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise, pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n), ops = await p.getOperatorList(), text = await p.getTextContent();
      const c = document.createElement('canvas'), v = p.getViewport({ scale: 1.25 }); c.width = v.width; c.height = v.height;
      await p.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
      pages.push({ texto: text.items.map(i => i.str).join(' '), imagenes: ops.fnArray.filter(op => [pdfjsLib.OPS.paintImageXObject, pdfjsLib.OPS.paintInlineImageXObject].includes(op)).length, png: c.toDataURL().split(',')[1] });
    }
    await doc.destroy(); return pages;
  }, { bytes: [...fs.readFileSync(archivo)], worker });
  for (const [i, p] of result.entries()) { fs.writeFileSync(archivo.replace(/\.pdf$/, '-vector-' + (i + 1) + '.png'), Buffer.from(p.png, 'base64')); delete p.png; }
  return result;
}
