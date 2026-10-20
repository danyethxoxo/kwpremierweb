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

async function pagina(browser,viewport,puntos,entornoReal=false,inicio=null){
 const page=await browser.newPage({viewport,hasTouch:viewport.width<640});
 const errores=[];page.on('pageerror',error=>errores.push(error.message));
 const pedidos=[];
 const png=await sharp({create:{width:256,height:256,channels:3,background:'#e8e7df'}}).png().toBuffer();
 await page.addInitScript(p=>{window.qaPuntos=p;},puntos);
 if(inicio)await page.addInitScript(config=>{
  window.qaInicioGeo=[];
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok,error){qaInicioGeo.push(true);setTimeout(()=>config.code?error({code:config.code}):ok({coords:config.coords}),config.demora||0);}}});
 },inicio);
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());pedidos.push(url.pathname);
  if(entornoReal===true&&url.hostname==='tiles.openfreemap.org')return route.continue();
  if(url.pathname.includes('/functions/v1/mfa-correo'))return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({activo:true,verificado:true,requerido:true,usuario:user,perfil})});
  if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('/@supabase/'))return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/javascript',body:sdk});
  if(['tile.openstreetmap.org','fotos.local'].includes(url.hostname))return route.fulfill({contentType:'image/png',body:png});
  if(url.hostname!=='kw.local')return route.abort();
  const file=path.join(root,decodeURIComponent(url.pathname));
  if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  const contentType=file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream';
  let body=file.endsWith('.html')?fs.readFileSync(file,'utf8').replace(/\s+(?:integrity|crossorigin)="[^"]*"/g,''):fs.readFileSync(file);
  // Las pruebas generales parten de una búsqueda explícita. Las de inicio
  // automático usan coordenadas o un rechazo controlado del navegador.
  if(file.endsWith('.html')&&!inicio)body=body.replace('id="f-buscar"','id="f-buscar" value="Casa"');
  if(file.endsWith('.html')&&!entornoReal)body=body.replace('<div id="prop-mapa"','<div data-tiles="https://tile.openstreetmap.org/{z}/{x}/{y}.png" id="prop-mapa"');
  if(url.pathname==='/assets/vendor/mapa/leaflet.js')body=body.toString()+'\nwindow.qaEncuadres=[];const qaFit=L.Map.prototype.fitBounds;L.Map.prototype.fitBounds=function(bounds,options){window.qaEncuadres.push(bounds);return qaFit.call(this,bounds,options);};const qaSetView=L.Map.prototype.setView;L.Map.prototype.setView=function(c,z,o){window.qaMapa=this;return qaSetView.call(this,c,z,o);};';
  return route.fulfill({contentType,body});
 });
 await page.goto('https://kw.local/propiedades.html',{waitUntil:'domcontentloaded'});
 try { if(!inicio?.noEsperar)await page.locator(inicio?.code?'#lista .estado-msg':'#lista .prop-card').first().waitFor({timeout:15000}); }
 catch(error) { throw new Error(error.message+'\n'+errores.join('; ')+'\n'+await page.locator('body').innerText()); }
 if(!inicio)await page.locator('#f-buscar').fill('');
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
    assert.ok(vista.zoom>=4&&vista.zoom<=8,'una búsqueda explícita encuadra sus resultados');
    assert.match(await page.locator('#prop-mapa-estado').innerText(),/3 propiedades.*19 sin coordenadas/);
    assert.equal(await page.locator('#lista').isVisible(),true);
    assert.equal(await page.locator('#prop-vista-mapa, #prop-vista-lista').count(),0);
    const cajas=await page.evaluate(()=>({lista:document.querySelector('#lista').getBoundingClientRect().toJSON(),mapa:document.querySelector('#prop-mapa-panel').getBoundingClientRect().toJSON()}));
    if(viewport.width>=1024)assert.ok(cajas.lista.right<=cajas.mapa.left,'mapa a la derecha del listado');
    else assert.ok(cajas.mapa.bottom<=cajas.lista.top,'en movil ambos aparecen en la misma pagina');
    const marco=await page.locator('#prop-mapa').boundingBox(),lupa=await page.locator('#prop-mapa-zona').boundingBox();
    assert.ok(lupa.x>=marco.x&&lupa.y>=marco.y&&lupa.x+lupa.width<=marco.x+marco.width,'controles dentro del mapa');
    assert.ok(lupa.y+lupa.height<=marco.y+marco.height-18,'buscar queda encima de la atribución');
    assert.ok(lupa.width>=120&&lupa.height<=40,'buscar en esta zona tiene una etiqueta visible y compacta');
    assert.equal(await page.locator('#prop-mapa-zona').innerText(),'Buscar en esta zona');
    if(viewport.width>=1024)assert.ok(marco.height>=viewport.height-180,'aprovecha la altura disponible');
    assert.ok(await page.locator('#prop-mapa-panel').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'sin scroll interno del panel');
    if(!await page.locator('.leaflet-marker-icon:not(.prop-mapa-grupo)').count()){
      await page.locator('.prop-mapa-grupo').first().click();
    }
    await page.evaluate(()=>{window.qaDemoraFicha=400;});
    await page.locator('.leaflet-marker-icon:not(.prop-mapa-grupo)').first().click();
    await page.locator('.prop-mapa-ficha-vacia').waitFor();
    assert.equal(await page.locator('#propiedades-cargando, .prop-mapa-ficha .kw-loader').count(),0,'abrir un pin no muestra animacion');
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
    await page.evaluate(()=>{window.qaDemoraMapa=600;});
    await page.locator('#prop-mapa-zona').click();
    await page.locator('#propiedades-cargando').waitFor({state:'visible'});
    assert.equal(await page.locator('#propiedades-cargando').count(),1);
    assert.equal(await page.locator('#lista .kw-loader, #prop-mapa-panel .kw-loader').count(),0,'sin animaciones dentro del listado o mapa');
    const centro=await page.locator('#propiedades-cargando .kw-loader').boundingBox();
    const ventana=await page.evaluate(()=>({width:document.documentElement.clientWidth,height:innerHeight}));
    assert.ok(Math.abs(centro.x+centro.width/2-ventana.width/2)<17&&Math.abs(centro.y+centro.height/2-ventana.height/2)<2,'animacion centrada en toda la pagina');
    const velo=await page.locator('#propiedades-cargando').evaluate(el=>({color:getComputedStyle(el).backgroundColor,x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
    assert.equal(velo.color,'rgba(255, 255, 255, 0.75)');
    assert.equal(velo.x,0); assert.equal(velo.y,0);
    assert.ok(Math.abs(velo.width-ventana.width)<17&&Math.abs(velo.height-ventana.height)<2,'velo cubre toda la pagina');
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

test('inicio en ciudad, desplazamiento explícito y búsquedas que liberan la zona anterior',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{for(const width of [1440,390]){
  const {page,errores}=await pagina(browser,{width,height:1000},[[id(0),19.369,-99.163,'venta',3500000,'MXN']],false,{coords:{latitude:19.369,longitude:-99.163,accuracy:25}});
  try{
   await page.waitForFunction(()=>document.getElementById('prop-mapa-panel').getAttribute('aria-busy')==='false');
   const inicial=await page.evaluate(()=>qaRpc.filter(r=>/^propiedades_inventario_(pagina|mapa)$/.test(r.nombre)));
   assert.ok(inicial.length>=2&&inicial.every(r=>r.args.p_filtros.estado.includes('Ciudad de México')),'no consulta inventario nacional al entrar');
   assert.equal(await page.evaluate(()=>qaInicioGeo.length),1);
   assert.ok(await page.evaluate(()=>qaMapa.getZoom()>8&&qaMapa.getBounds().contains([19.369,-99.163])));
   const antes=await page.evaluate(()=>qaRpc.filter(r=>/^propiedades_inventario_(pagina|mapa)$/.test(r.nombre)).length);
   await page.evaluate(()=>{qaPuntos=[[qaProps[0].id,25.68,-100.31,'venta',3500000,'MXN']];qaMapa.setView([25.68,-100.31],13,{animate:false});});
   await page.waitForTimeout(300);
   assert.equal(await page.evaluate(()=>qaRpc.filter(r=>/^propiedades_inventario_(pagina|mapa)$/.test(r.nombre)).length),antes,'mover el mapa no dispara consultas');
   await page.locator('#prop-mapa-zona').click();
   await page.waitForFunction(()=>qaRpc.some(r=>r.nombre==='propiedades_inventario_pagina'&&r.args.p_filtros.zona?.[0]>24));
   const filtros=await page.evaluate(()=>qaRpc.filter(r=>r.nombre==='propiedades_inventario_mapa').at(-1).args.p_filtros);
   assert.equal(filtros.estado,null);assert.equal(filtros.municipio,null);assert.ok(filtros.zona[0]<25.68&&filtros.zona[2]>25.68);
   if(width<1024)await page.locator('#prop-filtros-expandir').click();
   await page.locator('#f-min').fill('1000000');
   await page.selectOption('#f-operacion','renta',{force:true});
   await page.locator('#filtros .btn-aplicar').click();
   await page.waitForFunction(()=>qaRpc.some(r=>r.nombre==='propiedades_inventario_pagina'&&r.args.p_filtros.minimo===1000000));
   const refinados=await page.evaluate(()=>qaRpc.filter(r=>r.nombre==='propiedades_inventario_pagina').at(-1).args.p_filtros);
   assert.deepEqual(refinados.zona,filtros.zona,'precio y operación conservan la zona');assert.ok(refinados.operacion.includes('renta'));
   await page.locator('#f-buscar').fill('Guadalajara');
   await page.locator('#f-buscar').press('Enter');
   await page.waitForFunction(()=>qaRpc.some(r=>r.nombre==='propiedades_inventario_pagina'&&r.args.p_filtros.municipio?.includes('Guadalajara')));
   const destino=await page.evaluate(()=>qaRpc.filter(r=>r.nombre==='propiedades_inventario_pagina').at(-1).args.p_filtros);
   assert.equal(destino.zona,null);assert.equal(destino.poligono,null);assert.ok(destino.estado.includes('Jalisco'));
   assert.deepEqual(errores,[]);
  }finally{await page.close();}
 }}finally{await browser.close();}
});

test('sin permiso no carga todo México y permite elegir ciudad manualmente',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  const {page,errores}=await pagina(browser,{width:1280,height:900},[[id(0),25.68,-100.31,'venta',3500000,'MXN']],false,{code:1});
  try{
   assert.match(await page.locator('#lista .estado-msg').innerText(),/Elige una ciudad/);
   assert.equal(await page.evaluate(()=>qaRpc.filter(r=>/^propiedades_inventario_(pagina|mapa)$/.test(r.nombre)).length),0);
   await page.locator('#f-buscar').fill('Monterrey');await page.locator('#f-buscar').press('Enter');
   await page.locator('#lista .prop-card').first().waitFor();
   assert.ok(await page.evaluate(()=>qaRpc.filter(r=>r.nombre==='propiedades_inventario_pagina').every(r=>r.args.p_filtros.municipio.includes('Monterrey'))));
   assert.deepEqual(errores,[]);
  }finally{await page.close();}
 }finally{await browser.close();}
});

