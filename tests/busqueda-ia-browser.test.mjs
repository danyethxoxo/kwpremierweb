import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),assets=process.env.KWP_QA_ASSETS_ROOT||root;
function read(p){const own=path.join(root,p);return fs.readFileSync(fs.existsSync(own)?own:path.join(assets,p),'utf8');}
const places=[{estado:'Ciudad de México',municipio:'Benito Juárez',colonia:'Narvarte Poniente'},{estado:'Ciudad de México',municipio:'Benito Juárez',colonia:'Narvarte Oriente'}];
const criteria={operacion:'venta',moneda:'MXN',tipos:['Departamento'],precio_max:4500000,recamaras_min:2,estacionamientos_min:1,estados:['Ciudad de México'],municipios:[],colonias:['Narvarte'],requisitos:['terraza'],dudas:[]};
test('propone y aplica filtros y perfiles sin guardar, con recuperación de cuota y privacidad',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{for(const width of [1366,390])for(const mode of ['comprador']){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const name=mode==='propiedades'?'propiedades.html':'hub/cliente-formulario.html',html=read(name);
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='kw.local')return route.abort();
   const p=decodeURIComponent(u.pathname).replace(/^\//,'');let file=path.join(root,p);if(!fs.existsSync(file))file=path.join(assets,p);
   if(!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});
   const body=p===name?html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''):fs.readFileSync(file);
   return route.fulfill({body,contentType:p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':'application/javascript'});
  });
  await page.goto('http://kw.local/'+name);
  await page.evaluate(({places,criteria})=>{
   window.qaCalls=[];window.qaRPC=[];window.qaWrites=0;
   function query(){const q=new Proxy({}, {get(t,k){if(k==='then')return(ok,bad)=>Promise.resolve({data:[],error:null}).then(ok,bad);if(k==='insert'||k==='update')return()=>{window.qaWrites++;return q;};return()=>q;}});return q;}
   window.kwSupabase={functions:{invoke:async(n,args)=>{window.qaCalls.push({n,args});if(window.qaFail)return{error:{context:Response.json({error:'Se agotó la cuota disponible de IA. Usa los filtros normales.'})}};return{data:{ok:true,criterios:criteria},error:null};}},from:query,
    auth:{getUser:async()=>({data:{user:null}})},rpc:(n,args)=>{window.qaRPC.push({n,args});const result={error:null,data:n==='propiedades_inventario_pagina'?{data:[],total:0}:n==='propiedades_inventario_catalogo'?places:[]};const p=Promise.resolve(result);p.abortSignal=()=>Promise.resolve(result);return p;}};
  },{places,criteria});
  await page.addScriptTag({content:read('assets/js/kw-ui.js')});
  await page.addScriptTag({content:read('assets/js/kw-busqueda-ia.js')});
  if(mode==='propiedades'){
   const main=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('var sb = window.kwSupabase'));
   await page.addScriptTag({content:main});
  }else{
   await page.addScriptTag({content:read('assets/js/comprador-matches.js')});
   await page.addScriptTag({content:read('assets/js/perfil-comprador.js')});
  }
  await page.addScriptTag({content:read('assets/js/drawer.js')});
  if(mode==='propiedades')await page.addScriptTag({content:"document.currentScript.dataset.filtros='#filtros';document.currentScript.dataset.titulo='Propiedades';\n"+read('assets/js/kw-lateral.js')});
  await page.addScriptTag({content:read('assets/js/kw-movil.js')});
  await page.evaluate(()=>{document.documentElement.classList.add('kw-auth-ok');document.getElementById('pantalla-carga')?.remove();window.kwUI.selects();});
  assert.deepEqual(errors,[]);
  const widget=page.locator('[data-kw-busqueda-ia]');await widget.locator('summary').click();
  if(mode==='comprador'){await page.locator('[name=nombre]').fill('Cliente de prueba');await page.locator('[name=correo]').fill('privado@ejemplo.com');}
  await widget.locator('textarea').fill('Busco departamento en Narvarte CDMX hasta 4.5 millones de pesos y 2 recámaras, contacto ana@ejemplo.com');
  assert.equal(await page.evaluate(()=>qaCalls.length),0);
  await widget.locator('.kw-ia-interpretar').click();await widget.locator('.kw-ia-propuesta').waitFor({state:'visible'});
  assert.match(await widget.locator('ul').innerText(),/4,500,000/);
  assert.match(await widget.locator('ul').innerText(),/Narvarte Oriente/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sin desbordamiento horizontal');
  assert.equal(await page.evaluate(()=>qaWrites),0);
  assert.ok(!(await page.evaluate(()=>JSON.stringify(qaCalls))).includes('ana@'));
  if(mode==='comprador'){assert.equal(await page.locator('[name=precio_max]').inputValue(),'');assert.ok(!(await page.evaluate(()=>JSON.stringify(qaCalls))).includes('privado@'));}
  await page.screenshot({path:path.join(os.tmpdir(),`kw-busqueda-ia-${mode}-${width}.png`)});
  await widget.locator('.kw-ia-aplicar').click();
  await page.waitForFunction(()=>!document.querySelector('.kw-ia-propuesta').hidden===false);
  if(mode==='propiedades'){
   assert.equal(await page.locator('#f-max').inputValue(),'4,500,000');assert.equal(await page.locator('#f-moneda').inputValue(),'MXN');
   await page.waitForFunction(()=>qaRPC.some(r=>r.n==='propiedades_inventario_pagina'));
   const f=await page.evaluate(()=>qaRPC.filter(r=>r.n==='propiedades_inventario_pagina').at(-1).args.p_filtros);
   assert.equal(f.maximo,4500000);assert.equal(f.moneda,'MXN');assert.deepEqual(f.colonia,['Narvarte Poniente','Narvarte Oriente']);assert.equal(f.texto,'terraza');
  }else{
   assert.equal(await page.locator('[name=precio_max]').inputValue(),'4,500,000');assert.equal(await page.locator('[name=correo]').inputValue(),'privado@ejemplo.com');assert.equal(await page.locator('[name=tipos][value=Departamento]').isChecked(),true);
   assert.equal(await page.locator('#zonas-colonias .etiqueta').count(),2);assert.equal(await page.evaluate(()=>qaWrites),0);
  }
  await page.evaluate(()=>{window.qaFail=true;});
  await widget.locator('textarea').fill('Busco casa en renta en Ciudad de México');await widget.locator('.kw-ia-interpretar').click();
  await page.waitForFunction(()=>document.querySelector('.kw-ia-mensaje').textContent.includes('cuota'));
  assert.equal(await page.locator(mode==='propiedades'?'#f-max':'[name=precio_max]').inputValue(),'4,500,000');assert.equal(await widget.locator('.kw-ia-propuesta').isVisible(),false);
  if(mode==='propiedades'){
   await page.evaluate(()=>limpiarFiltros());
   assert.equal(await page.locator('#f-moneda').inputValue(),'');assert.equal(await widget.locator('textarea').inputValue(),'');
  }
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
