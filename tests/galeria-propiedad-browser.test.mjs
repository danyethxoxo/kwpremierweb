import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
const leer = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const html = leer('propiedad.html');
const estilos = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const codigo = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].find(m => m[2].includes('function render()'))[2];
const definiciones = codigo.slice(0, codigo.lastIndexOf("  if (document.documentElement.classList.contains('kw-auth-ok')) cargar();"));

test('galeria: autoavance, pausa fuera de pantalla y visor sin mover el scroll; movil y escritorio', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      const errores = []; page.on('pageerror', e => errores.push(e.message));
      await page.route('https://fotos.test/**', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#b8c8cf"/></svg>' }));
      await page.setContent('<style>' + estilos + leer('assets/css/kw-galeria-propiedad.css') + '</style><main id="contenido"></main><div id="visor" style="display:none"><img id="visor-img"><div id="visor-contador"></div><button id="visor-prev"></button><button id="visor-next"></button><div id="visor-tira"></div></div>');
      await page.evaluate(() => document.documentElement.classList.add('kw-auth-ok'));
      await page.addScriptTag({ content: leer('assets/js/kw-galeria-propiedad.js') });
      await page.addScriptTag({ content: definiciones });
      await page.evaluate(() => {
        propiedad = { id: 'prueba', tipo: 'Casa en condominio', m2_construccion: 160, m2_terreno: 220, titulo: 'Casa de prueba', imagenes: ['https://fotos.test/1','https://fotos.test/2','https://fotos.test/3'], precio: 5000000, lat: 19.4, lng: -99.1, descripcion: 'Descripcion '.repeat(400) };
        window.mapasMontados = 0; montarOSM = () => mapasMontados++;
        render(); galeriaActiva.destruir(); document.querySelector('.galeria-controles').remove(); document.querySelector('.galeria-tiempo').remove();
        galeriaActiva = kwGaleriaPropiedad(document.querySelector('.foto-principal'), fotos, abrirVisor, { duracion: 250 });
      });
      await page.waitForFunction(() => document.querySelector('.galeria-contador').textContent === '2 / 3');
      assert.equal(await page.evaluate(() => mapasMontados), 0, 'mapa no se monta antes de acercarse a el');
      assert.equal(await page.locator('.bloque').first().evaluate(e => getComputedStyle(e).backdropFilter), 'none');
      assert.equal(await page.evaluate(() => { const g = document.querySelector('.galeria').getBoundingClientRect(); return [...document.querySelector('.galeria').children].every(e => e.getBoundingClientRect().bottom <= g.bottom + 1); }), true, 'las fotos no invaden el contenido inferior');
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(150);
      const foto = await page.locator('#foto-grande').getAttribute('src');
      await page.waitForTimeout(550);
      assert.equal(await page.locator('#foto-grande').getAttribute('src'), foto, 'no cambia fuera de pantalla');
      await page.evaluate(() => { scrollTo(0, 0); abrirVisor(1); });
      await page.waitForTimeout(100);
      const scroll = await page.evaluate(() => scrollY);
      const miniatura = await page.locator('#visor-tira img').first().elementHandle();
      await page.evaluate(() => navVisor(1));
      assert.equal(await miniatura.evaluate(e => e === document.querySelector('#visor-tira img')), true, 'reutiliza miniaturas');
      assert.equal(await page.evaluate(() => scrollY), scroll, 'navegar fotos no desplaza la pagina');
      const duranteVisor = await page.locator('#foto-grande').getAttribute('src');
      await page.waitForTimeout(550);
      assert.equal(await page.locator('#foto-grande').getAttribute('src'), duranteVisor, 'pausa con visor abierto');
      await page.evaluate(() => cerrarVisor());
      await page.getByRole('button', { name: 'Pausar fotos' }).click();
      await page.mouse.click(width - 5, 790);
      const pausada = await page.locator('#foto-grande').getAttribute('src');
      await page.waitForTimeout(550);
      assert.equal(await page.locator('#foto-grande').getAttribute('src'), pausada);
      await page.getByRole('button', { name: 'Foto siguiente' }).click();
      await page.waitForFunction(src => document.querySelector('#foto-grande').getAttribute('src') !== src, pausada);
      fs.mkdirSync('outputs/galeria-propiedad', { recursive: true });
      await page.screenshot({ path: 'outputs/galeria-propiedad/' + width + '.png' });
      assert.deepEqual(errores, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.match(await page.locator('.datos').innerText(), /160\s+m² construidos/i);
      assert.match(await page.locator('.datos').innerText(), /220\s+m² terreno/i);
      await page.evaluate(() => { propiedad.tipo = 'Departamento'; propiedad.m2_construccion = null; render(); });
      assert.equal(await page.locator('.datos').count(), 0, 'omite construccion ausente y terreno de departamentos');
      await page.close();
    }
  } finally { await browser.close(); }
});

test('galeria omite fotos rotas, respeta movimiento reducido y no anima una sola foto', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.route('https://fotos.test/**', r => r.request().url().endsWith('/rota') ? r.fulfill({ status: 404, body: '' }) : r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"/>' }));
    await page.setContent('<div id="una"><img></div><div class="foto-principal"><img src="https://fotos.test/1"></div>');
    await page.addScriptTag({ content: leer('assets/js/kw-galeria-propiedad.js') });
    await page.evaluate(() => {
      window.g = kwGaleriaPropiedad(document.querySelector('.foto-principal'), ['https://fotos.test/1','https://fotos.test/rota','https://fotos.test/3'], () => {}, { duracion: 150 });
      window.una = kwGaleriaPropiedad(document.querySelector('#una'), ['https://fotos.test/1'], () => {});
    });
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.foto-principal img').getAttribute('src'), 'https://fotos.test/1');
    assert.equal(await page.evaluate(() => una), null);
    await page.getByRole('button', { name: 'Foto siguiente' }).click();
    await page.waitForFunction(() => document.querySelector('.foto-principal img').getAttribute('src').endsWith('/3'));
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.foto-principal img').getAttribute('src'), 'https://fotos.test/3');
    await page.evaluate(() => g.destruir());
    assert.equal(await page.locator('.galeria-tiempo span').evaluate(e => e.getAnimations().length), 0);
  } finally { await browser.close(); }
});
