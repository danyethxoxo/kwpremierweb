import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
test('reseñas: permisos, carga, filtros, texto seguro y publicación confirmada', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(6000);
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  try {
    await page.addInitScript(() => {
      window.kwSession = { usuario: async () => ({ data: { user: { id: 'master' } } }) };
      window.fixture = { role: 'master', failRead: false, failWrite: false, writes: 0, reads: 0,
        rows: [{ id: 'pending', nombre: 'Cliente de prueba', texto: '<img src=x onerror=alert(1)>\nTexto completo', estrellas: 1, rol: 'Cliente', aprobada: false, created_at: '2026-10-09T01:21:00Z' },
          { id: 'published', nombre: 'Otro cliente', texto: 'Servicio recomendado', estrellas: 5, aprobada: true, created_at: '2026-10-08T01:21:00Z' }] };
      window.kwSupabase = {
        auth: { getUser: async () => ({ data: { user: { id: 'master' } } }) },
        channel: () => ({ on() { return this; }, subscribe() {} }),
        from(table) {
          let update, id, prior;
          const q = {
            select() { return this; }, order() { return this; }, limit() { return this; },
            eq(key, value) { if (key === 'id') id = value; if (key === 'aprobada') prior = value; return this; },
            update(value) { update = value; return this; }, in() { return this; },
            async range(start, end) {
              window.fixture.reads++;
              return window.fixture.failRead ? { error: { message: 'Read failed' } } : { data: window.fixture.rows.slice(start, end + 1) };
            },
            async single() {
              if (table === 'profiles') return { data: { role: window.fixture.role, nombre: 'Prueba' } };
              window.fixture.writes++;
              const row = window.fixture.rows.find(r => r.id === id && r.aprobada === prior);
              if (window.fixture.failWrite || !row) return { error: { message: 'Denied' } };
              Object.assign(row, update); return { data: { id: row.id, aprobada: row.aprobada } };
            },
            then(resolve) { return Promise.resolve({ data: [] }).then(resolve); },
          };
          return q;
        },
      };
    });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'kw.local') return route.abort();
      if (['auth-guard.js', 'kw-session.js'].includes(path.basename(url.pathname))) return route.fulfill({ contentType: 'application/javascript', body: '' });
      const file = path.join(root, url.pathname);
      if (!file.startsWith(root) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      if (file.endsWith('.html')) {
        const html = fs.readFileSync(file, 'utf8').replace('<html lang="es">', '<html lang="es" class="kw-auth-ok">');
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
      }
      return route.fulfill({ contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await page.goto('http://kw.local/hub/resenas.html');
    await page.getByRole('button', { name: 'Aprobar y publicar' }).waitFor();
    assert.equal(await page.locator('#resenas-lista tr').count(), 1);
    assert.equal(await page.locator('#resenas-lista img').count(), 0);
    assert.match(await page.locator('.resena-texto').textContent(), /<img src=x/);
    assert.equal(await page.locator('#notif-bell-slot').count(), 1);
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    await page.mouse.move(1000, 600);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(root, 'artifacts/resenas-desktop.png'), animations: 'disabled' });
    await page.locator('#notif-bell-btn').click();
    await page.locator('#notif-cerrar').click();
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Aprobar y publicar' }).click();
    assert.equal(await page.evaluate(() => window.fixture.writes), 0);
    await page.evaluate(() => window.fixture.failWrite = true);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Aprobar y publicar' }).click();
    await page.getByText('No se pudo confirmar el cambio.', { exact: false }).waitFor();
    assert.equal(await page.locator('#resenas-lista tr').count(), 1);
    await page.evaluate(() => window.fixture.failWrite = false);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Aprobar y publicar' }).click();
    await page.getByText('Reseña publicada.', { exact: true }).waitFor();
    await page.locator('#filtro-estado').selectOption('publicada');
    assert.equal(await page.locator('#resenas-lista tr').count(), 2);
    await page.locator('#buscador-input').fill('Cliente de prueba');
    assert.equal(await page.locator('#resenas-lista tr').count(), 1);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Retirar publicación' }).click();
    await page.getByText('Publicación retirada.', { exact: false }).waitFor();
    await page.locator('#filtro-estado').selectOption('pendiente');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(root, 'artifacts/resenas-mobile.png'), fullPage: true, animations: 'disabled' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.evaluate(() => window.fixture.failRead = true);
    await page.locator('#btn-nuevo').click();
    await page.getByText('No se pudieron cargar las reseñas.', { exact: false }).waitFor();
    await page.evaluate(() => window.fixture.failRead = false);
    await page.locator('#btn-nuevo').click();
    await page.getByRole('button', { name: 'Aprobar y publicar' }).waitFor();
    await page.evaluate(() => { window.fixture.role = 'asociado'; window.fixture.reads = 0; });
    await page.locator('#btn-nuevo').click();
    await page.getByText('Tu cuenta no tiene permiso', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.reads), 0);
    assert.deepEqual(errores, []);
  } finally { await browser.close(); }
});
