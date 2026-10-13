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
const ficha={...propiedades[0],id:id(1001),titulo:'Casa <img src=x onerror=alert(1)>',miniatura_url:'https://fotos.local/casa.png',recamaras:3,banos:2,m2_construccion:180,market_center:'KW Grand',asesor_nombre:'María Asesora',asesor_kw_id:'12345',operacion:'renta'};
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
   return new Promise(r=>setTimeout(()=>r({data,error:null,count:Array.isArray(data)?data.length:1}),tabla==='propiedades_inventario'?(window.qaDemoraFicha||0):0)).then(resolve,reject);
 };return ()=>{if(key==='single'||key==='maybeSingle')single=true;return query;};}});return query;},
 rpc(nombre,args){window.qaRpc.push({nombre,args});const ejecutar=async()=>{
   if(nombre==='propiedades_inventario_pagina')return {data:{data:qaProps,total:7431},error:null};
   if(nombre==='propiedades_inventario_mapa'){
     const puntos=Array.isArray(args.p_filtros.operacion)&&args.p_filtros.operacion.includes('renta')&&window.qaRenta?window.qaRenta:window.qaPuntos;
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
 const page=await browser.newPage({viewport,hasTouch:viewport.width<640});
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
  if(url.pathname==='/assets/vendor/mapa/leaflet.js')body=body.toString()+'\nwindow.qaEncuadres=[];const qaFit=L.Map.prototype.fitBounds;L.Map.prototype.fitBounds=function(bounds,options){window.qaEncuadres.push(bounds);return qaFit.call(this,bounds,options);};const qaSetView=L.Map.prototype.setView;L.Map.prototype.setView=function(c,z,o){window.qaMapa=this;return qaSetView.call(this,c,z,o);};';
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
    const vista=await page.evaluate(()=>({lat:qaMapa.getCenter().lat,lng:qaMapa.getCenter().lng,zoom:qaMapa.getZoom()}));
    assert.ok(Math.abs(vista.lat-22.8)<.05&&Math.abs(vista.lng+102.2)<.05&&vista.zoom===5,'Mexico mas cercano al abrir');
    assert.match(await page.locator('#prop-mapa-estado').innerText(),/3 propiedades.*19 sin coordenadas/);
    assert.equal(await page.locator('#lista').isVisible(),true);
    assert.equal(await page.locator('#prop-vista-mapa, #prop-vista-lista').count(),0);
    const cajas=await page.evaluate(()=>({lista:document.querySelector('#lista').getBoundingClientRect().toJSON(),mapa:document.querySelector('#prop-mapa-panel').getBoundingClientRect().toJSON()}));
    if(viewport.width>=1024)assert.ok(cajas.lista.right<=cajas.mapa.left,'mapa a la derecha del listado');
    else assert.ok(cajas.mapa.bottom<=cajas.lista.top,'en movil ambos aparecen en la misma pagina');
    const marco=await page.locator('#prop-mapa').boundingBox(),lupa=await page.locator('#prop-mapa-zona').boundingBox();
    assert.ok(lupa.x>=marco.x&&lupa.y>=marco.y&&lupa.x+lupa.width<=marco.x+marco.width,'controles dentro del mapa');
    assert.ok(lupa.width<=30&&lupa.height<=30,'iconos compactos');
    assert.equal(await page.locator('#prop-mapa-zona').innerText(),'');
    if(viewport.width>=1024)assert.ok(marco.height>=viewport.height-180,'aprovecha la altura disponible');
    assert.ok(await page.locator('#prop-mapa-panel').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'sin scroll interno del panel');
    if(!await page.locator('.leaflet-marker-icon:not(.prop-mapa-grupo)').count()){
      await page.locator('.prop-mapa-grupo').first().click();
    }
    await page.evaluate(()=>{window.qaDemoraFicha=400;});
    await page.locator('.leaflet-marker-icon:not(.prop-mapa-grupo)').first().click();
    await page.locator('#propiedades-cargando').waitFor({state:'visible'});
    assert.equal(await page.locator('#propiedades-cargando').count(),1);
    assert.equal(await page.locator('#lista .kw-loader, #prop-mapa-panel .kw-loader').count(),0,'sin animaciones dentro del listado o mapa');
    const centro=await page.locator('#propiedades-cargando .kw-loader').boundingBox();
    const ventana=await page.evaluate(()=>({width:document.documentElement.clientWidth,height:innerHeight}));
    assert.ok(Math.abs(centro.x+centro.width/2-ventana.width/2)<17&&Math.abs(centro.y+centro.height/2-ventana.height/2)<2,'animacion centrada en toda la pagina');
    await page.locator('.prop-mapa-ficha h3').waitFor();
    assert.equal(await page.locator('.prop-mapa-ficha h3').innerText(),ficha.titulo);
    assert.equal(await page.locator('.prop-mapa-ficha h3 img').count(),0,'titulo no interpreta HTML');
    assert.match(await page.locator('.prop-mapa-ficha .prop-mapa-precio').innerText(),/3,500,000/);
    assert.match(await page.locator('.prop-mapa-ficha .prop-mapa-enlace').getAttribute('href'),/^https:\/\/qa.kw.com\//);
    assert.equal((await page.locator('.prop-mapa-operacion').innerText()).toLowerCase(),'renta');
    assert.match(await page.locator('.prop-mapa-market-center').innerText(),/Grand/);
    assert.equal(await page.locator('.prop-mapa-asesor').innerText(),'María Asesora');
    assert.match(await page.locator('.prop-mapa-asesor a').getAttribute('href'),/\/agent\/mar%C3%ADa-asesora\/12345$/);
    await page.evaluate(()=>{window.copiarTextoPropiedad=async t=>{window.qaCopiado=t;};});
    await page.locator('.prop-mapa-ficha .prop-acciones-toggle').click();
    await page.locator('.prop-mapa-ficha [role="menuitem"]').filter({hasText:'Copiar link'}).click();
    assert.match(await page.evaluate(()=>qaCopiado),/^https:\/\/qa.kw.com\//);
    assert.equal(await page.locator('.prop-mapa-ficha .prop-acciones-toggle').getAttribute('aria-expanded'),'false');
    assert.equal(await page.evaluate(()=>qaDetalles),1,'ficha se consulta al pulsar');
    fs.mkdirSync(path.join(root,'artifacts/mapa-qa'),{recursive:true});
    await page.screenshot({path:path.join(root,`artifacts/mapa-qa/ficha-${viewport.width}.png`)});
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
    await page.locator('#propiedades-cargando').waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'sin desbordamiento horizontal');
    fs.mkdirSync(path.join(root,'artifacts/mapa-qa'),{recursive:true});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(root,`artifacts/mapa-qa/${viewport.width}.png`)});
    assert.deepEqual(errores,[]);
   } finally {await page.close();}
  }
 } finally {await browser.close();}
});