test('una ubicación tardía no sustituye la ciudad elegida manualmente',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  const {page,errores}=await pagina(browser,{width:1280,height:900},[[id(0),20.676,-103.35,'venta',3500000,'MXN']],false,{coords:{latitude:19.369,longitude:-99.163,accuracy:25},demora:2000,noEsperar:true});
  try{
   await page.waitForFunction(()=>window.qaInicioGeo?.length===1);
   await page.locator('#f-buscar').fill('Guadalajara');await page.locator('#f-buscar').press('Enter');
   await page.locator('#lista .prop-card').first().waitFor();await page.waitForTimeout(2200);
   assert.ok(await page.evaluate(()=>qaRpc.filter(r=>r.nombre==='propiedades_inventario_pagina').every(r=>r.args.p_filtros.municipio.includes('Guadalajara'))));
   assert.deepEqual(errores,[]);
  }finally{await page.close();}
 }finally{await browser.close();}
});

test('precios compactos, moneda, consulta y ficha sin saturar el mapa',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try {for(const width of [1440,390]){
  const {page,errores}=await pagina(browser,{width,height:900},[
   [id(0),19.43,-99.13,'venta',3500000,'MXN'],
   [id(1),25.68,-100.31,'renta',25000,'MXN'],
   [id(2),20.67,-103.35,'venta',450000,'USD'],
   [id(3),21.16,-86.85,null,null,'MXN'],
  ]);
  try {
   await page.locator('.prop-mapa-pin').first().waitFor();
   assert.deepEqual((await page.locator('.prop-mapa-pin').allTextContents()).sort(),['$3.5M','$25K','USD 450K','Consultar'].sort());
   const labels=await page.locator('.prop-mapa-pin').evaluateAll(els=>els.map(el=>({width:el.clientWidth,scroll:el.scrollWidth,bg:getComputedStyle(el).backgroundColor})));
   assert.ok(labels.every(el=>el.scroll<=el.width&&el.bg==='rgb(255, 255, 255)'));
   assert.match(await page.locator('.prop-mapa-pin').filter({hasText:'USD'}).locator('..').getAttribute('title'),/450,000/);
   await page.locator('.prop-mapa-pin').filter({hasText:'$3.5M'}).click();
   await page.locator('.prop-mapa-ficha h3').waitFor();
   assert.deepEqual(errores,[]);
  }finally{await page.close();}
 }}finally{await browser.close();}
});

