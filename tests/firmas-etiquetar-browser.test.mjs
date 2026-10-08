import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const html = fs.readFileSync(new URL('../hub/firmas.html', import.meta.url), 'utf8');
function funcion(nombre) {
  const start = html.indexOf('  function ' + nombre + '(');
  return html.slice(start, html.indexOf('\n  }', start) + 4);
}

test('menú de tres puntos permanece dentro de los bordes y permite recorrer las opciones', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage();
    for (const [width, height] of [[1280, 800], [390, 800], [320, 300]]) {
      await page.setViewportSize({ width, height });
      for (const bottom of [true, false]) {
        await page.setContent(`<style>.env-menu{position:fixed;padding:6px;border:1px solid #ddd;overflow-y:auto;box-sizing:border-box}.env-menu button{display:block;height:40px;width:100%}</style><button id="anchor" style="position:fixed;right:8px;${bottom ? 'bottom' : 'top'}:8px;height:30px">Opciones</button>`);
        await page.addScriptTag({ content: `var flotante=null,botonAbierto=null,tagAbierta=null,clicked=false;
          ${['cerrarFlotante', 'colocar', 'abrirFlotante'].map(funcion).join('\n')}
          document.getElementById('anchor').onclick=()=>{const menu=abrirFlotante(document.getElementById('anchor'),220,Array.from({length:20},(_,i)=>'<button data-row="'+i+'">Acción '+i+'</button>').join(''));menu.querySelector('[data-row="19"]').onclick=()=>clicked=true;};` });
        await page.locator('#anchor').click();
        const menu = await page.locator('.env-menu').boundingBox();
        assert.ok(menu.x >= 8 && menu.x + menu.width <= width - 8);
        assert.ok(menu.y >= 8 && menu.y + menu.height <= height - 8);
        await page.locator('[data-row="19"]').click();
        assert.ok(await page.evaluate(() => clicked));
      }
    }
  } finally { await browser.close(); }
});

test('etiquetado múltiple abre dentro de la ventana y conserva las otras etiquetas', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage();
    const styles = ['kw-base.css', 'kw-claro.css'].map(file => fs.readFileSync(new URL('../assets/css/' + file, import.meta.url), 'utf8')).join('\n') +
      [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
    const start = html.indexOf("  $('btn-etiquetar-varios').addEventListener");
    const end = html.indexOf('\n  });', start) + 6;
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.setContent('<html class="kw-auth-ok"><style>' + styles + '</style><body class="en-historial"><div class="barra-sel"><span>2 documentos seleccionados</span><button id="btn-etiquetar-varios" class="btn-sel">Etiquetar</button></div></body></html>');
      await page.addScriptTag({ content: `
        var flotante=null,botonAbierto=null,tagAbierta=null;
        var elegidos=new Set(['doc1','doc2']);
        var envios=[{id:'doc1',titulo:'Uno',etiquetas:['previa']},{id:'doc2',titulo:'Dos',etiquetas:[]}];
        var etiquetas=Array.from({length:25},(_,i)=>({id:'tag'+i,nombre:'Etiqueta '+i,color:'#cc0000'}));
        var llamadas=[],recargas=0;
        var $=id=>document.getElementById(id);
        var escapar=value=>String(value);
        async function cargarEnvios(){recargas++;}
        window.kwUI={alert:async()=>{throw Error('No se esperaba una alerta');}};
        window.kwSupabase={rpc:async(name,params)=>{llamadas.push({name,params});envios.find(doc=>doc.id===params.p_documento).etiquetas=params.p_etiquetas;return {error:null};}};
        ${['cerrarFlotante', 'colocar', 'abrirFlotante'].map(funcion).join('\n')}
        ${html.slice(start, end)}
      ` });
      await page.locator('#btn-etiquetar-varios').click();
      const menu = await page.locator('.env-menu').boundingBox();
      const button = await page.locator('#btn-etiquetar-varios').boundingBox();
      assert.ok(menu.y >= 8 && menu.y + menu.height <= button.y, String(width));
      await page.locator('[data-poner="tag24"]').click();
      await page.waitForFunction(() => recargas === 1);
      let calls = await page.evaluate(() => llamadas);
      assert.equal(calls.length, 2);
      assert.deepEqual(calls[0].params.p_etiquetas, ['previa', 'tag24']);
      assert.deepEqual(calls[1].params.p_etiquetas, ['tag24']);
      await page.locator('#btn-etiquetar-varios').click();
      await page.locator('[data-quitar="tag24"]').click();
      await page.waitForFunction(() => recargas === 2);
      calls = await page.evaluate(() => llamadas);
      assert.deepEqual(calls[2].params.p_etiquetas, ['previa']);
      assert.deepEqual(calls[3].params.p_etiquetas, []);
      assert.equal(await page.evaluate(() => elegidos.size), 2);
    }
  } finally { await browser.close(); }
});
