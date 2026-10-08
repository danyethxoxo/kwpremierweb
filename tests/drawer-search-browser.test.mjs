import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
function pages(dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '.git'].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return pages(file);
    return file.endsWith('.html') && /src=["'][^"']*drawer\.js/.test(fs.readFileSync(file, 'utf8')) ? [file] : [];
  });
}

test('buscador compartido: todas las páginas, resultados, cierre y cambio a móvil', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'kw.local') return route.abort();
      const file = path.join(root, decodeURIComponent(url.pathname));
      if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      if (file.endsWith('.html')) {
        let html = fs.readFileSync(file, 'utf8');
        const mode = html.includes('data-menu="publico"') ? 'publico' : 'hub';
        const lateral = html.match(/<script\b[^>]*src=["'][^"']*kw-lateral\.js[^>]*><\/script>/i)?.[0] || '';
        const ui = html.match(/<script\b[^>]*src=["'][^"']*kw-ui\.js[^>]*><\/script>/i)?.[0] || '';
        html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<html\b[^>]*>/i, '<html class="kw-auth-ok">')
          .replace('</body>', `${ui}<script src="/assets/js/drawer.js" data-menu="${mode}"></script>${lateral}<script>const panel=document.getElementById('contenido-panel');if(panel)panel.style.display='';document.getElementById('pantalla-carga')?.remove();</script></body>`);
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
      }
      return route.fulfill({ contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream', body: fs.readFileSync(file) });
    });
    const files = pages();
    assert.ok(files.length >= 30);
    for (const file of files) {
      const route = '/' + path.relative(root, file).replaceAll('\\', '/');
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('http://kw.local' + route);
      const hub = await page.locator('#drawer-buscar-toggle').count();
      if (await page.locator('[data-kw-menu-principal]:visible').count()) {
        await page.locator('[data-kw-menu-principal]:visible').first().click();
      }
      const toggle = page.locator(hub ? '#drawer-buscar-toggle' : '#kw-buscar-toggle');
      await toggle.click().catch(error => { throw new Error(route + ': ' + error.message); });
      const search = page.locator('#search-bar');
      await search.fill('propiedades');
      const result = page.locator('#kw-buscar-resultados a[href="/propiedades.html"]');
      assert.ok(await result.isVisible(), route);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await search.inputValue(), 'propiedades', route);
      await search.waitFor({ state: 'visible' });
      assert.ok(await search.isVisible(), route);
      await page.setViewportSize({ width: 1280, height: 900 });
      await search.waitFor({ state: 'visible' });
      assert.ok(await search.isVisible(), route);
      await search.press('Escape');
      assert.equal(await search.inputValue(), '', route);
      assert.ok(!(await search.isVisible()), route);
      assert.equal(await page.locator('.kw-buscador-local-oculto').count(), 0, route);
      if (hub && await page.locator('#drawer').evaluate(el => getComputedStyle(el).pointerEvents === 'none')) {
        await page.locator('[data-kw-menu-principal]:visible').first().click();
      }
      await toggle.click();
      await search.fill('propiedades');
      await page.locator('.kw-buscar-cerrar-inline').click();
      assert.ok(!(await search.isVisible()), route);
      if (hub && !route.endsWith('/portal.html') && !(await page.locator('body.firmas-riel-contraido').count())) {
        assert.ok(await page.locator('#drawer.open').count(), route);
        assert.ok(await page.locator('#drawer-buscar-toggle span').isVisible(), route);
      }
    }
    await page.goto('http://kw.local/hub/dictamenes.html');
    if (await page.locator('[data-kw-menu-principal]:visible').count()) {
      await page.locator('[data-kw-menu-principal]:visible').first().click();
    }
    await page.locator('#drawer-buscar-toggle').click();
    await page.locator('#search-bar').fill('propiedades');
    await page.locator('#search-bar').press('Enter');
    await page.waitForURL('**/propiedades.html');
  } finally { await browser.close(); }
});