test('mi ubicación solo pide permiso al pulsar, centra el mapa y conserva un solo marcador',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try {for(const width of [1440,390]){
  const {page,errores}=await pagina(browser,{width,height:900},[[id(0),19.43,-99.13,'venta',3500000,'MXN']]);
  try {
   await page.waitForFunction(()=>!document.getElementById('prop-mapa-mi-ubicacion').disabled);
   await page.waitForFunction(()=>document.getElementById('prop-mapa-panel').getAttribute('aria-busy')==='false');
   const controles=await page.evaluate(()=>({zoom:document.querySelector('.leaflet-control-zoom').getBoundingClientRect().toJSON(),gps:document.getElementById('prop-mapa-mi-ubicacion').getBoundingClientRect().toJSON(),contador:getComputedStyle(document.getElementById('prop-mapa-estado')).fontSize}));
   assert.ok(controles.gps.top>=controles.zoom.bottom&&Math.abs(controles.gps.left-controles.zoom.left)<3,'GPS debajo de los controles de zoom');
   assert.equal(controles.contador,'8px');
   assert.equal(await page.locator('#prop-mapa-ayuda').isVisible(),false,'sin leyenda permanente de precios');
   assert.equal(await page.locator('#prop-mapa-ayuda').textContent(),'');
   await page.evaluate(()=>{
    window.qaGeoCalls=0;
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok,error,options){qaGeoCalls++;window.qaGeo={ok,error,options};}}});
   });
   const calls=await page.evaluate(()=>qaRpc.filter(r=>/^propiedades_inventario_(pagina|mapa)$/.test(r.nombre)).length);
   await page.locator('#prop-mapa-mi-ubicacion').click();
   assert.equal(await page.evaluate(()=>qaGeoCalls),1);
   assert.equal(await page.locator('#prop-mapa-mi-ubicacion').getAttribute('aria-busy'),'true');
   await page.evaluate(()=>qaGeo.ok({coords:{latitude:19.369,longitude:-99.163,accuracy:25}}));
   const location=await page.evaluate(()=>({center:qaMapa.getCenter(),zoom:qaMapa.getZoom(),pins:Object.values(qaMapa._layers).filter(l=>l instanceof L.CircleMarker&&!(l instanceof L.Circle)).length,halo:Object.values(qaMapa._layers).filter(l=>l instanceof L.Circle).map(l=>l.getRadius()),calls:qaRpc.filter(r=>/^propiedades_inventario_(pagina|mapa)$/.test(r.nombre)).length}));
   assert.ok(Math.abs(location.center.lat-19.369)<.001&&Math.abs(location.center.lng+99.163)<.001);
   assert.equal(location.zoom,16);assert.equal(location.pins,1);assert.deepEqual(location.halo,[25]);
   assert.equal(location.calls,calls,'centrarse no altera los filtros ni solicita propiedades');
   fs.mkdirSync(path.join(root,'artifacts/mapa-ubicacion'),{recursive:true});
   await page.locator('#prop-mapa-panel').screenshot({path:path.join(root,`artifacts/mapa-ubicacion/ubicacion-${width}.png`)});
   await page.locator('#prop-mapa-mi-ubicacion').click();
   await page.evaluate(()=>qaGeo.ok({coords:{latitude:19.37,longitude:-99.164,accuracy:30}}));
   assert.equal(await page.evaluate(()=>Object.values(qaMapa._layers).filter(l=>l instanceof L.CircleMarker&&!(l instanceof L.Circle)).length),1);
   await page.locator('#prop-mapa-mi-ubicacion').click();
   await page.evaluate(()=>qaGeo.error({code:1}));
   assert.match(await page.locator('#prop-mapa-ubicacion-error').innerText(),/Permite el acceso/);
   assert.equal(await page.locator('#prop-mapa-mi-ubicacion').isEnabled(),true);
   await page.locator('#prop-mapa-mi-ubicacion').click();
   await page.evaluate(()=>qaGeo.error({code:3}));
   assert.match(await page.locator('#prop-mapa-ubicacion-error').innerText(),/tardó demasiado/);
   await page.locator('#prop-mapa-mi-ubicacion').click();
   await page.evaluate(()=>qaGeo.error({code:2}));
   assert.match(await page.locator('#prop-mapa-ubicacion-error').innerText(),/Revisa el GPS/);
   await page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:undefined}));
   await page.locator('#prop-mapa-mi-ubicacion').click();
   assert.match(await page.locator('#prop-mapa-ubicacion-error').innerText(),/no permite/);
   assert.deepEqual(errores,[]);
  }finally{await page.close();}
 }}finally{await browser.close();}
});