test('filtros requieren confirmacion; pluma a mano alzada y rueda funcionan en escritorio y movil',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  for(const viewport of [{width:1280,height:1000},{width:390,height:844}]){
  const {page,errores}=await pagina(browser,viewport,[[id(1001),19.43,-99.13],[id(1002),19.7,-101.1]]);
  try{
   await page.waitForFunction(()=>document.querySelector('#prop-mapa-panel').getAttribute('aria-busy')==='false');
   const inicial=await page.evaluate(()=>qaRpc.filter(r=>/propiedades_inventario_(pagina|mapa)$/.test(r.nombre)).length);
   await page.locator('#f-buscar').fill('michoacan');
   await page.waitForTimeout(700);
   assert.equal(await page.evaluate(()=>qaRpc.filter(r=>/propiedades_inventario_(pagina|mapa)$/.test(r.nombre)).length),inicial,'escribir no busca');
   await page.locator('#f-buscar').press('Enter');
   await page.waitForFunction(()=>document.querySelector('#prop-mapa-lugar').textContent.includes('Michoacán'));
   const estados=await page.evaluate(()=>Object.values(qaMapa._layers).filter(l=>l instanceof L.GeoJSON).flatMap(l=>l.toGeoJSON().features.map(f=>f.properties.cvegeo)));
   assert.deepEqual(estados,['16']);
   fs.mkdirSync(path.join(root,'artifacts/mapa-qa'),{recursive:true});
   await page.screenshot({path:path.join(root,`artifacts/mapa-qa/michoacan-${viewport.width}.png`)});
   await page.locator('#f-buscar').fill('');
   await page.evaluate(()=>{ponerFiltroRelacionado('f-estado','Ciudad de México');document.querySelector('#f-estado').dispatchEvent(new Event('change',{bubbles:true}));ponerFiltroRelacionado('f-municipio','Benito Juárez');document.querySelector('#f-municipio').dispatchEvent(new Event('change',{bubbles:true}));});
   if(viewport.width<640)await page.locator('#prop-filtros-expandir').click();
   await page.locator('#filtros .btn-aplicar').click();
   await page.waitForFunction(()=>document.querySelector('#prop-mapa-lugar').textContent.includes('Benito Juárez'));
   await page.waitForFunction(()=>qaRpc.some(r=>r.nombre==='propiedades_inventario_pagina'&&r.args.p_filtros.municipio.includes('Benito Juárez')));
   assert.deepEqual(await page.evaluate(()=>Object.values(qaMapa._layers).filter(l=>l instanceof L.GeoJSON).flatMap(l=>l.toGeoJSON().features.map(f=>f.properties.cvegeo))),['09014']);
   await page.evaluate(p=>{qaRenta=[p];},[id(1001),19.43,-99.13]);
   const antesRenta=await page.evaluate(()=>qaRpc.filter(r=>/propiedades_inventario_(pagina|mapa)$/.test(r.nombre)).length);
   await page.selectOption('#f-operacion','renta',{force:true});
   await page.waitForTimeout(700);
   assert.equal(await page.evaluate(()=>qaRpc.filter(r=>/propiedades_inventario_(pagina|mapa)$/.test(r.nombre)).length),antesRenta,'elegir filtro no busca');
   await page.locator('#filtros .btn-aplicar').click();
   await page.waitForFunction(()=>document.querySelector('#prop-mapa-estado').textContent.startsWith('1 propiedad'));
   await page.waitForFunction(()=>qaRpc.some(r=>r.nombre==='propiedades_inventario_pagina'&&r.args.p_filtros.operacion.includes('renta')));
   assert.ok(await page.evaluate(()=>qaRpc.some(r=>r.nombre==='propiedades_inventario_pagina'&&r.args.p_filtros.operacion.includes('renta'))));
   // El dibujo usa filtros confirmados y no incorpora cambios pendientes.
   await page.locator('#f-buscar').fill('pendiente sin aplicar');
   await page.locator('#prop-mapa-dibujar').click();
   await page.locator('#prop-mapa').scrollIntoViewIfNeeded();
   const caja=await page.locator('#prop-mapa').boundingBox();
   const camino=Array.from({length:41},(_,i)=>{const a=i*Math.PI*2/40;return {x:caja.x+caja.width*(.5+.25*Math.cos(a)),y:caja.y+caja.height*(.5+.25*Math.sin(a))};});
   if(viewport.width<640){
     const sesion=await page.context().newCDPSession(page);
     await sesion.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[camino[0]]});
     for(const p of camino.slice(1))await sesion.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[p]});
     await sesion.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sesion.detach();
   }else{
     await page.mouse.move(camino[0].x,camino[0].y);await page.mouse.down();
     for(const p of camino.slice(1))await page.mouse.move(p.x,p.y);
     await page.mouse.up();
   }
   await page.waitForFunction(()=>qaRpc.some(r=>r.nombre==='propiedades_inventario_pagina'&&r.args.p_filtros.poligono?.length>=3)&&qaRpc.some(r=>r.nombre==='propiedades_inventario_mapa'&&r.args.p_filtros.poligono?.length>=3));
   await page.waitForFunction(()=>document.querySelector('#prop-mapa-lugar').textContent.includes('Zona dibujada'));
   assert.equal(await page.locator('#prop-zona-quitar').isVisible(),true);
   assert.ok(await page.locator('#prop-zona-quitar').evaluate(el=>!!el.closest('.prop-mapa-barra')));
   const fila=await page.evaluate(()=>['prop-mapa-zona','prop-mapa-dibujar','prop-zona-quitar'].map(id=>document.getElementById(id).getBoundingClientRect().top));
   assert.ok(Math.max(...fila)-Math.min(...fila)<2,'los tres controles comparten fila');
   assert.ok(await page.evaluate(()=>qaRpc.filter(r=>r.nombre==='propiedades_inventario_mapa').at(-1).args.p_filtros.texto!=='pendiente sin aplicar'));
   await page.screenshot({path:path.join(root,`artifacts/mapa-qa/zona-${viewport.width}.png`)});
   await page.locator('#prop-zona-quitar').click();
   assert.equal(await page.evaluate(()=>kwPropiedadesMapa.poligono()),null);
   await page.locator('#prop-mapa-dibujar').click();await page.keyboard.press('Escape');
   assert.equal(await page.locator('#prop-mapa-dibujar').getAttribute('aria-pressed'),'false');
   assert.ok(await page.evaluate(()=>qaMapa.dragging.enabled()&&qaMapa.scrollWheelZoom.enabled()),'cancelar restaura controles');
   if(viewport.width>=640){
     await page.locator('#prop-mapa').scrollIntoViewIfNeeded();
     const rect=await page.locator('#prop-mapa').boundingBox(),zoom=await page.evaluate(()=>qaMapa.getZoom()),scroll=await page.evaluate(()=>scrollY);
     await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.wheel(0,-200);
     await page.waitForFunction(z=>qaMapa.getZoom()>z,zoom);
     assert.equal(await page.evaluate(()=>scrollY),scroll,'la rueda sobre el mapa no desplaza la pagina');
   }
   assert.deepEqual(errores,[]);
  }finally{await page.close();}
  }
 }finally{await browser.close();}
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
   const centro=await page.locator('.prop-mapa-grupo').first().evaluate(el=>{const a=el.getBoundingClientRect(),b=el.querySelector('span').getBoundingClientRect();return {x:Math.abs((a.left+a.right-b.left-b.right)/2),y:Math.abs((a.top+a.bottom-b.top-b.bottom)/2)};});
   assert.ok(centro.x<2&&centro.y<2,'numero centrado dentro del circulo');
   assert.equal(await page.locator('#lista .prop-card').count(),20);
   await page.evaluate(()=>{qaDemoraMapa=600;document.querySelector('#f-buscar').value='Anterior';aplicarFiltros();});
   await page.waitForFunction(()=>qaRpc.some(r=>r.nombre==='propiedades_inventario_mapa'&&r.args.p_filtros.texto==='Anterior'));
   await page.evaluate(p=>{qaDemoraMapa=0;qaPuntos=[p];document.querySelector('#f-buscar').value='Actual';aplicarFiltros();},[id(9002),19.43,-99.13]);
   await page.waitForFunction(()=>document.querySelector('#prop-mapa-estado').textContent.startsWith('1 propiedad'));
   await page.waitForTimeout(650);
   assert.match(await page.locator('#prop-mapa-estado').innerText(),/^1 propiedad/);
   assert.equal(await page.locator('#lista').isVisible(),true);
   await page.evaluate(()=>window.scrollTo(0,600));
   const arriba=await page.locator('#prop-mapa-panel').boundingBox();
   assert.ok(arriba.y>=0&&arriba.y<100,'mapa permanece visible al bajar por las tarjetas');
   assert.deepEqual(errores,[]);
  } finally {await page.close();}
 } finally {await browser.close();}
});
