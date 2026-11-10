import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';import {fileURLToPath} from 'node:url';import {chromium} from 'playwright';import {gridPremier,gridCentro} from './dashboard-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),assets=process.env.KWP_QA_ASSETS_ROOT||root;
function read(p){return fs.readFileSync(fs.existsSync(path.join(root,p))?path.join(root,p):path.join(assets,p),'utf8');}
const s=vm.createContext({});vm.runInContext(stripTypeScriptTypes(read('supabase/functions/dashboard-tracker/core.ts').replace(/export /g,'')),s);
const fixture=JSON.parse(JSON.stringify({ok:true,actualizado:'2026-11-10T20:00:00Z',periodo:'TRACKER DE PRUEBA',intervalo:60,advertencias:['Periodo de comparativa no indicado.'],lore:s.leerLore(gridPremier()),centros:[s.leerCentro(gridPremier(),'KW Premier'),...['KW City','KW Pedregal','KW Enlace','KW Mas','KW Pani-Barragán'].map((t,i)=>s.leerCentro(gridCentro(i),t))]}));
test('Dashboard con menú real: filtros, gráficas negativas, refresco y recuperación en escritorio y móvil',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{for(const width of [1440,1366,390,320]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const html=read('hub/dashboard.html');
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='kw.local')return route.abort();const p=decodeURIComponent(u.pathname).replace(/^\//,'');let file=path.join(root,p);if(!fs.existsSync(file))file=path.join(assets,p);if(!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:p==='hub/dashboard.html'?html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''):fs.readFileSync(file),contentType:p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':p.endsWith('.png')?'image/png':'application/javascript'});});
  await page.goto('http://kw.local/hub/dashboard.html');
  await page.evaluate(fixture=>{
   window.qaCalls=0;window.qaFail=false;window.qaFixture=fixture;
   const profile={nombre:'Usuario',apellido:'de prueba',role:'admin'};const user=async()=>({data:{user:{id:'qa'}}});window.kwSession={usuarioInicial:user,usuario:user,perfilInicial:async()=>({data:profile})};
   function query(){const q=new Proxy({}, {get(t,k){if(k==='then')return(ok,bad)=>Promise.resolve({data:[],error:null}).then(ok,bad);if(k==='single'||k==='maybeSingle')return async()=>({data:profile,error:null});return()=>q;}});return q;}
   window.kwSupabase={auth:{getUser:user},from:query,functions:{invoke:async()=>{qaCalls++;if(qaFail)return{error:{context:Response.json({error:'No pudimos actualizar Google Sheets.'})}};return{data:qaFixture,error:null};}}};
  },fixture);
  for(const p of ['assets/js/kw-security.js','assets/js/kw-ui.js','assets/js/drawer.js','assets/js/kw-lateral.js','assets/js/kw-pagina-universal.js','assets/js/dashboard.js','assets/js/kw-movil.js'])await page.addScriptTag({content:read(p)});
  await page.evaluate(()=>{document.documentElement.classList.add('kw-auth-ok');window.dispatchEvent(new Event('kw-auth-ready'));kwUI.selects();});
  await page.locator('#dashboard-datos').waitFor();
  assert.equal(await page.locator('#notif-bell-slot').count(),1);assert.equal(await page.locator('#lore-kpis [data-lore]').count(),5);assert.match(await page.locator('#lore-kpis [data-lore=lados]').innerText(),/30/);assert.equal(await page.locator('#ranking-barras .dash-rank-row').count(),6);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sin scroll horizontal exterior a '+width);
  await page.locator('#operacion-lore').selectOption('venta',{force:true});assert.match(await page.locator('#lore-kpis [data-lore=lados]').innerText(),/12/);
  await page.locator('#lore-kpis [data-lore=exclusivas]').click();assert.equal(await page.locator('#distribucion-titulo').innerText(),'Exclusivas');assert.equal(await page.locator('#donut-total').innerText(),'8');
  await page.locator('#metrica-comparativa').selectOption('netos',{force:true});assert.ok(await page.locator('.dash-rank-axis').count()>0);assert.match(await page.locator('#comparativa-destacado').innerText(),/-2/);
  await page.locator('#metrica-comparativa').selectOption('asociados',{force:true});await page.locator('#operacion-lore').selectOption('todas',{force:true});
  await page.evaluate(()=>{document.querySelector('[data-lore=lados]').click();});
  await page.evaluate(()=>{document.getElementById('dashboard-contenido').scrollTop=0;window.scrollTo(0,0);});
  await page.screenshot({path:path.join(os.tmpdir(),`kw-dashboard-${width}.png`),fullPage:width<1024});
  await page.evaluate(()=>{const i=document.querySelector('#centros-filtros input[value="KW City"]');i.checked=false;i.dispatchEvent(new Event('change'));});assert.equal(await page.locator('#ranking-barras .dash-rank-row').count(),5);
  assert.equal(await page.evaluate(()=>qaCalls),1,'los filtros no descargan otra vez');
  await page.evaluate(()=>{qaFail=true;return kwDashboard.actualizar();});assert.match(await page.locator('#dashboard-error').innerText(),/Conservamos la última lectura/);assert.equal(await page.locator('#dashboard-datos').isVisible(),true);
  await page.evaluate(()=>{qaFail=false;return kwDashboard.actualizar();});assert.equal(await page.locator('#dashboard-error').isVisible(),false);assert.equal(await page.locator('#ranking-barras .dash-rank-row').count(),5);
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
