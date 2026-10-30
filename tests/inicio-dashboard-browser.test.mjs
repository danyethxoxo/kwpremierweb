import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'artifacts/inicio');fs.mkdirSync(out,{recursive:true});
const sdk=`document.documentElement.classList.add('kw-auth-ok');
window.qaCalls=[];window.qaFail='';window.qaEmpty=false;
const perfil={id:'self',role:'asociado',nombre:'Daniel',apellido:'Guerrero',email:'qa@example.com',whatsapp:'5512345678',sitio_web:'https://qa.kw.com',foto_url:'/assets/img/logo-kw-premier.png'};
const usuario={id:'self',email:perfil.email};
window.kwSupabase={auth:{getUser:async()=>({data:{user:usuario}}),getSession:async()=>({data:{session:{user:usuario,access_token:'qa'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
from(table){const filtros=[],orden=[],estado={table,filtros,orden};let limite=100;
const q=new Proxy({},{get(_,key){if(key==='then')return resolve=>Promise.resolve().then(async()=>{
 if(window.qaHold&&table!=='profiles'&&table!=='perfiles_publicos')await new Promise(resolve=>window.qaResolvers.push(resolve)); qaCalls.push({...estado,limite});if(qaFail===table)return {data:null,error:{message:'Error simulado'}};
 if(table==='profiles'||table==='perfiles_publicos')return {data:perfil,error:null};
 if(qaEmpty)return {data:[],error:null};
 let data=table==='propiedades_inventario'?Array.from({length:12},(_,i)=>({id:'p-'+i,market_center:'KW Premier',asesor_nombre:'Asesor de prueba',enlace_kw:'https://kw.com/es-419/property/Prueba/'+(1000+i),titulo:['Departamento con terraza en Del Valle','Casa en Lomas de Chapultepec','Departamento en Santa Fe','Casa en Jardines del Pedregal','Oficina en Polanco'][i%5],colonia:'Del Valle Norte',municipio:'Benito Juárez',estado:'Ciudad de México',tipo:i%2?'Casa':'Departamento',operacion:i%2?'venta':'renta',estatus:'publicada',precio:i%2?12500000:25000,moneda:'MXN',created_at:new Date(Date.UTC(2026,9,29-i)).toISOString(),foto:'https://fotos.local/prueba.jpg'})):
 table==='dictamenes'?Array.from({length:6},(_,i)=>({id:'d-'+i,asesor_id:i===5?'otro':'self',inmueble:['San Francisco 87, Del Valle Norte','Av. Insurgentes Sur 1602','Paseo de los Laureles 24','Rio Balsas 112','Calle Hamburgo 213','Expediente ajeno'][i],folio:'DIC-2026-00'+(i+1),revision:i%3,estado:['devuelta','condicionada','autorizada','devuelta','autorizada'][i%5],estatus_marketing:i%2?'pendiente':'aprobado',estatus_listado:i%3?'aprobado':'sin_listado',archivado_at:null,updated_at:new Date(Date.UTC(2026,9,29-i)).toISOString()})):
 table==='firmas_documentos'?Array.from({length:9},(_,i)=>({id:'f-'+i,user_id:i===4?'otro':'self',titulo:i===4?'Documento ajeno':'Contrato '+(i+1),nombre_archivo:'contrato.pdf',estado:['pendiente','completado','borrador','error','pendiente','eliminado','pendiente','completado','pendiente'][i],firmantes:[{firmado:i===1},{firmado:i===1}],created_at:new Date(Date.UTC(2026,9,29-i)).toISOString()})):
 table==='perfiles_comprador'?Array.from({length:5},(_,i)=>({id:'c-'+i,asesor_id:i===4?'otro':'self',nombre:['Mariana López','Carlos Mendoza','Andrea Ramírez','Luis Hernández','Cliente ajeno'][i],activo:i!==3,operacion:i%2?'renta':'venta',tipos:['Departamento'],precio_max:i%2?30000:5000000,moneda:'MXN',created_at:new Date(Date.UTC(2026,9,29-i)).toISOString()})):[];
 for(const [col,value]of filtros)data=data.filter(row=>row[col]===value);for(const [col,value]of estado.desiguales||[])data=data.filter(row=>row[col]!==value);for(const [col,op]of [...orden].reverse())data.sort((a,b)=>String(a[col]).localeCompare(String(b[col]))*(op.ascending===false?-1:1));return {data:estado.single?(data[0]||null):data.slice(0,limite),error:null};
 }).then(resolve);
return(...args)=>{if(key==='eq'||key==='is')filtros.push(args);if(key==='order')orden.push(args);if(key==='select')estado.select=args[0];if(key==='limit')limite=args[0];if(key==='single')estado.single=true;if(key==='neq')(estado.desiguales||=[]).push(args);return q;};}});return q;},
rpc:async()=>({data:[],error:null}),channel(){return {on(){return this;},subscribe(){return this;},unsubscribe(){}};},removeChannel(){}};
window.kwSession={usuarioInicial:async()=>({data:{user:usuario}}),perfilInicial:async()=>({data:perfil})};
`;
async function abrir(browser,config={}){
 const context=await browser.newContext();
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.pathname.endsWith('/auth-guard.js'))return route.fulfill({body:sdk+(config.cargando?'window.qaHold=true;window.qaResolvers=[];':'')+(config.vacio?'qaEmpty=true;':'')+(config.error?"qaFail='"+config.error+"';":'')+(config.admin?"perfil.role='admin';":''),contentType:'application/javascript'});
  if(u.pathname.endsWith('/kw-ficha-propiedad.js'))return route.fulfill({body:'window.kwFichaPropiedad={abrir:async datos=>{window.qaFicha=datos;}};',contentType:'application/javascript'});
  if(u.hostname==='fotos.local')return route.fulfill({body:fs.readFileSync(fs.existsSync(path.join(out,'foto.jpg'))?path.join(out,'foto.jpg'):path.join(root,'assets/img/logo-kw-premier.png')),contentType:'image/jpeg'});
  if(u.hostname!=='kw.local'||u.pathname.endsWith('/kw-session.js')||u.pathname.endsWith('/notif-bell.js'))return route.fulfill({body:''});
  const f=path.join(root,decodeURIComponent(u.pathname));return route.fulfill({status:fs.existsSync(f)?200:404,body:fs.existsSync(f)?fs.readFileSync(f):'',contentType:f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'application/octet-stream'});
 });
 const page=await context.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://kw.local/portal.html');if(!config.cargando)await page.waitForFunction(()=>[...document.querySelectorAll('[data-widget-lista]')].every(el=>el.getAttribute('aria-busy')==='false'));
 return {page,context,errors};
}
test('Inicio muestra las diez propiedades nuevas y unicamente los dictamenes y compradores del asesor',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  const {page,context,errors}=await abrir(browser);
  assert.equal(await page.locator('#inicio-titulo').textContent(),'Hola Daniel, Welcome Home.');
  assert.ok(await page.evaluate(()=>{const t=document.querySelector('#inicio-titulo').getBoundingClientRect(),n=document.querySelector('.dash-tools').getBoundingClientRect();return t.right<n.left&&Math.abs((t.top+t.height/2)-(n.top+n.height/2))<2;}));
  assert.equal(await page.locator('.dash-view-all').first().evaluate(el=>el.getBoundingClientRect().height),32);
  assert.ok(await page.locator('.dash-create').evaluate(el=>{const i=el.querySelector('svg').getBoundingClientRect(),t=el.lastElementChild.getBoundingClientRect();return Math.abs(i.top+i.height/2-t.top-t.height/2)<1;}));
  assert.equal(await page.locator('#inicio-fecha').count(),0);
  assert.equal(await page.locator('.dash-count,.dash-refresh').count(),0);
  assert.deepEqual(await page.locator('.dash-view-all').allTextContents(),['Ver todo','Ver todo','Ver todo','Ver todo']);
  assert.equal(await page.locator('.dash-widget-head .dash-view-all').count(),4);
  assert.equal(await page.locator('.dash-widget-foot').count(),0);
  assert.ok(await page.locator('.dash-view-all').evaluateAll(els=>els.every(el=>getComputedStyle(el).color===getComputedStyle(el).borderTopColor&&getComputedStyle(el).borderTopWidth==='1px'&&getComputedStyle(el).backgroundColor==='rgb(255, 255, 255)')));
  assert.equal(await page.locator('.dash-tools a[href*="weetrust"],.dash-tools a[href*="kwmexico.mx"]').count(),0);
  assert.ok(await page.locator('.dash-property-link').first().evaluate(el=>el.querySelector('.dash-property-owner').getBoundingClientRect().left>el.querySelector('.dash-property-info').getBoundingClientRect().left));
  assert.ok(await page.evaluate(()=>{const d=document.querySelector('.dash-dictamenes').getBoundingClientRect(),c=document.querySelector('.dash-firmas').getBoundingClientRect();return Math.abs(c.top-d.bottom-18)<2;}));
  await page.locator('#notif-bell-slot').evaluate(el=>{el.innerHTML='<button class="notif-bell-btn" aria-label="Notificaciones"><svg viewBox="0 0 24 24"></svg></button>';});
  assert.equal(await page.locator('.notif-bell-btn').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  await page.locator('#drawer').screenshot({path:path.join(out,'menu-lateral.png')});
  assert.equal(await page.locator('.dash-property').count(),10);assert.equal(await page.locator('.dash-table tbody tr').count(),5);assert.equal(await page.locator('.dash-buyer').count(),4);
  assert.equal(await page.locator('.dash-property-link').first().getAttribute('href'),'https://qa.kw.com/es-419/property/Prueba/1000');
  assert.equal(await page.locator('.dash-operation').first().textContent(),'Renta');
  assert.equal(await page.locator('.dash-property-owner > .dash-operation').count(),10);
  assert.ok(await page.locator('.dash-property-owner').first().evaluate(el=>el.querySelector('.dash-operation').getBoundingClientRect().bottom<=el.querySelector('.dash-property-mc').getBoundingClientRect().top));
  assert.ok((await page.locator('.dash-property').first().textContent()).includes('KW Premier'));
  assert.ok((await page.locator('.dash-property').first().textContent()).includes('Asesor de prueba'));
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.qaCopied=text;}}}));
  assert.equal(await page.locator('.dash-buyer').first().getAttribute('href'),'/hub/cliente-formulario.html?id=c-0');
  assert.equal(await page.locator('.dash-create').getAttribute('href'),'/hub/cliente-formulario.html');
  assert.equal(await page.locator('.dash-widget-head h2 a').first().getAttribute('href'),'/propiedades.html');
  assert.equal(await page.locator('a[href="hub/accesosdirectos.html"]').count(),0);
  assert.equal(await page.locator('#card-liderazgo').isVisible(),false);
  const calls=await page.evaluate(()=>qaCalls.filter(c=>['dictamenes','perfiles_comprador'].includes(c.table)));
  for(const c of calls){assert.ok(c.filtros.some(([col,v])=>col==='asesor_id'&&v==='self'));assert.equal(c.limite,10);}
  const props=await page.evaluate(()=>qaCalls.find(c=>c.table==='propiedades_inventario'));assert.equal(props.orden[0][0],'created_at');assert.equal(props.limite,10);
  assert.ok(!(await page.locator('main').textContent()).includes('Cliente ajeno'));
  assert.equal(await page.locator('.dash-signature').count(),5);
  assert.equal(await page.locator('.dash-firmas .dash-view-all').getAttribute('href'),'/hub/firmas.html');
  assert.equal(await page.locator('.dash-signature strong').first().textContent(),'Contrato 1');
  assert.equal(await page.locator('.dash-signature .dash-pill,.dash-signature-progress').count(),0);
  assert.ok(!(await page.locator('#inicio-firmas').textContent()).includes('Documento ajeno'));
  const firmaQuery=await page.evaluate(()=>qaCalls.find(c=>c.table==='firmas_documentos'));
  assert.ok(firmaQuery.filtros.some(([k,v])=>k==='user_id'&&v==='self'));assert.equal(firmaQuery.limite,5);
  assert.ok(firmaQuery.desiguales.some(([k,v])=>k==='estado'&&v==='eliminado'));
  for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),String(width));
   assert.equal(await page.locator('#notif-bell-slot').count(),1);
   assert.equal(await page.locator('.dash-tools #notif-bell-slot').count(),1);
   assert.ok(await page.locator('main.dashboard').evaluate(el=>el.scrollHeight<=el.clientHeight+1));
   assert.ok(await page.locator('#inicio-propiedades').evaluate(el=>el.scrollHeight>el.clientHeight));
   assert.ok(await page.locator('#inicio-propiedades').evaluate(el=>Math.abs(el.clientHeight-el.firstElementChild.getBoundingClientRect().height*5)<2));
   assert.ok(await page.locator('.dash-tools').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   assert.ok(await page.locator('.dash-widget-head').evaluateAll(heads=>heads.every(el=>{const t=el.querySelector('h2').getBoundingClientRect(),b=el.querySelector('.dash-view-all').getBoundingClientRect();return Math.abs(t.top+t.height/2-b.top-b.height/2)<2&&el.scrollWidth<=el.clientWidth+1;})));
   assert.equal(await page.locator('.dash-tools > a svg').count(),0);
   if(width<1024)assert.ok(await page.locator('header.kw-header').isVisible());
   await page.locator('.dash-property-options').first().click();
   assert.ok(await page.locator('#inicio-menu-propiedad').isVisible());
   assert.equal(await page.locator('#inicio-menu-propiedad a').getAttribute('href'),'https://qa.kw.com/es-419/property/Prueba/1000');
   assert.ok(await page.locator('#inicio-menu-propiedad').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
   await page.getByRole('button',{name:'Copiar enlace',exact:true}).click();
   await page.waitForFunction(()=>window.qaCopied==='https://qa.kw.com/es-419/property/Prueba/1000');
   await page.keyboard.press('Escape');
   await page.screenshot({path:path.join(out,'inicio-'+width+'.png'),fullPage:width<1024});
  }
  await page.locator('.dash-property-options').first().click();
  await page.getByRole('button',{name:'Descargar ficha técnica',exact:true}).click();
  await page.waitForFunction(()=>window.qaFicha?.propiedad?.id==='p-0');
  const ficha=await page.evaluate(()=>qaFicha);
  assert.equal(ficha.url,'https://qa.kw.com/es-419/property/Prueba/1000');
  assert.equal(ficha.asesor.nombre,'Daniel');
  assert.ok(await page.evaluate(()=>qaCalls.some(c=>c.table==='propiedades_inventario'&&c.select==='*'&&c.filtros.some(([k,v])=>k==='id'&&v==='p-0'))));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#inicio-propiedades').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('.dash-property').count(),10);assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
});
test('Inicio distingue estados vacios, errores parciales y reintentos sin perder los otros widgets',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  const vacio=await abrir(browser,{vacio:true});assert.equal(await vacio.page.locator('.dash-empty').count(),4);assert.equal(await vacio.page.locator('.dash-create').count(),1);await vacio.context.close();
  const parcial=await abrir(browser,{error:'dictamenes',admin:true});
  assert.ok(await parcial.page.evaluate(()=>qaCalls.find(c=>c.table==='firmas_documentos').filtros.some(([k,v])=>k==='user_id'&&v==='self')));
  assert.equal(await parcial.page.locator('#btn-admin svg').count(),1);
  assert.equal(await parcial.page.locator('#btn-admin').textContent(),'');
  const estiloMaster=()=>parcial.page.locator('#btn-admin').evaluate(el=>{const s=getComputedStyle(el);return [s.color,s.backgroundColor,s.boxShadow,s.transform];});
  const masterNormal=await estiloMaster();await parcial.page.locator('#btn-admin').hover();assert.deepEqual(await estiloMaster(),masterNormal);
  assert.equal(await parcial.page.locator('#inicio-dictamenes [role="alert"]').count(),1);assert.equal(await parcial.page.locator('.dash-property').count(),10);assert.equal(await parcial.page.locator('#card-liderazgo').isVisible(),true);
  for(const width of [1440,768,320]){
   await parcial.page.setViewportSize({width,height:1000});
   assert.ok(await parcial.page.locator('.dash-tools').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   assert.ok(await parcial.page.locator('.dash-tools a:visible').evaluateAll(links=>links.every(el=>el.scrollWidth<=el.clientWidth+1)));
  }
  await parcial.page.locator('.dash-tools a').first().hover();
  assert.equal(await parcial.page.locator('.dash-tools a').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  await parcial.page.evaluate(()=>qaFail='');await parcial.page.getByRole('button',{name:'Volver a intentar'}).click();await parcial.page.waitForSelector('.dash-table tbody tr');
  assert.equal(await parcial.page.locator('.dash-table tbody tr').count(),5);assert.deepEqual(parcial.errors,[]);await parcial.context.close();
  const firmasError=await abrir(browser,{error:'firmas_documentos'});
  assert.equal(await firmasError.page.locator('#inicio-firmas [role="alert"]').count(),1);
  assert.equal(await firmasError.page.locator('.dash-property').count(),10);
  await firmasError.page.evaluate(()=>qaFail='');await firmasError.page.getByRole('button',{name:'Volver a intentar'}).click();
  await firmasError.page.waitForSelector('.dash-signature');assert.equal(await firmasError.page.locator('.dash-signature').count(),5);
  await firmasError.context.close();
 }finally{await browser.close();}
});

test('Skeletons independientes y compatibles con movimiento reducido',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  const {page,context,errors}=await abrir(browser,{cargando:true});
  await page.waitForFunction(()=>window.qaResolvers?.length===4);
  assert.equal(await page.locator('[data-widget-lista] .kw-loader').count(),0);
  assert.equal(await page.locator('.dash-skeleton[role="status"][aria-label="Cargando"]').count(),4);
  assert.equal(await page.locator('.dash-skeleton').first().evaluate(el=>getComputedStyle(el,'::after').animationName),'dash-shimmer');
  await page.screenshot({path:path.join(out,'inicio-cargando.png'),fullPage:true});
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.dash-skeleton').first().evaluate(el=>getComputedStyle(el,'::after').animationName),'none');
  await page.evaluate(()=>{qaHold=false;qaResolvers.forEach(resolve=>resolve());});
  await page.waitForFunction(()=>document.querySelectorAll('.dash-skeleton').length===0);
  assert.equal(await page.locator('.dash-signature').count(),5);
  assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
});
