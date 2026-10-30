import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
test('Liderazgo abre nuevo asesor sin descargar la base ni esperar catálogos y conserva la captura',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  for(const role of ['staff','master','asociado']){
   const page=await browser.newPage({viewport:{width:1366,height:900}});const errors=[],saved=[];page.on('pageerror',e=>errors.push(e.message));await page.exposeFunction('qaRecord',r=>saved.push(r));
   let html=fs.readFileSync(path.join(root,'hub/base-asesores.html'),'utf8');
   let main=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('async function init()'))[1];
   main=main.slice(0,main.lastIndexOf("  if (document.documentElement.classList.contains('kw-auth-ok'))"))+'window.qa={init,llenarLista};';
   html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
   await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='kw.local')return r.abort();if(u.pathname==='/hub/admin.html')return r.fulfill({body:'<html><body>Panel</body></html>',contentType:'text/html'});if(u.pathname==='/hub/base-asesores.html')return r.fulfill({body:html,contentType:'text/html'});const f=path.join(root,decodeURIComponent(u.pathname));return r.fulfill({status:fs.existsSync(f)?200:404,body:fs.existsSync(f)?fs.readFileSync(f):'',contentType:f.endsWith('.css')?'text/css':'application/octet-stream'});});
   await page.goto('http://kw.local/hub/base-asesores.html?nuevo=1');
   await page.addScriptTag({content:fs.readFileSync(path.join(root,'assets/js/kw-ui.js'),'utf8')});
   await page.evaluate(role=>{
    document.documentElement.classList.add('kw-auth-ok');window.calls=[];window.catalog=new Promise(r=>window.releaseCatalog=r);
    window.kwSupabase={auth:{getUser:async()=>({data:{user:{id:'alberto',email:'alberto.velazquez@kwpremier.com.mx'}}})},functions:{invoke:async(name,request)=>{await window.qaRecord({kind:'access',body:request.body});return{data:{ok:true},error:null};}},
     from(table){window.calls.push(table);let payload;const q=new Proxy({},{get(_,key){if(key==='insert')return data=>{payload=data;return q;};if(key==='single')return async()=>{if(payload)await window.qaRecord({kind:'insert',data:payload});return{data:table==='profiles'?{role}:{id:'new-advisor'},error:null};};if(key==='then')return(ok,bad)=>window.catalog.then(()=>({data:[{nombre:'Coach de prueba',apellido:'',email:'coach@example.com',role:'staff'}],error:null})).then(ok,bad);return()=>q;}});return q;}};
   },role);
   await page.addScriptTag({content:main});await page.evaluate(()=>window.qa.init());
   if(role==='asociado'){assert.equal(await page.locator('#denegado').isVisible(),true);assert.equal(await page.locator('#vista-ficha').isVisible(),false);await page.close();continue;}
   await page.locator('#vista-ficha').waitFor();assert.equal(await page.locator('#f-nombre').isEditable(),true);
   assert.equal(await page.evaluate(()=>window.calls.includes('asesores')),false,'el alta vacía no descarga el directorio');
   await page.locator('#f-nombre').fill('Captura mientras cargan catálogos');
   await page.evaluate(()=>{window.qa.llenarLista('f-celula',['Mi elección'],'Sin célula','Mi elección');window.releaseCatalog();});
   await page.waitForFunction(()=>Array.from(document.getElementById('f-celula').options).some(o=>o.textContent==='Coach de prueba'));
   assert.equal(await page.locator('#f-nombre').inputValue(),'Captura mientras cargan catálogos');assert.equal(await page.locator('#f-celula').inputValue(),'Mi elección');
   await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   fs.mkdirSync(path.join(root,'outputs/asesores'),{recursive:true});await page.screenshot({path:path.join(root,'outputs/asesores/nuevo-'+role+'.png'),fullPage:true});
   if(role==='staff'){
    await page.locator('#f-correo').fill('nueva.persona@example.com');await page.locator('#ficha-guardar').click();await page.waitForURL('**/hub/admin.html');
    assert.equal(saved[0].body.accion,'acceso_nuevo_asesor');assert.equal(saved[1].kind,'insert');assert.equal(saved[1].data.correo,'nueva.persona@example.com');
   }
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();}
});
