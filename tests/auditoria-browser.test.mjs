import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
async function local(page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/@supabase/')) return route.fulfill({ contentType: 'application/javascript', body: `window.supabase={createClient(){return {auth:{getSession:async()=>({data:{session:null}})},from(){return {select(){return this;},order(){return this;},limit:async()=>({data:[]}),insert:async()=>({error:{message:'No se pudo enviar. Inténtalo de nuevo.'}})}}}}};` });
    if (url.hostname !== 'kw.local') return route.abort();
    const file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    let body = fs.readFileSync(file);
    if (file.endsWith('.html')) body = body.toString('utf8').replace(/\s+(?:integrity|crossorigin)="[^"]*"/g, '');
    return route.fulfill({ body, contentType: file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'application/octet-stream' });
  });
}
test('selects compartidos respetan bloqueo, actualización de opciones, etiqueta y teclado', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage();
    await page.setContent('<div class="acuerdo-field"><label>Tipo de inmueble</label><select id="tipo"><option>Casa</option><option>Oficina</option></select></div><label for="fecha">Fecha</label><input id="fecha" type="date" disabled>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'assets/js/kw-ui.js'), 'utf8') });
    const button = page.locator('.kw-select-btn');
    assert.equal(await button.getAttribute('aria-label'), 'Tipo de inmueble: Casa');
    assert.equal(await page.locator('label').first().getAttribute('for'), 'tipo');
    await button.click();
    await page.evaluate(() => { document.getElementById('tipo').disabled = true; });
    await page.waitForFunction(() => document.querySelector('.kw-select-btn').disabled);
    assert.equal(await page.locator('.kw-select.abierto').count(), 0);
    await button.evaluate(el => el.click());
    assert.equal(await page.locator('.kw-select.abierto').count(), 0);
    await page.evaluate(() => { const el = document.getElementById('tipo'); el.disabled = false; el.innerHTML += '<option>Terreno</option>'; });
    await page.waitForFunction(() => !document.querySelector('.kw-select-btn').disabled);
    await button.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#tipo').inputValue(), 'Oficina');
    await page.locator('#fecha').evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    assert.equal(await page.locator('.kw-calendario').count(), 0);
  } finally { await browser.close(); }
});
test('GPS público conserva guardar, imprimir y reiniciar en móvil; tabla y campos no desbordan', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
    await local(page); await page.goto('https://kw.local/gps-publico.html');
    for (const name of ['Guardar', 'Imprimir / PDF', 'Empezar de nuevo']) assert.equal(await page.getByRole('button', { name, exact: true }).isVisible(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.locator('.datos input').evaluateAll(els => els.every(el => el.getBoundingClientRect().right <= innerWidth)));
    await page.locator('#f-nombre').fill('Nombre QA'); await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.reload(); assert.equal(await page.locator('#f-nombre').inputValue(), 'Nombre QA');
    await page.evaluate(() => { window.open = () => null; });
    await page.getByRole('button', { name: 'Imprimir / PDF', exact: true }).click();
    assert.match(await page.locator('#msg').innerText(), /ventanas emergentes/);
  } finally { await browser.close(); }
});
test('portada mantiene aviso de privacidad y muestra errores de reclutamiento', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); await local(page);
    await page.goto('https://kw.local/index.html');
    assert.equal(await page.locator('#pie-dir .pie-legal').isVisible(), true);
    await page.getByRole('button', { name: 'Quiero ser parte', exact: true }).first().click();
    await page.locator('#rec-nombre').fill('Persona QA'); await page.locator('#rec-correo').fill('qa@example.com'); await page.locator('#rec-telefono').fill('5512345678');
    await page.locator('#rec-btn').click(); await page.locator('#rec-msg').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#rec-msg').getAttribute('role'), 'alert');
    assert.equal(await page.locator('#rec-nombre').inputValue(), 'Persona QA');
  } finally { await browser.close(); }
});
test('bundle PDF público coincide con dependencia auditada y favicon compacto', () => {
  const hash = file => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  assert.equal(hash('assets/vendor/jspdf/jspdf-4.2.1.umd.min.js'), hash('node_modules/jspdf/dist/jspdf.umd.min.js'));
  assert.ok(fs.statSync(path.join(root, 'assets/img/favicon-64.png')).size < 10000);
  for (const file of ['hub/firmas.html', 'assets/js/kw-ficha-propiedad.js']) {
    const code = fs.readFileSync(path.join(root, file), 'utf8');
    for (const call of code.matchAll(/\.getDocument\(\{([^}]+)\}\)/g)) assert.match(call[1], /isEvalSupported:\s*false/, file);
  }
});