test('geolocalización nativa con permiso concedido coloca el marcador personal',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try {
  const {page,errores}=await pagina(browser,{width:1280,height:900},[]);
  try {
   await page.waitForFunction(()=>!document.getElementById('prop-mapa-mi-ubicacion').disabled);
   await page.context().grantPermissions(['geolocation'],{origin:new URL(page.url()).origin});
   await page.context().setGeolocation({latitude:19.369,longitude:-99.163,accuracy:35});
   await page.locator('#prop-mapa-mi-ubicacion').click();
   await page.waitForFunction(()=>Object.values(qaMapa._layers).some(l=>l instanceof L.Circle&&l.getRadius()===35));
   assert.equal(await page.locator('#prop-mapa-ubicacion-error').isVisible(),false);
   assert.deepEqual(errores,[]);
  }finally{await page.close();}
 }finally{await browser.close();}
});

test('fondo alternativo conserva precios y navegación si el proveedor vectorial falla',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try {
  const {page,errores}=await pagina(browser,{width:1280,height:900},[[id(0),19.43,-99.13,'venta',3500000,'MXN']],'fallo');
  try {
   await page.waitForFunction(()=>document.querySelector('#prop-mapa').dataset.fondo==='alternativo');
   assert.equal(await page.locator('.prop-mapa-pin').innerText(),'$3.5M');
   await page.locator('.prop-mapa-pin').click();await page.locator('.prop-mapa-ficha h3').waitFor();
   assert.deepEqual(errores,[]);
  }finally{await page.close();}
 }finally{await browser.close();}
});

