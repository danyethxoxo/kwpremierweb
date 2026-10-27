import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const sdk=fs.readFileSync(path.join(root,'tests/contrato-comercial-browser.test.mjs'),'utf8').split('const sdk=`')[1].split('`;')[0];

test('Editar conserva la version elegida, Cancelar no escribe y Guardar crea una sola revision',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  for(const source of [0,2]){
   const ctx=await browser.newContext();
   const rows=[0,2,5].map(revision=>({id:'version-'+revision,user_id:'qa-user',tipo_documento:'contrato_profeco',folio:'PROF-QA-1',revision,estado:'finalizado',nombre_archivo:'Fuente '+revision,datos:{'f-num-clientes':'1',clientes:[{nombre:'Cliente de version '+revision}],'f-agente':'Asesor fuente '+revision}}));
   await ctx.addInitScript(rows=>{if(!sessionStorage.getItem('qaRows'))sessionStorage.setItem('qaRows',JSON.stringify(rows));},rows);
   await ctx.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.pathname.endsWith('/auth-guard.js'))return route.fulfill({body:sdk,contentType:'application/javascript'});
    if(u.hostname!=='kw.local'||u.pathname.endsWith('/kw-session.js'))return route.fulfill({body:''});
    const f=path.join(root,decodeURIComponent(u.pathname));return route.fulfill({status:fs.existsSync(f)?200:404,body:fs.existsSync(f)?fs.readFileSync(f):'',contentType:f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'application/octet-stream'});
   });
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('https://kw.local/documentos/contratos/profeco.html?doc=version-'+source);
   await page.waitForFunction(source=>documentoActualId==='version-'+source,source);
   await page.evaluate(()=>{
    window.qaRevisionCalls=[];
    kwSupabase.rpc=async(name,args)=>{
     qaRevisionCalls.push({name,args});
     if(name!=='guardar_revision_documento')throw Error('RPC inesperado: '+name);
     const original=qaRows.find(row=>row.id===args.p_id),revision=Math.max(...qaRows.map(row=>row.revision))+1;
     const row={...original,id:'nueva-'+revision,datos:args.p_datos,revision,estado:'borrador'};qaRows.push(row);
     return {data:{id:row.id,revision},error:null};
    };
   });
   await page.evaluate(()=>kwRevisiones.realizarCambios());
   assert.deepEqual(await page.evaluate(()=>({revision:revisionActual,id:documentoActualId,filas:qaRows.length,rpc:qaRevisionCalls.length})),{revision:source,id:'version-'+source,filas:3,rpc:0});
   assert.equal(await page.locator('#f-cli0-nombre').inputValue(),'Cliente de version '+source);
   assert.equal(await page.locator('#f-cli0-nombre').isDisabled(),false);
   await page.locator('#f-cli0-nombre').evaluate(el=>{el.value='Cambio cancelado';});
   await page.evaluate(()=>kwRevisiones.cancelarCambios());
   await page.waitForFunction(source=>document.getElementById('f-cli0-nombre').value==='Cliente de version '+source,source);
   assert.equal(await page.evaluate(()=>qaRows.length),3);assert.equal(await page.evaluate(()=>qaRevisionCalls.length),0);
   await page.evaluate(()=>kwRevisiones.realizarCambios());
   await page.locator('#f-cli0-nombre').evaluate(el=>{el.value='Cliente corregido';});
   let guardar=page.evaluate(()=>guardarDocumento());
   await page.locator('#kw-borrador-incompleto .btn-modal-confirmar').click();await guardar;
   assert.deepEqual(await page.evaluate(()=>({revision:revisionActual,id:documentoActualId,filas:qaRows.length,rpc:qaRevisionCalls.length})),{revision:6,id:'nueva-6',filas:4,rpc:1});
   const guardado=await page.evaluate(()=>qaRevisionCalls[0]);assert.equal(guardado.args.p_id,'version-'+source);assert.equal(guardado.args.p_datos['f-agente'],'Asesor fuente '+source);
   assert.deepEqual(await page.evaluate(()=>qaRows.slice(0,3)),rows);
   if(await page.locator('#guardar-exito').isVisible())await page.locator('#guardar-exito .guardar-exito-ok').click();
   guardar=page.evaluate(()=>guardarDocumento());await page.locator('#kw-borrador-incompleto .btn-modal-confirmar').click();await guardar;
   assert.equal(await page.evaluate(()=>qaRevisionCalls.length),1);assert.equal(await page.evaluate(()=>qaRows.length),4);
   assert.deepEqual(errors,[]);await ctx.close();
  }
 }finally{await browser.close();}
});
