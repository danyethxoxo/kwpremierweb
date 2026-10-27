import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const sdk=fs.readFileSync(path.join(root,'tests/contrato-comercial-browser.test.mjs'),'utf8').split('const sdk=`')[1].split('`;')[0];
const out=path.join(root,'artifacts/nueve-clientes');fs.mkdirSync(out,{recursive:true});
test('PROFECO y Comercial guardan, reabren y exportan los nueve clientes sin omisiones',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  for(const tipo of ['profeco','comercial']){
   const ctx=await browser.newContext({viewport:{width:1440,height:1100}});
   await ctx.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.pathname.endsWith('/auth-guard.js'))return route.fulfill({body:sdk,contentType:'application/javascript'});
    if(u.hostname!=='kw.local'||u.pathname.endsWith('/kw-session.js'))return route.fulfill({body:''});
    const f=path.join(root,decodeURIComponent(u.pathname));return route.fulfill({status:fs.existsSync(f)?200:404,body:fs.existsSync(f)?fs.readFileSync(f):'',contentType:f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'application/octet-stream'});
   });
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const url='https://kw.local/documentos/contratos/'+tipo+'.html';
   await page.goto(url+'?nuevo=1');await page.waitForSelector('.kw-contrato-hoja');
   const selector=tipo==='profeco'?'f-num-clientes':'com-num-clientes';
   assert.equal(await page.locator('#'+selector+' option[value="9"]').count(),1);
   await page.locator('#'+selector).selectOption('9',{force:true});
   const nombres=Array.from({length:9},(_,i)=>'Cliente Nueve QA '+(i+1));
   await page.evaluate(({tipo,nombres})=>{
    for(let i=0;i<9;i++){
     const id=tipo==='profeco'?'f-cli'+i+'-nombre':'com-cliente'+(i?'_'+(i+1):'');
     const el=document.getElementById(id);el.value=nombres[i];el.dispatchEvent(new Event('input',{bubbles:true}));
    }
    kwContratosUX.confirmar=async()=>true;kwDocumentosShell.pedirNombre=async()=> 'Nueve clientes QA';
    if(tipo==='profeco')updatePreview();
   },{tipo,nombres});
   if(tipo==='profeco')await page.evaluate(()=>guardarComoNuevo('Nueve clientes QA'));
   else await page.locator('#comercial-guardar').click();
   await page.waitForFunction(()=>qaRows.length===1);
   const row=await page.evaluate(()=>qaRows[0]);
   assert.equal(row.datos.clientes.length,9);
   assert.deepEqual(row.datos.clientes.map(c=>tipo==='profeco'?c.nombre:c.cliente),nombres);
   await page.goto(url+'?doc='+row.id);await page.waitForSelector('.kw-contrato-hoja');
   await page.waitForFunction(({selector})=>document.getElementById(selector)?.value==='9',{selector});
   for(let i=0;i<9;i++)assert.equal(await page.locator('#'+(tipo==='profeco'?'f-cli'+i+'-nombre':'com-cliente'+(i?'_'+(i+1):''))).inputValue(),nombres[i]);
   await page.waitForTimeout(200);
   const geometry=await page.locator('.kw-contrato-hoja:not(.kw-miniatura-hoja)').evaluateAll(hojas=>hojas.map(h=>{const r=h.getBoundingClientRect(),b=h.querySelector('.kw-contrato-cuerpo');return {bottom:(b.getBoundingClientRect().bottom-r.top)/(r.width/816),firmas:b.querySelectorAll('.doc-firma-col,.comercial-firma').length,only:b.children.length===1};}));
   assert.ok(geometry.every(g=>g.bottom<=991),tipo+' '+JSON.stringify(geometry));
   if(tipo==='comercial')assert.ok(geometry.some(g=>g.firmas===12&&g.only),'Las doce firmas permanecen juntas');
   const texto=await page.locator(tipo==='profeco'?'#contrato-preview':'#comercial-paginas').textContent();
   for(const nombre of nombres)assert.ok(texto.includes(nombre),tipo+' '+nombre);
   if(tipo==='comercial'){
    const download=page.waitForEvent('download');await page.evaluate(()=>document.getElementById('comercial-descargar').onclick());await(await download).saveAs(path.join(out,'comercial-9-clientes.pdf'));
   }
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(out,tipo+'-'+width+'.png')});
   }
   assert.deepEqual(errors,[]);await ctx.close();
  }
 }finally{await browser.close();}
});