test('fondo real de entorno y precios en escritorio y móvil',{skip:process.env.KW_MAPA_REAL!=='1'},async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try {for(const width of [1440,390]){
  const {page,errores}=await pagina(browser,{width,height:1000},[
   [id(0),19.371,-99.168,'venta',6250000,'MXN'],
   [id(1),19.365,-99.172,'renta',37000,'MXN'],
   [id(2),19.36,-99.163,'venta',2250000,'MXN'],
   [id(3),19.379,-99.16,'renta',25000,'MXN'],
   [id(4),19.371,-99.151,'venta',10380000,'MXN'],
  ],true);
  try {
   const mensajes=[];page.on('console',msg=>{if(msg.type()==='error')mensajes.push(msg.text());});
   await page.waitForFunction(()=>window.qaMapa&&document.getElementById('prop-mapa-panel').getAttribute('aria-busy')==='false');
   await page.evaluate(()=>qaMapa.setView([19.369,-99.163],15.5,{animate:false}));
   await page.locator('#prop-mapa').scrollIntoViewIfNeeded();
   try {await page.waitForFunction(()=>document.querySelector('#prop-mapa').dataset.fondo==='entorno',null,{timeout:25000});}
   catch(e){throw new Error(e.message+'\n'+mensajes.join('\n'));}
   await page.waitForTimeout(2500);
   const features=await page.evaluate(()=>{
    const gl=Object.values(qaMapa._layers).find(layer=>layer.getMaplibreMap)?.getMaplibreMap();
    return gl.queryRenderedFeatures().filter(f=>f.layer.id.startsWith('kw-entorno-')).map(f=>({capa:f.layer.id,nombre:f.properties.name}));
   });
   assert.ok(features.some(f=>f.capa==='kw-entorno-transporte'),'estaciones reales visibles');
   assert.ok(features.some(f=>f.capa==='kw-entorno-salud'),'hospitales reales visibles');
   fs.mkdirSync(path.join(root,'artifacts/mapa-precios'),{recursive:true});
   await page.locator('#prop-mapa-panel').screenshot({path:path.join(root,`artifacts/mapa-precios/entorno-${width}.png`)});
   console.log(JSON.stringify({width,puntosInteres:features}));
   assert.deepEqual(errores,[]);
  }finally{await page.close();}
 }}finally{await browser.close();}
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
     await page.evaluate(()=>document.querySelector('#prop-mapa').addEventListener('pointerdown',e=>{window.qaPuntero=e.pointerId;},{once:true,capture:true}));
     await sesion.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[camino[0]]});
     await page.waitForFunction(()=>window.qaPuntero!==undefined);
     await page.evaluate(()=>document.querySelector('#prop-mapa').releasePointerCapture(qaPuntero));
     await sesion.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[camino[1]]});
     await sesion.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await page.waitForFunction(()=>document.querySelector('#prop-mapa-dibujar').getAttribute('aria-pressed')==='false');
     assert.ok(await page.evaluate(()=>qaMapa.dragging.enabled()&&qaMapa.touchZoom.enabled()),'perder captura restaura controles táctiles');
     await page.locator('#prop-mapa-dibujar').click();
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
   const fila=await page.evaluate(()=>['prop-mapa-dibujar','prop-zona-quitar'].map(id=>document.getElementById(id).getBoundingClientRect().top));
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


