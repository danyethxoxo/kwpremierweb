import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const sdk=fs.readFileSync(path.join(root,'tests/contrato-comercial-browser.test.mjs'),'utf8').split('const sdk=`')[1].split('`;')[0];
test('PROFECO preserves paragraphs, separates annexes and groups signatures for one to nine clients',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.pathname.endsWith('/auth-guard.js'))return route.fulfill({body:sdk,contentType:'application/javascript'});
   if(u.hostname!=='kw.local'||u.pathname.endsWith('/kw-session.js'))return route.fulfill({body:''});
   const f=path.join(root,decodeURIComponent(u.pathname));return route.fulfill({status:fs.existsSync(f)?200:404,body:fs.existsSync(f)?fs.readFileSync(f):'',contentType:f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.css')?'text/css':f.endsWith('.js')?'application/javascript':'application/octet-stream'});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://kw.local/documentos/contratos/profeco.html?nuevo=1');await page.waitForSelector('#contrato-preview .kw-contrato-hoja');
  const out=path.join(root,'artifacts/profeco-distribucion');fs.mkdirSync(out,{recursive:true});
  for(const count of [1,2,3,4,6,7,9]){
   const stats=await page.evaluate(count=>{
    document.getElementById('f-num-clientes').value=String(count);renderClientesFields();for(let i=0;i<count;i++)document.getElementById('f-cli'+i+'-nombre').value='CLIENTE DE PRUEBA '+(i+1);updatePreview();kwContratoDocumento.render(configuracionDocumento());
    return [...document.querySelectorAll('#contrato-preview .kw-contrato-hoja')].map(p=>{
     const r=p.getBoundingClientRect(),scale=r.width/816,body=p.querySelector('.kw-contrato-cuerpo');
     return {pageNumber:p.querySelector('.kw-contrato-pie').lastChild.textContent,sections:[...new Set([...body.querySelectorAll('[data-profeco-seccion]:not(.doc-salto)')].map(e=>e.dataset.profecoSeccion))],signatures:[...body.querySelectorAll('[data-profeco-firmas]')].map(e=>({type:e.dataset.profecoFirmas,count:e.querySelectorAll('.doc-firma-col').length,only:body.children.length===1})),paragraphs:[...body.querySelectorAll('[data-kw-parrafo]')].map(e=>e.dataset.kwParrafo),bottom:(body.getBoundingClientRect().bottom-r.top)/scale,text:body.textContent.trim().slice(0,65)};
    });
   },count);

   assert.ok(stats.every(p=>p.bottom<=990.5),'no text or signatures clipped');
   const firmaContrato=stats.flatMap(p=>p.signatures).find(s=>s.type==='contrato');assert.equal(firmaContrato.count,count+3);assert.equal(firmaContrato.only,count+3>6);
   for(const section of ['a1','a2','b1','b2'])assert.ok(stats.some(p=>p.sections.includes(section)),section+' remains present');
   for(const prefix of ['contrato','a','b','c']){
    const group=stats.filter(p=>p.sections.some(s=>prefix==='contrato'?s===prefix:s!=='contrato'&&s.startsWith(prefix)));
    assert.deepEqual(group.map(p=>p.pageNumber),group.map((_,i)=>'Página '+(i+1)+' de '+group.length),'independent numbering including signature sheets: '+prefix);
   }
   if(count<=6)for(const prefix of ['a','b'])assert.deepEqual(stats.filter(p=>p.sections.some(s=>s.startsWith(prefix))).map(p=>p.pageNumber),['Página 1 de 2','Página 2 de 2']);
   const a2=stats.find(p=>p.sections.includes('a2'));assert.ok(a2.text.startsWith('FINALIDAD.'));
   for(const prefix of ['a','b'])assert.equal(stats.flatMap(p=>p.signatures).find(s=>s.type===prefix).count,count);
   const c=stats.filter(p=>p.sections.includes('c'));assert.equal(c.length,count+3>6?2:1);assert.equal(c.flatMap(p=>p.signatures).find(s=>s.type==='c').count,count+3);
   if(count+3>6)assert.ok(c.at(-1).signatures[0].only);
   const paras=stats.flatMap(p=>p.paragraphs);assert.equal(paras.length,new Set(paras).size,'paragraphs and list items remain whole');
   if(count===1){
    const source=await page.evaluate(()=>({head:[...document.head.querySelectorAll('style,link[rel="stylesheet"]')].map(e=>e.outerHTML).join(''),pages:[...document.querySelectorAll('#contrato-preview .kw-contrato-hoja')].map(p=>p.outerHTML)}));
    const preview=await context.newPage();await preview.setViewportSize({width:816,height:1056});
    for(const [i,html] of source.pages.entries()){
     await preview.setContent('<html class="kw-auth-ok"><head><base href="https://kw.local/">'+source.head+'<style>html,body{margin:0!important;padding:0!important;display:block!important;width:816px!important;height:1056px!important;overflow:hidden!important}.page.kw-contrato-hoja{transform:none!important}</style></head><body>'+html+'</body></html>');
     await preview.screenshot({path:path.join(out,'hoja-'+(i+1)+'.png')});
    }await preview.close();
   }
  }
  await page.evaluate(()=>{window.qaPreview=[...document.querySelectorAll('#contrato-preview .kw-contrato-hoja')].map(p=>p.textContent);window.kwPDFVector={crear:async doc=>{window.qaPdf=[...doc.querySelectorAll('.print-page')].map(p=>p.textContent);return {save(){}};}};});
  await page.evaluate(()=>kwContratoDocumento.exportar(configuracionDocumento()));assert.deepEqual(await page.evaluate(()=>qaPdf),await page.evaluate(()=>qaPreview));
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>showMobileTab('preview'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
