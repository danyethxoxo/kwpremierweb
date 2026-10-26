import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.KW_PLAYWRIGHT_PATH || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));

function fixture() {
  const now = Date.now();
  const uid = 'usuario-propio';
  const rows = [
    { id:'reciente',tipo:'dictamen',titulo:'Dictamen de expediente: Autorizado condicionado',mensaje:'Hola: María López, te compartimos el dictamen de expediente de tu listado con dirección:\n\nAv. Reforma 123, Ciudad de México',url:'/hub/dictamenes.html',leido:false,created_at:new Date(now-60000).toISOString(),user_id:uid },
    { id:'limite',titulo:'Por cumplir 24 horas',leido:false,created_at:new Date(now-86400000+30000).toISOString(),user_id:uid },
    { id:'leida',titulo:'Ya leída',leido:true,created_at:new Date(now-120000).toISOString(),user_id:uid },
    { id:'insegura',titulo:'<img src=x onerror=alert(1)>',mensaje:'<script>alert(1)</script>',url:'javascript:alert(1)',leido:false,created_at:new Date(now-3*86400000).toISOString(),user_id:uid },
    ...Array.from({length:121},(_,i)=>({id:'vieja-'+i,titulo:'Historial '+i,leido:false,created_at:new Date(now-(i+4)*86400000).toISOString(),user_id:uid})),
    { id:'ajena',titulo:'Notificación de otra persona',leido:false,created_at:new Date(now).toISOString(),user_id:'otra-persona' },
  ];
  const state = window.__notifMock = { rows, updates:0, failUpdate:false, pageCount:0 };
  window.kwSession = { usuario:async()=>({data:{user:{id:uid}}}), perfilInicial:async()=>({data:{nombre:'María',apellido:'López',role:'staff'}}) };
  window.kwSecurity = { notificationUrl(url) { try { const u=new URL(url,location.origin); return u.origin===location.origin && /^https?:$/.test(u.protocol)?u.href:''; } catch { return ''; } } };
  window.kwSupabase = {
    auth:{getUser:async()=>({data:{user:{id:uid}}})},
    from(table) {
      if(table!=='notificaciones') {
        const empty=new Proxy({}, {get(_,key){return key==='then'?(ok,bad)=>Promise.resolve({data:[],error:null}).then(ok,bad):()=>empty;}});
        return empty;
      }
      const q={filters:[],ids:null,updating:false,from:0,to:99};
      const builder={select(){return this;},eq(k,v){q.filters.push([k,v]);return this;},order(){return this;},
        range(a,b){q.from=a;q.to=b;return this;},update(){q.updating=true;return this;},in(k,ids){q.ids=ids;return this;},
        then(ok,bad){return Promise.resolve().then(async()=>{
          const list=state.rows.filter(n=>q.filters.every(([k,v])=>n[k]===v)&&(!q.ids||q.ids.includes(n.id)));
          if(q.updating){state.updates++;if(state.deferUpdate)await new Promise(resolve=>{state.releaseUpdate=resolve;});if(state.failUpdate)return {data:null,error:{message:'Error de prueba'}};list.forEach(n=>n.leido=true);return {data:list.map(({id})=>({id})),error:null};}
          state.pageCount++;return {data:list.slice(q.from,q.to+1).map(n=>({...n})),error:null};
        }).then(ok,bad);}};
      return builder;
    },
    channel(){return {on(){return this;},subscribe(){return this;}};},
  };
}

