import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
function fixture({owner}){
 const uid=owner?'2bd46b9a-68d8-476c-844c-27f10097816e':'00000000-0000-4000-8000-000000000099';
 window.qa={rows:[],rules:null,calls:[],api:[],configured:false,linked:false};const s=window.qa;
 const user={id:uid,email:owner?'dani.guerrero@kwmexico.mx':'otro@example.com'};const profile={id:uid,nombre:'Prueba',apellido:'Privada',role:'master',email:user.email,whatsapp:'5512345678',sitio_web:'https://qa.kw.com',foto_url:'/assets/img/logo-kw-premier.png'};
 window.kwSession={usuarioInicial:async()=>({data:{user}}),usuario:async()=>({data:{user}}),perfilInicial:async()=>({data:profile})};
 window.kwSupabase={auth:{getSession:async()=>({data:{session:{user,access_token:'test-browser-token'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async()=>({data:owner,error:null}),
 from(table){let operation='select',data,filters=[],single=false;const q=new Proxy({},{get(_,key){if(key==='then')return resolve=>Promise.resolve().then(()=>{s.calls.push(table);let result=[];
 if(table==='prospectos_bandeja'){
  if(operation==='insert'){const row={...data,id:'prospecto-'+(s.rows.length+1),created_at:new Date().toISOString()};s.rows.push(row);result=[row];}
  else if(operation==='update'){result=s.rows.filter(r=>filters.every(([k,v])=>r[k]===v));result.forEach(r=>Object.assign(r,data));}
  else if(operation==='delete'){s.rows=s.rows.filter(r=>!filters.every(([k,v])=>r[k]===v));}
  else result=s.rows.filter(r=>filters.every(([k,v])=>r[k]===v));
 }else if(table==='prospectos_reglas'){if(operation==='upsert')s.rules=data;result=s.rules?[s.rules]:[];}
 return{data:single?(result[0]||null):result,error:null};}).then(resolve);
 return(...args)=>{if(['insert','update','delete','upsert'].includes(key)){operation=key;data=args[0];}if(key==='eq')filters.push(args);if(key==='maybeSingle'||key==='single')single=true;return q;};}});return q;},channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel(){}};
}
async function pageFor(browser,owner,hash=''){
 const context=await browser.newContext({viewport:{width:1440,height:950}});await context.addInitScript(fixture,{owner});
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());
  if(u.pathname.endsWith('/auth-guard.js'))return route.fulfill({body:"document.documentElement.classList.add('kw-auth-ok');",contentType:'application/javascript'});
  if(u.pathname.endsWith('/kw-session.js')||u.pathname.endsWith('/notif-bell.js'))return route.fulfill({body:'',contentType:'application/javascript'});
  if(u.pathname==='/functions/v1/prospectos-gmail'){
   const headers={'Access-Control-Allow-Origin':'https://kw.local','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});const body=req.postDataJSON();
   const response=await page.evaluate(body=>{qa.api.push(body.accion);if(body.accion==='configurar')qa.configured=true;if(body.accion==='vincular')qa.linked=true;if(body.accion==='desconectar')qa.linked=false;return body.accion==='estado'?{configurada:qa.configured,vinculada:qa.linked,correo:qa.linked?'gmail@example.com':'',client_id:qa.configured?'123-test.apps.googleusercontent.com':'',redirect_uri:'https://example.supabase.co/functions/v1/prospectos-gmail'}:{ok:true,revocada:true};},body);
   return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(response)});
  }
  if(u.hostname!=='kw.local')return route.fulfill({body:'',contentType:'application/javascript'});
  const file=path.join(root,decodeURIComponent(u.pathname));if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
  const ext=path.extname(file);return route.fulfill({body:fs.readFileSync(file),contentType:ext==='.html'?'text/html; charset=utf-8':ext==='.css'?'text/css':ext==='.js'?'application/javascript':ext==='.png'?'image/png':'application/octet-stream'});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://kw.local/hub/prospectos.html'+hash);return{page,context,errors};
}
test('Prospectos privado: persiste captura y reglas, Gmail y diseno en escritorio y movil',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});try{
  const {page,context,errors}=await pageFor(browser,true);await page.locator('#prospectos-app').waitFor({state:'visible'});await page.waitForFunction(()=>qa.api.includes('estado'));
  await page.getByRole('button',{name:'Nuevo prospecto',exact:true}).click();await page.locator('#p-nombre').fill('Ana <img src=x onerror=alert(1)>');await page.locator('#p-correo').fill('ana@example.com');await page.locator('#p-interes').fill('Departamento en Del Valle');await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#prospectos-filas tr').length===1&&document.querySelector('#prospectos-filas').textContent.includes('Ana'));
  assert.equal(await page.locator('#prospectos-filas img').count(),0);assert.equal(await page.evaluate(()=>qa.rows.length),1);
  await page.getByRole('button',{name:'Vincular Gmail',exact:true}).click();await page.locator('#g-client-id').fill('123-test.apps.googleusercontent.com');await page.locator('#g-client-secret').fill('test-only-oauth-secret');await page.getByRole('button',{name:'Guardar configuración',exact:true}).click();
  await page.waitForFunction(()=>qa.configured);assert.equal(await page.locator('#g-client-secret').inputValue(),'');
  await page.locator('#gmail-reglas').click();await page.locator('#r-remitentes').fill('portal.example\nleads@portal.example');await page.locator('#r-asuntos').fill('Nuevo interesado');await page.getByRole('button',{name:'Guardar reglas',exact:true}).click();await page.waitForFunction(()=>qa.rules?.remitentes.length===2);
  fs.mkdirSync(path.join(root,'artifacts/prospectos'),{recursive:true});
  for(const width of [1440,390]){await page.setViewportSize({width,height:950});await page.waitForTimeout(120);assert.equal(await page.locator('#notif-bell-slot').count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(width===390){await page.locator('#kw-drawer-toggle').click();assert.equal(await page.locator('#gmail-conectar').isVisible(),true);await page.getByRole('button',{name:'Cerrar filtros',exact:true}).click();}await page.screenshot({path:path.join(root,'artifacts/prospectos/modulo-'+width+'.png'),fullPage:true});}
  assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
});
test('Prospectos: otro master no ve el modulo ni puede iniciar la vinculacion',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});try{
  const {page,context,errors}=await pageFor(browser,false);await page.getByText('No tienes acceso a este apartado.',{exact:true}).waitFor();for(const width of [1440,390]){await page.setViewportSize({width,height:950});await page.waitForTimeout(100);assert.equal(await page.locator('#prospectos-app').isVisible(),false);assert.equal(await page.locator('#btn-nuevo').isVisible(),false);assert.equal(await page.locator('[data-drawer-prospectos]').isVisible(),false);}assert.deepEqual(await page.evaluate(()=>qa.api),[]);assert.ok(!(await page.evaluate(()=>qa.calls)).includes('prospectos_bandeja'));assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
});
test('Gmail: callback limpia el codigo de la URL y muestra la cuenta vinculada',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});try{
  const {page,context,errors}=await pageFor(browser,true,'#gmail_code=test-code&gmail_state='+'a'.repeat(64));await page.getByText('Cuenta vinculada',{exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'');assert.equal(await page.locator('#gmail-correo').textContent(),'gmail@example.com');assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
});
