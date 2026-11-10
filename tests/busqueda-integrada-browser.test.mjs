import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),assets=process.env.KWP_QA_ASSETS_ROOT||root;
function read(p){const own=path.join(root,p);return fs.readFileSync(fs.existsSync(own)?own:path.join(assets,p),'utf8');}
test('el buscador original aplica la frase, filtros, evidencia y limpieza en escritorio y móvil',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const html=read('propiedades.html');
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='kw.local')return route.abort();
   const p=decodeURIComponent(u.pathname).replace(/^\//,'');let file=path.join(root,p);if(!fs.existsSync(file))file=path.join(assets,p);
   if(!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});
   return route.fulfill({body:p==='propiedades.html'?html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''):fs.readFileSync(file),contentType:p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':'application/javascript'});
  });
  await page.goto('http://kw.local/propiedades.html');
  await page.evaluate(()=>{
   window.qaCalls=[];window.qaRPC=[];window.kwSitioAsesor={personalizar:u=>u,leer:()=>null};
   function query(){const q=new Proxy({}, {get(t,k){if(k==='then')return(ok,bad)=>Promise.resolve({data:[],error:null}).then(ok,bad);return()=>q;}});return q;}
   window.kwSupabase={functions:{invoke:async(n,args)=>{qaCalls.push({n,args});return{data:{ok:true,criterios:{tipos:['Departamento'],estados:[],municipios:[],colonias:[],requisitos:['remodelar'],conceptos:[['remodelar','renovar']],dudas:[],precio_max:5000000}},error:null};}},from:query,
    auth:{getUser:async()=>({data:{user:null}})},rpc:(n,args)=>{qaRPC.push({n,args});const data=n==='propiedades_inventario_pagina'?{data:args.p_filtros.cerca_hospital_m?[{id:'qa',titulo:'Departamento de prueba',precio:3000000,moneda:'MXN',operacion:'venta',tipo:'Departamento',imagenes:[],evidencia_busqueda:{tipo:'coordenadas',nombre:'Hospital prueba',distancia_m:400}}]:[],total:args.p_filtros.cerca_hospital_m?1:0}:[];const p=Promise.resolve({data,error:null});p.abortSignal=()=>p;return p;}};
  });
  for(const file of ['assets/js/kw-ui.js','assets/js/kw-busqueda-ia.js','assets/js/kw-buscador-inteligente.js'])await page.addScriptTag({content:read(file)});
  const main=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('var sb = window.kwSupabase'));
  await page.addScriptTag({content:main});await page.addScriptTag({content:read('assets/js/drawer.js')});
  await page.addScriptTag({content:"document.currentScript.dataset.filtros='#filtros';document.currentScript.dataset.titulo='Propiedades';\n"+read('assets/js/kw-lateral.js')});await page.addScriptTag({content:read('assets/js/kw-movil.js')});
  await page.evaluate(()=>{document.documentElement.classList.add('kw-auth-ok');document.getElementById('pantalla-carga')?.remove();kwUI.selects();});
  // Exercise the same input and Enter handler used by people, even when mobile filters are closed.
  await page.evaluate(()=>{document.getElementById('f-buscar').value='Depa cerca de hospital';document.getElementById('f-max').value='4,000,000';document.getElementById('f-buscar').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});
  await page.waitForFunction(()=>qaRPC.some(r=>r.n==='propiedades_inventario_pagina'&&r.args.p_filtros.cerca_hospital_m===1500));
  const f=await page.evaluate(()=>qaRPC.filter(r=>r.n==='propiedades_inventario_pagina').at(-1).args.p_filtros);assert.equal(f.maximo,4000000);assert.deepEqual(f.tipo,['Departamento']);assert.equal(f.texto,'');assert.equal(await page.evaluate(()=>qaCalls.length),0);
  await page.locator('.prop-cercania').waitFor();assert.match(await page.locator('.prop-cercania').innerText(),/400 m en línea recta/);
  assert.equal(await page.locator('[data-kw-busqueda-ia]').count(),0);assert.equal(await page.locator('#f-buscar').count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sin desbordamiento');
  await page.screenshot({path:path.join(os.tmpdir(),`kw-buscador-integrado-${width}.png`)});
  await page.evaluate(()=>{document.getElementById('f-buscar').value='Departamento para remodelar';aplicarFiltros();});
  await page.waitForFunction(()=>qaRPC.some(r=>r.n==='propiedades_inventario_pagina'&&r.args.p_filtros.conceptos?.[0]?.includes('renovar')));
  assert.equal(await page.locator('#f-buscar').inputValue(),'Departamento para remodelar');assert.equal(await page.locator('#f-max').inputValue(),'4,000,000');
  await page.evaluate(()=>limpiarFiltros());await page.waitForFunction(()=>qaRPC.filter(r=>r.n==='propiedades_inventario_pagina').at(-1).args.p_filtros.texto==='');
  assert.equal(await page.locator('#f-buscar').inputValue(),'');assert.equal(await page.locator('#busqueda-interpretacion').isVisible(),false);
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
