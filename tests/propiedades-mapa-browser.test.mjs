import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import sharp from 'sharp';

const root=fileURLToPath(new URL('../',import.meta.url));
const user={id:'11111111-1111-4111-8111-111111111111',email:'qa@example.com',last_sign_in_at:new Date().toISOString()};
const perfil={...user,role:'admin',nombre:'QA',apellido:'Mapa',sitio_web:'https://qa.kw.com',foto_url:'/assets/img/logo-kw-premier.png',whatsapp:'5512345678'};
const id=n=>'22222222-2222-4222-8222-'+String(n).padStart(12,'0');
const propiedades=Array.from({length:20},(_,n)=>({id:id(n),fuente:'kwmexico',fuente_id:String(n),titulo:'Casa de prueba '+n,operacion:'venta',estatus:'publicada',tipo:'Casa',precio:3500000,moneda:'MXN',imagenes:[],colonia:'Del Valle',municipio:'Benito Juárez',estado:'Ciudad de México',enlace_kw:'https://kw.com/es-419/property/casa/123456'}));
const ficha={...propiedades[0],id:id(1001),titulo:'Casa <img src=x onerror=alert(1)>',miniatura_url:'https://fotos.local/casa.png',recamaras:3,banos:2,m2_construccion:180};
const sdk=`
window.qaRpc=[];window.qaDetalles=0;window.qaErrorMapa=false;window.qaDemoraMapa=0;
var qaUser=${JSON.stringify(user)},qaPerfil=${JSON.stringify(perfil)},qaProps=${JSON.stringify(propiedades)},qaFicha=${JSON.stringify(ficha)};
var qaSession={user:qaUser,access_token:'header.'+btoa(JSON.stringify({amr:[{method:'password',timestamp:Date.now()/1000}]}))+'.signature'};
window.supabase={createClient(){return {
 auth:{getSession:async()=>({data:{session:qaSession}}),getUser:async()=>({data:{user:qaUser}}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},
 from(tabla){let single=false;const query=new Proxy({}, {get(t,key){if(key==='then')return (resolve,reject)=>{
   let data=tabla==='profiles'?[qaPerfil]:tabla==='propiedades_inventario'?[qaFicha]:[];
   if(tabla==='propiedades_inventario')window.qaDetalles++;
   if(single)data=data[0]||null;
   return Promise.resolve({data,error:null,count:Array.isArray(data)?data.length:1}).then(resolve,reject);
 };return ()=>{if(key==='single'||key==='maybeSingle')single=true;return query;};}});return query;},
 rpc(nombre,args){window.qaRpc.push({nombre,args});const ejecutar=async()=>{
   if(nombre==='propiedades_inventario_pagina')return {data:{data:qaProps,total:7431},error:null};
   if(nombre==='propiedades_inventario_mapa'){
     const puntos=window.qaPuntos;
     if(window.qaDemoraMapa)await new Promise(r=>setTimeout(r,window.qaDemoraMapa));
     if(window.qaErrorMapa)return {error:{message:'Error simulado'}};
     return {data:{total:puntos.length+19,ubicadas:puntos.length,puntos:puntos,limite:12000},error:null};
   }
   return {data:[],error:null};
 };return {abortSignal:()=>ejecutar(),then:(resolve,reject)=>ejecutar().then(resolve,reject)};},
 channel(){return {on(){return this;},subscribe(){return this;},unsubscribe(){}};},removeChannel(){},functions:{invoke:async()=>({data:{},error:null})}
};}};
`;

