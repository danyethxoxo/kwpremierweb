import http from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const root=process.cwd();
const server=http.createServer((req,res)=>{const file=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base=process.env.KWP_QA_ORIGIN || `http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
mkdirSync('outputs/comprador',{recursive:true});
const fixture={id:'11111111-1111-4111-8111-111111111111',nombre:'Cliente prueba',telefono:'5555555555',correo:'',operacion:'venta',moneda:'MXN',tipos:['Casa'],precio_max:7000000,estado:'Ciudad de México',municipio:'Benito Juárez',colonias:'',municipios:['Benito Juárez','Coyoacán'],colonias_seleccionadas:[{estado:'Ciudad de México',municipio:'Benito Juárez',colonia:'Del Valle Centro'},{estado:'Ciudad de México',municipio:'Coyoacán',colonia:'Del Carmen'}],umbral_match:80,activo:true,avisos_correo:true};
const mock=`
document.documentElement.classList.add('kw-auth-ok');
window.qaPerfil=${JSON.stringify(fixture)};
window.qaPendiente=new URLSearchParams(location.search).has('pendiente');
window.kwSupabase={
 channel(){return {on(){return this},subscribe(){return this}}},removeChannel(){},
 functions:{invoke:async()=>({data:{ok:true}})},
 auth:{getUser:async()=>({data:{user:{id:'qa'}}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 rpc(name,args){
  if(name==='propiedades_inventario_catalogo')return Promise.resolve({data:[{estado:'Ciudad de México',municipio:'Benito Juárez',colonia:'Del Valle Centro'},{estado:'Ciudad de México',municipio:'Coyoacán',colonia:'Del Carmen'},{estado:'Ciudad de México',municipio:'Cuauhtémoc',colonia:'Roma Norte'}]});
  const data=name==='comprador_matches_pagina'?Array.from({length:Math.max(0,Math.min(4,(args.p_nivel===80?12:1)-args.p_offset))},(_,i)=>({porcentaje:args.p_nivel===80?100:79,criterios:[],propiedad:{distancia_km:args.p_nivel===-4?0.6:null,id:'propiedad-'+(args.p_offset+i),titulo:'Casa de prueba '+(args.p_offset+i),estatus:'publicada',tipo:'Casa',operacion:'venta',precio:6500000,moneda:'MXN',colonia:'Del Valle Centro',municipio:'Benito Juárez',estado:'Ciudad de México',recamaras:3,banos:2,imagenes:[]}})):[];
  return {abortSignal:async()=>({data})};
 },
 from(table){let payload;const data=()=>table==='profiles'?{role:'master',nombre:'QA',sitio_web:''}:table==='perfiles_comprador'?[window.qaPerfil]:table==='comprador_estados'?[{perfil_id:window.qaPerfil.id,total:16,niveles:{'-4':1,80:12,'-1':1,'-2':1,'-3':1},pendiente:window.qaPendiente,calculado_at:window.qaPendiente?null:'2026-10-14',motivo:'perfil'}]:[];
 const q=new Proxy({}, {get(t,k){if(k==='then')return(ok,bad)=>Promise.resolve({data:payload?{...window.qaPerfil,...payload}:data(),error:null}).then(ok,bad);if(k==='insert'||k==='update')return p=>{payload=p;window.qaRegistrar(p);return q};if(k==='single')return async()=>({data:table==='profiles'?data():payload?{...window.qaPerfil,...payload}:window.qaPerfil,error:null});return()=>q}});return q;}
};`;
const results=[];
try {
 for(const width of [1920,1440,390]) {
  const context=await browser.newContext({viewport:{width,height:1000}});
  const guardados=[];await context.exposeFunction('qaRegistrar',p=>guardados.push(p));
  await context.route('https://**/*',r=>new URL(r.request().url()).origin===new URL(base).origin ? r.continue() : r.abort());
  await context.route('**/auth-guard.js*',r=>r.fulfill({contentType:'application/javascript',body:mock}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.message);});page.setDefaultTimeout(12000);
  await page.goto(base+'/hub/cliente-formulario.html',{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('select[name=estado]').options.length>1);
  await page.fill('[name=nombre]','Nuevo comprador');await page.fill('[name=telefono]','5555555555');await page.fill('[name=precio_max]','7000000');await page.check('[name=tipos][value=Casa]');
  // Usar los controles visibles, incluida su búsqueda, para agregar y quitar zonas.
  async function elegir(campo,texto) {
   const caja=page.locator('select[name='+campo+']').locator('..');
   await caja.locator('.catalogo-buscar').click();
   await caja.locator('.kw-select-opcion:visible').filter({hasText:texto}).first().click();
  }
  await elegir('estado','Ciudad de México');
  await elegir('municipio','Benito Juárez');await elegir('municipio','Coyoacán');
  await elegir('colonias','Del Valle Centro');await elegir('colonias','Del Carmen');
  assert.equal(await page.locator('#zonas-municipio .etiqueta').count(),2);
  assert.equal(await page.locator('#zonas-colonias .etiqueta').count(),2);
  await page.screenshot({path:`outputs/comprador/formulario-${width}.png`,fullPage:true});
  await page.click('#guardar');await page.waitForURL('**/hub/perfil-comprador.html');
  assert.deepEqual(guardados[0].municipios,['Benito Juárez','Coyoacán']);
  assert.equal(guardados[0].colonias_seleccionadas.length,2);
  assert.equal(guardados[0].umbral_match,80);
  for(const campo of ['recamaras_min','banos_min','estacionamientos_min','superficie_min']) assert.equal(guardados[0][campo],null);
  await page.locator('.btn-coincidencias').click();await page.locator('.match-prop').first().waitFor();
  const capacidad=await page.locator('.matches-grid').evaluate(el=>Number(el.style.getPropertyValue('--match-columnas')));
  assert.equal(await page.locator('.match-prop').count(),capacidad);
  if(width===1920)assert(capacidad>4);
  const hueco=await page.locator('.matches-grid').evaluate(el=>el.getBoundingClientRect().right-el.lastElementChild.getBoundingClientRect().right);
  assert(Math.abs(hueco)<2,'las tarjetas llenan el ancho');
  for(const boton of await page.locator('.match-carrusel > button').all()) {
   const b=await boton.boundingBox(),svg=await boton.locator('svg').boundingBox();
   assert(Math.abs(b.x+b.width/2-svg.x-svg.width/2)<1);assert(Math.abs(b.y+b.height/2-svg.y-svg.height/2)<1);
   assert(b.x>=0&&b.x+b.width<=width);
  }
  await page.screenshot({path:`outputs/comprador/tarjetas-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Más propiedades',exact:true}).click();
  await page.waitForFunction(n=>document.querySelector('.match-paginacion p').textContent.startsWith((n+1)+' a '),capacidad);
  assert.match(await page.locator('.match-titulo').first().innerText(),new RegExp(' '+capacidad+'$'));
  await page.getByRole('button',{name:'Propiedades anteriores',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.match-paginacion p').textContent.startsWith('1 a '));
  assert.match(await page.locator('.match-niveles button').nth(1).innerText(),/Misma zona y presupuesto/);
  assert.match(await page.locator('.match-niveles button').nth(3).innerText(),/Zonas cercanas/);
  assert.match(await page.locator('.match-niveles button').nth(4).innerText(),/Similares en otras zonas/);
  assert.match(await page.locator('.match-score').first().innerText(),/100% compatible/);
  await page.getByRole('button',{name:'Similares en otras zonas'}).click();await page.locator('.match-prop').first().waitFor();
  assert.equal(await page.locator('.match-score').innerText(),'Alternativa');
  await page.getByRole('button',{name:/Zonas cercanas/}).click();await page.locator('.match-prop').waitFor();
  assert.match(await page.locator('.match-body').innerText(),/0.6 km/);
  assert.equal(await page.locator('.catalogo-estado').count(),0);
  assert.equal(await page.locator('#notif-bell-slot').count(),1);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow horizontal');
  await page.screenshot({path:`outputs/comprador/coincidencias-${width}.png`,fullPage:true});
  await page.goto(base+'/hub/cliente-formulario.html?id='+fixture.id);await page.waitForFunction(()=>document.querySelector('#guardar').textContent==='Guardar cambios');
  assert.equal(await page.locator('#zonas-municipio .etiqueta').count(),2);
  assert.equal(await page.locator('#zonas-colonias .etiqueta').count(),2);
  await page.getByRole('button',{name:'Quitar Coyoacán',exact:true}).click();
  assert.equal(await page.locator('#zonas-colonias .etiqueta').count(),1);
  await page.goto(base+'/hub/perfil-comprador.html?pendiente=1');
  await page.locator('.btn-coincidencias .kw-loader').waitFor();
  assert.equal(await page.locator('.kw-loader').count(),1);
  assert.equal(await page.locator('.catalogo-estado').count(),0);
  assert.deepEqual(errors,[]);results.push({width,ok:true});await context.close();
 }
 writeFileSync('outputs/comprador/qa.json',JSON.stringify(results,null,2));console.log(results);
} finally {await browser.close();server.close();}
