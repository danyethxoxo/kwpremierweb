import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const sdk=fs.readFileSync(path.join(root,'tests/contrato-comercial-browser.test.mjs'),'utf8').split('const sdk=`')[1].split('`;')[0].replace("role:'asesor'","role:'master'").replace("email:'perfil@example.com'","email:'perfil@example.com',foto_url:'/assets/img/logo-kw-premier.png',sitio_web:'https://qa.kw.com'").replace('session:null',"session:{user:{id:'qa-user',email:'qa@example.com'},access_token:'qa'}");
const paginas=[];
function inventario(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules','artifacts'].includes(item.name))continue;const archivo=path.join(dir,item.name);if(item.isDirectory())inventario(archivo);else if(item.name.endsWith('.html')&&fs.readFileSync(archivo,'utf8').includes('/assets/js/kw-movil.js'))paginas.push(path.relative(root,archivo).replaceAll('\\','/'));}}
inventario(root);
async function entorno(page){
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/auth-guard.js'))return route.fulfill({contentType:'application/javascript',body:sdk+'\nwindow.supabase={createClient:()=>window.kwSupabase};'});
    if(url.pathname.endsWith('/kw-session.js'))return route.fulfill({body:''});
    if(url.hostname!=='kw.local')return route.abort();
    const file=path.join(root,decodeURIComponent(url.pathname));
    return route.fulfill({status:fs.existsSync(file)?200:404,body:fs.existsSync(file)?fs.readFileSync(file):'',contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
  });
}
test('QA movil: todas las pantallas comparten posicion, navegacion, margenes y limites',async()=>{
  const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
  const destino=path.join(root,'artifacts/movil-qa');fs.mkdirSync(destino,{recursive:true});
  const fallos=[],mediciones=[];
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(5000);await entorno(page);
    for(const ruta of paginas){
      await page.goto('https://kw.local/'+ruta,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.body.classList.contains('kw-movil')&&document.documentElement.classList.contains('kw-auth-ok'));
      for(const width of [320,390,768,1023]){
        await page.setViewportSize({width,height:844});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const datos=await page.evaluate(()=>{
          const rect=el=>el?.getBoundingClientRect().toJSON();const header=document.querySelector('body > header.kw-header');
          const visibles=selector=>Array.from(document.querySelectorAll(selector)).filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
          return {ancho:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,header:rect(header),titulo:rect(header?.querySelector('.kw-header-title')),texto:header?.querySelector('.kw-header-title')?.textContent.trim(),menu:rect(header?.querySelector('#kw-drawer-toggle,#kw-movil-menu')),campanas:document.querySelectorAll('#notif-bell-slot').length,atras:visibles('header.kw-header .back-btn').length,acciones:visibles('header.kw-header .kw-header-sueltos > *').map(el=>({id:el.id,clase:el.className,rect:rect(el)})),desbordes:visibles('body *').filter(el=>el.getBoundingClientRect().right>document.documentElement.clientWidth+1&&!el.closest('.drawer,.kw-lateral,.tabla-marco,.kw-universal-tabla-marco,.acuerdos-preview-col,.modal-overlay,[hidden]')).slice(0,8).map(el=>el.tagName+'.'+el.className)};
        });
        mediciones.push({ruta,width,...datos});
        const comprobar=(ok,motivo)=>{if(!ok)fallos.push({ruta,width,motivo,datos});};
        comprobar(datos.header?.x===0&&datos.header?.y===0&&Math.abs(datos.header?.height-60)<=1,'encabezado fijo de 60 px');
        comprobar(datos.menu?.x===8&&datos.menu?.width===44,'menu en la misma posicion');
        comprobar(datos.titulo?.x===54&&datos.titulo?.height>0&&datos.texto,'titulo en la misma posicion');
        comprobar(datos.campanas===1,'una campana');
        comprobar(datos.acciones.some(a=>a.id==='notif-bell-slot'),'campana en el encabezado');
        comprobar(datos.atras===0,'sin flechas mezcladas en el encabezado');
        comprobar(datos.scroll<=datos.ancho+1,'sin desplazamiento horizontal de pagina');
        comprobar(datos.acciones.every(a=>a.rect.right<=datos.ancho+1&&a.rect.top>=0&&a.rect.bottom<=61),'acciones dentro del encabezado');
        if(width===390&&['propiedades.html','portal.html','hub/firmas.html','hub/dictamenes.html','hub/drive.html','hub/clientes.html','hub/calendario.html','documentos/acuerdos/acuerdoreferido.html','hub/admin.html','hub/pagina-universal.html'].includes(ruta))await page.screenshot({path:path.join(destino,ruta.replaceAll('/','_')+'.png')});
      }
    }
    fs.writeFileSync(path.join(destino,'resultados.json'),JSON.stringify({paginas:paginas.length,mediciones,fallos},null,2));
    assert.deepEqual(fallos.map(({ruta,width,motivo,datos})=>({ruta,width,motivo,desbordes:datos.desbordes})),[]);
  }finally{await browser.close();}
});

test('QA movil: menu de documentos accesible y regreso a escritorio',async()=>{
  const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});await entorno(page);
    await page.goto('https://kw.local/documentos/acuerdos/acuerdoreferido.html');
    await page.getByRole('button',{name:'Menú',exact:true}).click();
    await page.getByRole('dialog',{name:'Menú del Hub'}).waitFor();
    assert.equal(await page.getByRole('link',{name:'Firmas Digitales',exact:true}).isVisible(),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').isVisible(),false);
    assert.equal(await page.locator('#kw-movil-menu').evaluate(el=>el===document.activeElement),true);
    await page.setViewportSize({width:1440,height:1000});
    await page.waitForFunction(()=>!document.body.classList.contains('kw-movil'));
    assert.equal(await page.locator('.kw-movil-header,dialog.kw-movil-navegacion').count(),0);
    assert.equal(await page.locator('.vista-lista-header .btn-nuevo-documento').isVisible(),true);
    await page.setViewportSize({width:390,height:844});
    await page.goto('https://kw.local/hub/perfil-comprador.html');
    await page.locator('header #abrir-cliente').waitFor();
    await page.locator('header #abrir-cliente').click();await page.waitForURL(/cliente-formulario/);
    assert.equal(await page.locator('header #notif-bell-slot').count(),1);
    await page.setViewportSize({width:1440,height:1000});
    await page.waitForFunction(()=>!document.body.classList.contains('kw-movil'));
    assert.equal(await page.locator('#comprador-acciones #notif-bell-slot').count(),1);
  }finally{await browser.close();}
});
