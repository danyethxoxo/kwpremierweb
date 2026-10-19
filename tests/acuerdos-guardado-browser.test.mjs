import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const sdk=`window.rows=[];window.fail=false;window.calls=0;
window.kwSupabase={auth:{getUser:async()=>({data:{user:{id:'qa'}}})},
from(table){let action='select',payload,filters=[],single=false;const q=new Proxy({}, {get(_,key){
if(key==='then')return (resolve,reject)=>Promise.resolve().then(()=>{
if(table!=='documentos_guardados')return {data:single?{}:[]};
if(action==='insert'){const row={id:'doc-'+(rows.length+1),estado:'borrador',revision:0,updated_at:new Date().toISOString(),...payload};rows.push(row);return {data:row};}
const found=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
if(action==='update')found.forEach(r=>Object.assign(r,payload));
return {data:single?found[0]:found.map(r=>({...r}))};}).then(resolve,reject);
return (...args)=>{if(key==='insert'||key==='update'){action=key;payload=args[0];}if(key==='eq')filters.push(args);if(key==='single')single=true;return q;};}});return q;},
rpc:async(name,args)=>{window.calls++;await new Promise(r=>setTimeout(r,250));if(window.fail)return {error:{message:'Falla simulada'}};
const row=rows.find(r=>r.id===args.p_id);
if(name==='guardar_revision_documento'){const revision={...row,id:'rev-'+rows.length,datos:args.p_datos,revision:row.revision+1,estado:'borrador'};rows.push(revision);return {data:{id:revision.id,revision:revision.revision}};}
row.estado='finalizado';row.folio=row.folio||'QA-001';return {data:row.folio};}};
window.kwSession={usuarioInicial:()=>kwSupabase.auth.getUser(),usuario:()=>kwSupabase.auth.getUser()};
document.documentElement.classList.add('kw-auth-ok');`;

test('acuerdos: guardar, animación, reintento sin duplicados, revisión y formulario móvil',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/auth-guard.js'))return route.fulfill({contentType:'application/javascript',body:sdk});
   if(url.pathname.endsWith('/kw-session.js'))return route.fulfill({body:''});
   if(url.hostname!=='kw.local')return route.abort();
   const file=path.join(root,decodeURIComponent(url.pathname));
   return route.fulfill({status:fs.existsSync(file)?200:404,body:fs.existsSync(file)?fs.readFileSync(file):'',contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
  });
  for(const name of ['aceptacionoferta','acuerdoreferido','avisodeprivacidad','cartaterminacion','cedularegistro','checklist','colaboracion','contrapropuesta','referido']){
   await page.goto('https://kw.local/documentos/acuerdos/'+name+'.html?nuevo=1');
   await page.locator('#btn-guardar').waitFor({state:'visible'});
   assert.equal((await page.locator('#btn-guardar').innerText()).trim(),'Guardar',name);
   assert.equal(await page.locator('#btn-finalizar').isVisible(),false,name);
  }
  await page.goto('https://kw.local/documentos/acuerdos/acuerdoreferido.html?nuevo=1');
  await page.locator('#btn-guardar').waitFor({state:'visible'});
  const input=page.locator('.referido-form-grid input').first();await input.fill('Asesor QA');await input.focus();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.referido-form-grid input')).boxShadow==='none');
  assert.deepEqual(await input.evaluate(el=>{const s=getComputedStyle(el);return [s.height,s.boxShadow,s.outlineStyle];}),['43px','none','none']);
  assert.deepEqual(await page.locator('.r-seccion').first().evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.textAlign];}),['rgb(255, 255, 255)','center']);
  await page.evaluate(()=>window.fail=true);
  await page.locator('#btn-guardar').click();await page.locator('#modal-nombre-input').fill('Acuerdo QA');
  await page.locator('#modal-nombre .btn-modal-confirmar').click();
  await page.locator('.kw-cargando-pantalla').waitFor({state:'visible'});
  assert.equal(await page.locator('#btn-guardar').isDisabled(),true);
  await page.locator('.kw-cargando-pantalla').waitFor({state:'hidden'});
  await page.locator('.modal-overlay:has(.kw-aviso-msg) .btn-modal-confirmar').click();
  assert.equal(await page.evaluate(()=>rows.length),1);
  await page.evaluate(()=>{window.fail=false;guardarDocumento();guardarDocumento();});
  await page.locator('#guardar-exito').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>rows.length),1);
  assert.equal(await page.evaluate(()=>calls),2);
  await page.locator('#guardar-exito .guardar-exito-ok').click();
  for(const id of ['btn-copia','btn-firma-digital','btn-pdf'])assert.equal(await page.locator('#'+id).isVisible(),true,id);
  assert.equal(await page.locator('#btn-guardar').isVisible(),false);
  await page.evaluate(()=>{window.pdfSections=null;window.kwPDFVector.descargar=async doc=>{
    window.pdfSections=Array.from(doc.querySelectorAll('.r-seccion'),el=>{
      const s=doc.defaultView.getComputedStyle(el);return [s.backgroundColor,s.textAlign];
    });
  };downloadPDF();});
  await page.waitForFunction(()=>window.pdfSections!==null);
  assert.ok((await page.evaluate(()=>window.pdfSections)).every(s=>s[0]==='rgb(255, 255, 255)'&&s[1]==='center'));
  await page.evaluate(()=>kwRevisiones.realizarCambios());
  await page.locator('#btn-guardar').waitFor({state:'visible'});
  await input.fill('Asesor corregido');await page.locator('#btn-guardar').click();
  await page.locator('#guardar-exito').waitFor({state:'visible'});
  const rows=await page.evaluate(()=>window.rows);
  assert.equal(rows.length,2);assert.equal(rows[0].estado,'finalizado');assert.equal(rows[1].estado,'finalizado');assert.equal(rows[1].revision,1);
  assert.notDeepEqual(rows[0].datos,rows[1].datos);assert.equal(rows[0].folio,rows[1].folio);
  await page.locator('#guardar-exito .guardar-exito-ok').click();
  if(process.env.QA_ACUERDOS_SCREENSHOT)await page.screenshot({path:process.env.QA_ACUERDOS_SCREENSHOT,animations:'disabled'});
  await page.evaluate(()=>{
    window.rows.push({id:'legacy',estado:'borrador',revision:0,nombre_archivo:'Acuerdo anterior',tipo_documento:'acuerdo_referido',user_id:'qa',updated_at:new Date().toISOString()});
    mostrarVista('lista',false);return cargarListaDocumentos();
  });
  assert.equal(await page.locator('#columna-finalizados').isVisible(),false);
  assert.equal(await page.locator('#lista-tabs-mobile').isVisible(),false);
  assert.equal(await page.locator('#lista-borradores .lista-item-original').count(),2);
  assert.ok((await page.locator('#lista-borradores').innerText()).includes('Acuerdo anterior'));
  await page.setViewportSize({width:390,height:844});
  await page.goto('https://kw.local/documentos/acuerdos/acuerdoreferido.html?nuevo=1');
  await page.locator('#btn-guardar').waitFor({state:'visible'});
  assert.ok(await input.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
});