async function pagina(browser,viewport,puntos){
 const page=await browser.newPage({viewport});
 const errores=[];page.on('pageerror',error=>errores.push(error.message));
 const pedidos=[];
 const png=await sharp({create:{width:256,height:256,channels:3,background:'#e8e7df'}}).png().toBuffer();
 await page.addInitScript(p=>{window.qaPuntos=p;},puntos);
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());pedidos.push(url.pathname);
  if(url.pathname.includes('/functions/v1/mfa-correo'))return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({activo:true,verificado:true,requerido:true,usuario:user,perfil})});
  if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('/@supabase/'))return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/javascript',body:sdk});
  if(['tile.openstreetmap.org','fotos.local'].includes(url.hostname))return route.fulfill({contentType:'image/png',body:png});
  if(url.hostname!=='kw.local')return route.abort();
  const file=path.join(root,decodeURIComponent(url.pathname));
  if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  const contentType=file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream';
  let body=file.endsWith('.html')?fs.readFileSync(file,'utf8').replace(/\s+(?:integrity|crossorigin)="[^"]*"/g,''):fs.readFileSync(file);
  if(url.pathname==='/assets/vendor/mapa/leaflet.js')body=body.toString()+'\nwindow.qaEncuadres=[];const qaFit=L.Map.prototype.fitBounds;L.Map.prototype.fitBounds=function(bounds,options){window.qaEncuadres.push(bounds);return qaFit.call(this,bounds,options);};';
  return route.fulfill({contentType,body});
 });
 await page.goto('http://kw.local/propiedades.html',{waitUntil:'domcontentloaded'});
 try { await page.locator('#lista .prop-card').first().waitFor({timeout:10000}); }
 catch(error) { throw new Error(error.message+'\n'+errores.join('; ')+'\n'+await page.locator('body').innerText()); }
 return {page,errores,pedidos};
}

test('propiedades y mapa simultáneos: pines, ficha, zona, distribución y reintento en escritorio y móvil',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try {
  for(const viewport of [{width:1920,height:1080},{width:1280,height:900},{width:390,height:844}]){
   const {page,errores}=await pagina(browser,viewport,[[id(1001),19.43,-99.13],[id(1002),20.67,-103.35],[id(1003),25.68,-100.31]]);
   try {
    if(viewport.width<1024){
      assert.equal(await page.locator('#prop-filtros-contenido').isVisible(),false);
      await page.locator('#prop-filtros-expandir').click();
      assert.equal(await page.locator('#prop-filtros-contenido').isVisible(),true);
      await page.locator('#prop-filtros-expandir').click();
    }
    await page.waitForFunction(()=>document.querySelector('#prop-mapa-panel').getAttribute('aria-busy')==='false'&&document.querySelectorAll('.leaflet-marker-icon').length>0);
    assert.deepEqual(await page.evaluate(()=>qaEncuadres),[[[14.3,-118.5],[32.9,-86.5]]],'abre Mexico sin reenfocar automaticamente todos los anuncios');
    assert.match(await page.locator('#prop-mapa-estado').innerText(),/3 propiedades.*19 sin coordenadas/);
    assert.equal(await page.locator('#lista').isVisible(),true);
    assert.equal(await page.locator('#prop-vista-mapa, #prop-vista-lista').count(),0);
    const cajas=await page.evaluate(()=>({lista:document.querySelector('#lista').getBoundingClientRect().toJSON(),mapa:document.querySelector('#prop-mapa-panel').getBoundingClientRect().toJSON()}));
    if(viewport.width>=1024)assert.ok(cajas.lista.right<=cajas.mapa.left,'mapa a la derecha del listado');
    else assert.ok(cajas.mapa.bottom<=cajas.lista.top,'en movil ambos aparecen en la misma pagina');
    if(!await page.locator('.leaflet-marker-icon:not(.prop-mapa-grupo)').count()){
      await page.locator('.prop-mapa-grupo').first().click();
    }
    await page.locator('.leaflet-marker-icon:not(.prop-mapa-grupo)').first().click();
    await page.locator('.prop-mapa-ficha h3').waitFor();
    assert.equal(await page.locator('.prop-mapa-ficha h3').innerText(),ficha.titulo);
    assert.equal(await page.locator('.prop-mapa-ficha h3 img').count(),0,'titulo no interpreta HTML');
    assert.match(await page.locator('.prop-mapa-ficha .prop-mapa-precio').innerText(),/3,500,000/);
    assert.match(await page.locator('.prop-mapa-ficha a').getAttribute('href'),/^https:\/\/qa.kw.com\//);
    assert.equal(await page.evaluate(()=>qaDetalles),1,'ficha se consulta al pulsar');
    await page.locator('.leaflet-popup-close-button').click();
    await page.locator('#prop-mapa-zona').click();
    await page.waitForFunction(()=>qaRpc.some(r=>r.nombre==='propiedades_inventario_pagina'&&Array.isArray(r.args.p_filtros.zona))&&qaRpc.filter(r=>r.nombre==='propiedades_inventario_mapa').length===2&&document.querySelector('#prop-mapa-panel').getAttribute('aria-busy')==='false');
    assert.equal(await page.locator('#prop-zona-quitar').isVisible(),true);
    assert.equal(await page.locator('#lista .prop-card').count(),20);
    assert.equal(await page.locator('#prop-mapa-panel').isVisible(),true);
    await page.locator('#prop-zona-quitar').click();
    await page.waitForFunction(()=>qaRpc.filter(r=>r.nombre==='propiedades_inventario_pagina').length>=3);
    assert.equal(await page.evaluate(()=>kwPropiedadesMapa.zona()),null);
    await page.evaluate(()=>{qaErrorMapa=true;document.querySelector('#f-buscar').value='Error';aplicarFiltros();});
    await page.locator('#prop-mapa-reintentar').waitFor({state:'visible'});
    await page.evaluate(()=>{qaErrorMapa=false;});
    await page.locator('#prop-mapa-reintentar').click();
    await page.waitForFunction(()=>document.querySelector('#prop-mapa-estado').textContent.startsWith('3 propiedades'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'sin desbordamiento horizontal');
    fs.mkdirSync(path.join(root,'artifacts/mapa-qa'),{recursive:true});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(root,`artifacts/mapa-qa/${viewport.width}.png`)});
    assert.deepEqual(errores,[]);
   } finally {await page.close();}
  }
 } finally {await browser.close();}
});