test('foto ubica el pin agrupado; precio, titulo y direccion abren la propiedad',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try {
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
   const {page,errores}=await pagina(browser,viewport,[[id(0),19.43,-99.13],[id(1),19.4301,-99.1301]]);
   try {
    await page.waitForFunction(()=>document.querySelector('#prop-mapa-panel').getAttribute('aria-busy')==='false');
    await page.context().route('https://qa.kw.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Propiedad</title>'}));
    const card=page.locator('#lista .prop-card').first();
    await card.locator('.prop-foto-mapa').click();
    await page.locator('.prop-mapa-ficha h3').waitFor();
    assert.equal(await page.locator('.prop-mapa-ficha h3').innerText(),propiedades[0].titulo);
    assert.ok(await page.evaluate(()=>qaMapa.getZoom()>=16&&qaMapa.getBounds().contains([19.43,-99.13])));
    assert.equal(await page.locator('#propiedades-cargando').count(),0);
    assert.equal(await page.evaluate(()=>qaDetalles),0,'usa la ficha disponible sin nueva consulta');
    await page.waitForTimeout(350);
    assert.ok(await page.locator('.prop-mapa-ficha h3').isVisible(),'la ficha sigue abierta al terminar el acercamiento');
    await page.locator('.leaflet-popup-close-button').click();
    for(const selector of ['.prop-precio','.prop-titulo','.prop-ubic']){
     await card.scrollIntoViewIfNeeded();
     const box=await card.locator(selector).boundingBox();
     const destino=await card.locator('.prop-enlace').getAttribute('href');
     const nueva=page.waitForEvent('popup');
     await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
     const popup=await nueva;await popup.waitForLoadState();
     assert.equal(popup.url(),destino);await popup.close();
    }
    await page.locator('#lista .prop-card').nth(2).locator('.prop-foto-mapa').click();
    assert.match(await page.locator('#prop-mapa-estado').innerText(),/no est.*disponible/);
    assert.deepEqual(errores,[]);
   } finally {await page.close();}
  }
 } finally {await browser.close();}
});


