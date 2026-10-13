import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';

const html = fs.readFileSync(new URL('../propiedades.html', import.meta.url), 'utf8');
const fotos = html.slice(html.indexOf('  var revisionPrecalentamientoImagenes = 0;'), html.indexOf('  function actualizarConteoServidor'));
const estilos = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const imagen = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

test('scroll rápido alcanza las últimas fotos aunque dos descargas previas se queden pendientes', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? {channel: 'chrome'} : {});
  try {
    for (const viewport of [{width:1280,height:720}, {width:390,height:844}]) {
      const page = await browser.newPage({viewport});
      let liberar;
      const pendientes = new Promise(resolve => { liberar = resolve; });
      const solicitudes = [];
      await page.route('http://fotos.local/**', async route => {
        const id = Number(new URL(route.request().url()).pathname.slice(1));
        solicitudes.push(id);
        if (id < 2) await pendientes;
        await route.fulfill({contentType:'image/png',body:imagen});
      });
      try {
        const tarjetas = Array.from({length:20}, (_, i) => `<article class="prop-card"><div class="prop-foto cargando"><img class="prop-imagen" width="800" height="600" loading="lazy" decoding="async" data-src="http://fotos.local/${i}" onload="mostrarFotoPropiedad(this)"></div><h2>Propiedad ${i}</h2></article>`).join('');
        await page.setContent(`<style>${estilos}\nbody{margin:0}#lista{display:grid;grid-template-columns:1fr;max-width:420px;margin:auto;gap:20px}</style><div id="lista">${tarjetas}</div><script>var ICO={casa:''};${fotos}programarPrecalentamientoImagenes();</script>`);
        await page.waitForFunction(() => !!document.querySelector('.prop-imagen').getAttribute('src'));
        assert.ok(!solicitudes.includes(19), 'no descarga de entrada todas las fotos');
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForFunction(() => {
          const ultima = document.querySelector('#lista article:last-child img');
          return ultima.complete && ultima.naturalWidth > 0 && !ultima.parentElement.classList.contains('cargando');
        }, null, {timeout:5000});
        assert.ok(solicitudes.includes(19), 'la foto visible no espera a las descargas anteriores');
        assert.equal(await page.locator('.prop-card').count(), 20);
        assert.ok(await page.evaluate(() => window.scrollY > 1000), 'el desplazamiento llega al final');
        // Una página nueva invalida callbacks y desconecta el observador anterior.
        await page.evaluate(() => {
          document.querySelector('#lista').innerHTML = '<img class="prop-imagen" data-src="http://fotos.local/30">';
          programarPrecalentamientoImagenes();
          window.scrollTo(0, 0);
        });
        await page.waitForFunction(() => document.querySelector('.prop-imagen').naturalWidth > 0);
      } finally {
        liberar();
        await page.close();
      }
    }
  } finally { await browser.close(); }
});