test('notificaciones UI: filas, dictamen, navegación, lectura explícita, historial, 24h y móvil', async () => {
  const server=createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/') {
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end('<!doctype html><html class="kw-auth-ok kw-riel"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/css/kw-base.css"><link rel="stylesheet" href="/assets/css/kw-claro.css"><link rel="stylesheet" href="/assets/css/kw-lateral.css"></head><body><header class="kw-header"><div id="notif-bell-slot"></div></header><main style="max-width:640px;margin:auto;padding:80px 16px"><h1>Notificaciones</h1><section id="notif-centro" class="notif-pagina-lista"></section></main><script src="/assets/js/notif-bell.js"></script><script src="/assets/js/drawer.js" data-menu="hub"></script></body></html>');return;
    }
    if(path==='/hub/dictamenes.html') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>Dictámenes</h1>');return;}
    try { res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');res.end(readFileSync(join(root,path))); }
    catch {res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try { browser=await chromium.launch({headless:true, ...(process.env.KW_BROWSER_CHANNEL ? {channel:process.env.KW_BROWSER_CHANNEL} : {})}); }
  catch(error) { await new Promise(resolve=>server.close(resolve)); throw error; }
  const output=mkdtempSync(join(tmpdir(),'kw-notificaciones-'));
  try {
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
      const page=await browser.newPage({viewport});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://**/*',route=>route.abort());
      await page.clock.install({time:new Date()});
      await page.addInitScript(fixture);
      await page.goto('http://127.0.0.1:'+server.address().port);
      await page.locator('#notif-centro .notif-item').first().waitFor();
      assert.equal(await page.locator('#notif-centro .notif-item').count(),2);
      assert.equal(await page.evaluate(()=>window.__notifMock.pageCount),2);
      await page.locator('#notif-bell-btn').click();
      await page.locator('#notif-dropdown.abierto').waitFor();
      assert.equal(await page.evaluate(()=>window.__notifMock.updates),0,'abrir no marca las tarjetas');
      assert.equal(await page.locator('#notif-dropdown .notif-item').count(),2);
      assert.equal(await page.locator('.notif-ayuda').count(),0);
      assert.equal(await page.locator('#notif-bell-slot').count(),1);
      assert.equal(await page.getByText('Ver notificación',{exact:true}).count(),0);
      const dictamen=page.locator('#notif-dropdown [data-notif-id="reciente"]');
      assert.equal(await dictamen.locator('.notif-item-titulo').textContent(),'Dictamen de expediente: Autorizado condicionado');
      assert.equal(await dictamen.locator('.notif-item-msg').first().textContent(),'Hola: María López, te compartimos el dictamen de expediente de tu listado con dirección:');
      assert.equal(await dictamen.locator('.notif-item-direccion').textContent(),'Av. Reforma 123, Ciudad de México');
      assert.equal(await dictamen.locator('.notif-item-folio').textContent(),'Ver dictámenes');
      const overlay=await page.locator('#notif-backdrop').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,z:getComputedStyle(el).zIndex}));
      assert.deepEqual(overlay,{bg:'rgba(0, 0, 0, 0.28)',z:'210'});
      await page.clock.runFor(300);
      assert.equal(await page.evaluate(()=>document.elementFromPoint(1,300)?.id),'notif-backdrop','el velo cubre también la barra lateral');
      await page.screenshot({path:join(output,viewport.width+'-recientes.png'),animations:'disabled'});
      assert.equal(await page.locator('#notif-dropdown').evaluate(el=>getComputedStyle(el).transform),'matrix(1, 0, 0, 1, 0, 0)','el panel termina de entrar y no queda cortado');
      const style=await page.locator('#notif-dropdown').evaluate(el=>({shadow:getComputedStyle(el).boxShadow,border:getComputedStyle(el).borderLeftWidth,bg:getComputedStyle(el).backgroundColor}));
      assert.deepEqual(style,{shadow:'none',border:'1px',bg:'rgb(255, 255, 255)'});
      await page.evaluate(()=>{window.__notifMock.failUpdate=true;window.__notifMock.deferUpdate=true;});
      await page.locator('#notif-dropdown [data-notif-leida="reciente"]').click();
      assert.equal(new URL(page.url()).pathname,'/','marcar como leída no activa el enlace');
      assert.equal(await page.locator('#notif-dropdown [data-notif-id="reciente"]').count(),0,'se mueve antes de recibir la respuesta');
      await page.waitForFunction(()=>!!window.__notifMock.releaseUpdate);
      await page.evaluate(()=>window.__notifMock.releaseUpdate());
      await page.locator('#notif-dropdown [role="alert"]').waitFor();
      assert.equal(await page.locator('#notif-dropdown .notif-item').count(),2,'un fallo conserva la tarjeta');
      await page.evaluate(()=>{window.__notifMock.failUpdate=false;window.__notifMock.releaseUpdate=null;});
      await page.locator('#notif-dropdown [data-notif-leida="reciente"]').click();
      await page.waitForFunction(()=>document.querySelectorAll('#notif-dropdown .notif-item').length===1);
      assert.equal(await page.locator('#notif-centro .notif-item').count(),1,'la página comparte el estado');
      assert.equal(await page.evaluate(()=>window.__notifMock.rows.find(n=>n.id==='reciente').leido),false,'el servidor sigue pendiente');
      await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
      assert.equal(await page.locator('#notif-dropdown [data-notif-id="reciente"]').count(),0,'una recarga no deshace la lectura pendiente');
      await page.waitForFunction(()=>!!window.__notifMock.releaseUpdate);
      await page.evaluate(()=>{window.__notifMock.deferUpdate=false;window.__notifMock.releaseUpdate();});
      await page.waitForFunction(()=>window.__notifMock.rows.find(n=>n.id==='reciente').leido);
      await page.locator('#notif-dropdown [data-notif-tab="todas"]').click();
      assert.equal(await page.locator('#notif-dropdown .notif-item').count(),125);
      assert.equal(await page.locator('#notif-dropdown [data-notif-id="reciente"] .notif-leida').textContent(),'Leída');
      assert.equal(await page.locator('#notif-dropdown [data-notif-id="insegura"] img').count(),0);
      assert.equal(await page.locator('#notif-dropdown [data-notif-id="insegura"] a').count(),0);
      assert.equal(await page.locator('#notif-dropdown [data-notif-id="ajena"]').count(),0);
      const cards=await page.locator('#notif-dropdown .notif-item').evaluateAll(els=>els.slice(0,2).map(el=>({y:el.getBoundingClientRect().y,height:el.getBoundingClientRect().height,top:getComputedStyle(el).borderTopWidth,bottom:getComputedStyle(el).borderBottomWidth,left:getComputedStyle(el).borderLeftWidth,radius:getComputedStyle(el).borderRadius})));
      assert.equal(cards[1].y,cards[0].y+cards[0].height,'las filas solo se separan por la línea');
      assert.deepEqual({top:cards[0].top,bottom:cards[0].bottom,left:cards[0].left,radius:cards[0].radius},{top:'0px',bottom:'1px',left:'0px',radius:'0px'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:join(output,viewport.width+'-todas.png'),animations:'disabled'});
      await page.locator('#notif-cerrar').click();
      assert.equal(await page.locator('#notif-dropdown').getAttribute('aria-hidden'),'true');
      assert.equal(await page.locator('#notif-dropdown').evaluate(el=>el.inert),true);
      // Al cumplirse el día sale de recientes, pero conserva su estado sin leer.
      await page.clock.fastForward(120000);
      await page.waitForFunction(()=>document.querySelectorAll('#notif-centro .notif-item').length===0);
      assert.equal(await page.evaluate(()=>window.__notifMock.rows.find(n=>n.id==='limite').leido),false);
      await page.locator('#notif-centro [data-notif-tab="todas"]').click();
      assert.equal(await page.locator('#notif-centro .notif-item').count(),125);
      await page.locator('#notif-centro [data-notif-todas]').click();
      await page.waitForFunction(()=>!document.querySelector('#notif-centro [data-notif-todas]'));
      assert.equal(await page.evaluate(()=>window.__notifMock.rows.find(n=>n.id==='ajena').leido),false);
      assert.equal(await page.locator('#notif-centro .notif-item').count(),125);
      // Se puede navegar desde el espacio vacío de la fila, fuera del texto.
      await page.locator('#notif-centro [data-notif-id="reciente"]').click({position:{x:2,y:2}});
      await page.waitForURL('**/hub/dictamenes.html');
      await page.goto('http://127.0.0.1:'+server.address().port);
      const enlace=page.locator('#notif-centro [data-notif-id="reciente"] a');
      await enlace.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL('**/hub/dictamenes.html');
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('Capturas de notificaciones: '+output);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});