test('pines y grupos distinguen venta roja y renta naranja',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try {
  const {page,errores}=await pagina(browser,{width:1280,height:900},[[id(0),19.43,-99.13,'venta'],[id(1),25.68,-100.31,'renta'],[id(2),20.67,-103.35,null]]);
  try {
   await page.waitForFunction(()=>document.querySelector('#prop-mapa-panel').getAttribute('aria-busy')==='false');
   assert.equal(await page.locator('.prop-mapa-pin-venta').evaluate(el=>getComputedStyle(el).borderLeftColor),'rgb(204, 0, 0)');
   assert.equal(await page.locator('.prop-mapa-pin-renta').evaluate(el=>getComputedStyle(el).borderLeftColor),'rgb(232, 117, 20)');
   assert.equal(await page.locator('.prop-mapa-pin-sin-operacion').evaluate(el=>getComputedStyle(el).borderLeftColor),'rgb(102, 102, 102)');
   assert.match(await page.locator('.prop-mapa-pin-sin-operacion').locator('..').getAttribute('title'),/por confirmar/);
   assert.match(await page.locator('#prop-mapa-estado').innerText(),/1 con operación por confirmar \(gris\)/);
   for(const tipos of [['renta','renta'],['venta','venta'],['venta','renta'],['venta',null],['renta',null],[null,null],['mixto',null]]){
    await page.evaluate(t=>{qaPuntos=[[qaProps[0].id,19.43,-99.13,t[0]],[qaProps[1].id,19.4301,-99.1301,t[1]]];document.querySelector('#prop-mapa-reintentar').click();},tipos);
    const conocidas=tipos.filter(Boolean);
    const tipo=!conocidas.length?'neutro':conocidas.includes('mixto')||new Set(conocidas).size>1?'mixto':conocidas[0];
    await page.locator('.prop-mapa-grupo-'+tipo).waitFor();
    assert.equal(await page.locator('.prop-mapa-grupo-'+tipo).innerText(),'2');
    assert.equal(await page.locator('.prop-mapa-grupo-sin-operacion').count(),0);
   }
   await page.evaluate(()=>{qaPuntos=[[qaProps[0].id,19.43,-99.13,'mixto']];document.querySelector('#prop-mapa-reintentar').click();});
   await page.locator('.prop-mapa-pin-mixto').waitFor();
   assert.equal(await page.locator('.prop-mapa-pin-mixto').evaluate(el=>getComputedStyle(el).borderRightColor),'rgb(232, 117, 20)');
   assert.deepEqual(errores,[]);
  } finally {await page.close();}
 } finally {await browser.close();}
});


test('precio agrega comas al escribir y envia numeros al aplicar filtros',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try {for(const width of [1440,390]) {
  const {page,errores}=await pagina(browser,{width,height:900},[]);
  try {
   if(width<640)await page.locator('#prop-filtros-expandir').click();
   await page.locator('#f-min').fill('1000000');
   await page.locator('#f-max').fill('9000000');
   assert.equal(await page.locator('#f-min').inputValue(),'1,000,000');
   assert.equal(await page.locator('#f-max').inputValue(),'9,000,000');
   const filtros=await page.evaluate(()=>leerFiltrosServidor());
   assert.equal(filtros.minimo,1000000);assert.equal(filtros.maximo,9000000);
   await page.locator('#f-max').fill('9,500,000.50');
   assert.equal(await page.locator('#f-max').inputValue(),'9,500,000.50');
   assert.equal(await page.evaluate(()=>leerFiltrosServidor().maximo),9500000.5);
   await page.locator('#f-min').fill('');assert.equal(await page.evaluate(()=>leerFiltrosServidor().minimo),null);
   assert.deepEqual(errores,[]);
  } finally {await page.close();}
 }} finally {await browser.close();}
});
