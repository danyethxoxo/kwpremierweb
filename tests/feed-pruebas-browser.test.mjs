import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import{fileURLToPath}from'node:url';import{chromium}from'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
test('Propiedades de pruebas mantiene Página Universal, filtros, fichas y recepciones en escritorio y móvil',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='example.com')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#ddd"/></svg>'});if(u.hostname!=='kw.local')return route.abort();const p=path.join(root,decodeURIComponent(u.pathname).replace(/^\//,''));if(!fs.existsSync(p)||fs.statSync(p).isDirectory())return route.fulfill({status:404,body:''});let data=fs.readFileSync(p);if(p.endsWith('.html'))data=data.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');return route.fulfill({body:data,contentType:p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':p.endsWith('.png')?'image/png':'application/javascript'});});
  await page.goto('https://kw.local/hub/propiedades-pruebas.html');
  await page.evaluate(()=>{
   document.documentElement.classList.add('kw-auth-ok','kw-riel');window.qaCalls=[];window.qaEmpty=false;window.qaFail=false;
   window.kwSession={usuario:async()=>({data:{user:{id:'qa'}}}),usuarioInicial:async()=>({data:{user:{id:'qa'}}}),perfilInicial:async()=>({data:{role:'master',nombre:'Prueba'}})};
   function query(){const q=new Proxy({}, {get(t,k){if(k==='then')return(ok,bad)=>Promise.resolve({data:[],error:null}).then(ok,bad);return()=>q}});return q;}
   window.kwSupabase={from:query,auth:{getSession:async()=>({data:{session:null}})},functions:{invoke:async(n,args)=>{qaCalls.push(args.body);if(qaFail)return{error:{message:'error'},data:{error:'Sin acceso'}};let rows=Array.from({length:25},(_,i)=>({fuente_id:'QA-'+(i+1),estatus:i===24?'vendida':'publicada',envio_id:'envio-1',generado_at:'2026-11-12T10:00:00Z',recibido_at:'2026-11-12T10:01:00Z',datos:{titulo:i===0?'Casa <script> de prueba':'Casa '+(i+1),precio:4500000,moneda:'MXN',operacion:'venta',asesor_nombre:'Adriana García',estado:'Ciudad de México',municipio:'Benito Juárez',imagenes:['https://example.com/foto.jpg'],descripcion:'Descripción de prueba'}}));
    if(qaEmpty)rows=[];if(args.body.texto)rows=rows.filter(r=>r.fuente_id===args.body.texto);if(args.body.estatus)rows=rows.filter(r=>r.estatus===args.body.estatus);return{data:{ok:true,data:rows.slice((args.body.pagina-1)*24,args.body.pagina*24),total:rows.length,resumen:{total:qaEmpty?0:25,activas:24,inactivas:1,ultima_recepcion:'2026-11-12T10:01:00Z'},envios:[{envio_id:'envio-1',recibido_at:'2026-11-12T10:01:00Z',resultado:{almacenado_en_pruebas:true,recibidas:25,nuevas:25}}],rechazos:[{envio_id:'envio-error',codigo:422,mensaje:'Total inconsistente',recibido_at:'2026-11-12T10:02:00Z'}]}};}}};
  });
  for(const file of ['assets/js/kw-ui.js','assets/js/drawer.js','assets/js/kw-lateral.js','assets/js/kw-pagina-universal.js','assets/js/propiedades-feed.js','assets/js/kw-movil.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.waitForFunction(()=>document.querySelectorAll('#feed-filas [data-feed-id]').length===24);
  assert.equal(await page.locator('#notif-bell-slot').count(),1);assert.equal(await page.locator('#feed-filas script').count(),0);
  await page.locator('#feed-filas [data-feed-id]').first().click();await page.locator('#vista-detalle').waitFor({state:'visible'});assert.match(await page.locator('#feed-titulo').innerText(),/Casa <script>/);assert.equal(await page.locator('#feed-galeria img').count(),1);
  await page.getByRole('button',{name:'Volver a propiedades'}).click();await page.locator('#feed-siguiente').click();await page.waitForFunction(()=>document.querySelectorAll('#feed-filas [data-feed-id]').length===1);assert.match(await page.locator('#feed-filas').innerText(),/Vendida/);
  await page.evaluate(()=>{const i=document.getElementById('buscador-input');i.value='QA-1';i.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>document.querySelector('#feed-pagina').textContent==='Página 1 de 1');
  await page.locator('[data-kw-menu-universal]').click();await page.locator('[data-feed-vista="envios"]').click();assert.match(await page.locator('#feed-envios').innerText(),/Recibido en pruebas/);assert.match(await page.locator('#feed-rechazos').innerText(),/Total inconsistente/);
  await page.locator('[data-kw-menu-universal]').click();await page.locator('[role="menuitem"][data-feed-vista="lista"]').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sin desbordamiento global');
  await page.screenshot({path:path.join(root,'tmp-feed-'+width+'.png')});
  await page.evaluate(()=>{qaEmpty=true;document.getElementById('buscador-input').value='';document.getElementById('btn-nuevo').click();});await page.waitForFunction(()=>document.querySelector('#feed-filas').textContent.includes('Aún no hay propiedades'));
  await page.evaluate(()=>{qaFail=true;document.getElementById('btn-nuevo').click();});await page.locator('#feed-error').waitFor({state:'visible'});assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});