test('miles de pines no bloquean el listado y una respuesta anterior no reemplaza los filtros actuales',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 const puntos=Array.from({length:8000},(_,n)=>[id(n),19.2+(n%100)*.005,-99.4+Math.floor(n/100)*.005]);
 try {
  const {page,errores}=await pagina(browser,{width:1280,height:900},puntos);
  try {
   await page.waitForFunction(()=>document.querySelector('#prop-mapa-estado').textContent.startsWith('8,000 propiedades'),null,{timeout:20000});
   const iconos=await page.locator('.leaflet-marker-icon').count();
   assert.ok(iconos>0&&iconos<500,'solo dibuja grupos visibles');
   assert.equal(await page.locator('#lista .prop-card').count(),20);
   await page.evaluate(()=>{qaDemoraMapa=600;document.querySelector('#f-buscar').value='Anterior';aplicarFiltros();});
   await page.waitForFunction(()=>qaRpc.some(r=>r.nombre==='propiedades_inventario_mapa'&&r.args.p_filtros.texto==='Anterior'));
   await page.evaluate(p=>{qaDemoraMapa=0;qaPuntos=[p];document.querySelector('#f-buscar').value='Actual';aplicarFiltros();},[id(9002),19.43,-99.13]);
   await page.waitForFunction(()=>document.querySelector('#prop-mapa-estado').textContent.startsWith('1 propiedades'));
   await page.waitForTimeout(650);
   assert.match(await page.locator('#prop-mapa-estado').innerText(),/^1 propiedades/);
   assert.equal(await page.locator('#lista').isVisible(),true);
   await page.evaluate(()=>window.scrollTo(0,600));
   const arriba=await page.locator('#prop-mapa-panel').boundingBox();
   assert.ok(arriba.y>=0&&arriba.y<100,'mapa permanece visible al bajar por las tarjetas');
   assert.deepEqual(errores,[]);
  } finally {await page.close();}
 } finally {await browser.close();}
});
