import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const perfil={id:'11111111-1111-4111-8111-111111111111',nombre:'QA',apellido:'Dictamen',role:'master',email:'qa@example.com',whatsapp:'5512345678',sitio_web:'https://qa.kw.com',foto_url:'/assets/img/logo-kw-premier.png'};
const sdk=`document.documentElement.classList.add('kw-auth-ok');const perfil=${JSON.stringify(perfil)};
window.kwSession={perfilInicial:async()=>({data:perfil}),usuarioInicial:async()=>({data:{user:perfil}})};
window.kwSupabase={auth:{getSession:async()=>({data:{session:{user:perfil,access_token:'qa'}}}),getUser:async()=>({data:{user:perfil}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
from(table){let solo=false,id;const q=new Proxy({}, {get(_,key){if(key==='then')return (ok,bad)=>fetch('/qa?table='+table+'&id='+(id||'')).then(r=>r.json()).then(r=>({data:solo?r.data[0]||null:r.data,error:null})).then(ok,bad);return(...args)=>{if(key==='single'||key==='maybeSingle')solo=true;if(key==='eq'&&args[0]==='dictamen_id')id=args[1];return q;};}});return q;},rpc:async(name,args)=>fetch('/qa-rpc',{method:'POST',body:JSON.stringify({name,args})}).then(r=>r.json()),channel(){return{on(){return this;},subscribe(){return this;},unsubscribe(){}};},removeChannel(){},functions:{invoke:async()=>({data:{},error:null})}};`;
test('formulario real recupera clientes, folios, fechas parciales y observaciones no agregadas',async()=>{
 const browser=await chromium.launch({channel:'chrome'});const respaldos=new Map(),documentos=new Map();
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errores=[];page.on('pageerror',e=>errores.push(e.message));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname.endsWith('/auth-guard.js'))return route.fulfill({body:sdk,contentType:'application/javascript'});
   if(u.pathname==='/qa-rpc'){
    const {name,args:p}=route.request().postDataJSON();
    if(name==='autoguardar_dictamen'){
     respaldos.set(p.p_id,{datos:p.p_datos,updated_at:new Date().toISOString()});documentos.set(p.p_id,{id:p.p_id,estado:'borrador',inmueble:p.p_datos.borrador.inmueble,created_at:new Date().toISOString(),operacion:'venta',uso:'residencial'});
     return route.fulfill({json:{data:p.p_id,error:null}});
    }
    return route.fulfill({json:{data:{},error:null}});
   }
   if(u.pathname==='/qa'){
    const table=u.searchParams.get('table');let data=[];
    if(table==='profiles')data=[perfil];
    if(table==='dictamenes_con_asesor')data=[...documentos.values()];
    if(table==='dictamen_autoguardados'){const r=respaldos.get(u.searchParams.get('id'));if(r)data=[r];}
    return route.fulfill({json:{data}});
   }
   if(u.hostname!=='draft.local'||u.pathname.endsWith('/kw-session.js')||u.pathname.endsWith('/notif-bell.js'))return route.fulfill({body:''});
   const file=path.join(root,decodeURIComponent(u.pathname));if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
   let body=fs.readFileSync(file);if(file.endsWith('.html'))body=Buffer.from(body.toString('utf8').replace(/ integrity="[^"]+"/g,''));
   return route.fulfill({body,contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
  });
  await page.goto('https://draft.local/hub/dictamenes.html?nuevo=1');await page.waitForSelector('#vista-editor:not([style*="none"])');
  await page.locator('#e-inmueble').fill('Dirección de prueba');await page.locator('#e-folio-real').fill('FOLIO-1');
  await page.locator('[data-cliente-nombre]').first().fill('Cliente de prueba');await page.locator('#e-punto-texto').fill('Nota pendiente de agregar');
  await page.evaluate(()=>{document.getElementById('e-esc-anio').value='2025';document.getElementById('e-esc-anio').dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>document.getElementById('e-autoguardado').textContent==='Borrador guardado');assert.equal(documentos.size,1);
  await page.reload();await page.waitForFunction(()=>document.getElementById('e-inmueble').value==='Dirección de prueba');
  assert.equal(await page.locator('#e-folio-real').inputValue(),'FOLIO-1');assert.equal(await page.locator('[data-cliente-nombre]').first().inputValue(),'Cliente de prueba');assert.equal(await page.locator('#e-punto-texto').inputValue(),'Nota pendiente de agregar');assert.equal(await page.locator('#e-esc-anio').inputValue(),'2025');
  await page.evaluate(()=>{history.replaceState(null,'','/hub/dictamenes.html');dispatchEvent(new PopStateEvent('popstate'));});await page.waitForFunction(()=>document.getElementById('lista').textContent.includes('Dirección de prueba'));assert.equal(documentos.size,1);assert.deepEqual(errores,[]);
 }finally{await browser.close();}
});
