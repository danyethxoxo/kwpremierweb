import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const sdk=fs.readFileSync(path.join(root,'tests/contrato-comercial-browser.test.mjs'),'utf8').split('const sdk=`')[1].split('`;')[0];
test('Comercial searches all states, keeps paragraphs whole and exports signatures on a final separate sheet',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/auth-guard.js'))return route.fulfill({contentType:'application/javascript',body:sdk});
   if(url.pathname.endsWith('/kw-session.js')||url.hostname==='cdn.jsdelivr.net')return route.fulfill({body:''});
   if(url.hostname!=='kw.local')return route.abort();
   const file=path.join(root,decodeURIComponent(url.pathname));
   return route.fulfill({status:fs.existsSync(file)?200:404,body:fs.existsSync(file)?fs.readFileSync(file):'',contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://kw.local/documentos/contratos/comercial.html?nuevo=1');await page.waitForSelector('.kw-contrato-hoja');
  assert.equal(await page.locator('#com-lugar_firma').inputValue(),'Ciudad de M\u00e9xico');assert.equal(await page.locator('#com-lugar_firma option').count(),33);
  const artifactDir=path.join(root,'artifacts/comercial-distribucion');fs.mkdirSync(artifactDir,{recursive:true});
  const search=page.getByRole('combobox',{name:'Lugar de firma'});await search.fill('yuca');
  await page.waitForTimeout(200);
  await page.screenshot({path:path.join(artifactDir,'selector-estados.png')});
  assert.deepEqual(await page.locator('#com-lugar_firma-opciones .kw-select-opcion:visible').allTextContents(),['Yucat\u00e1n']);
  await search.press('ArrowDown');await search.press('Enter');assert.equal(await page.locator('#com-lugar_firma').inputValue(),'Yucat\u00e1n');
  await search.fill('sin coincidencia');await search.press('Escape');assert.equal(await search.inputValue(),'');assert.equal(await page.locator('#com-lugar_firma').inputValue(),'Yucat\u00e1n');
  await page.evaluate(()=>{const original=kwContratoDocumento.render;kwContratoDocumento.render=config=>{window.qaComercialConfig=config;return original(config);};document.getElementById('com-asesor').dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>window.qaComercialConfig);
  for(const count of [1,3,6]){
   await page.locator('#com-num-clientes').selectOption(String(count),{force:true});
   const stats=await page.evaluate(count=>{
    for(let i=0;i<count;i++){
     const suffix=i?'_'+(i+1):'';
     document.getElementById('com-cliente'+suffix).value='CLIENTE DE PRUEBA NOMBRE COMPLETO '+(i+1);
     document.getElementById('com-domicilio_cliente'+suffix).value='AVENIDA PRINCIPAL NUMERO 1234, DEPARTAMENTO 301, COLONIA DEL VALLE, ALCALDIA BENITO JUAREZ, CIUDAD DE MEXICO, C.P. 03100';
    }
    kwContratoDocumento.render(qaComercialConfig);
    return [...document.querySelectorAll('.page.kw-contrato-hoja')].map(p=>{const r=p.getBoundingClientRect(),scale=r.width/816,body=p.querySelector('.kw-contrato-cuerpo');return {signatures:p.querySelectorAll('.comercial-firma').length,onlySignatures:body.children.length===1&&body.firstElementChild.matches('[data-kw-firmas]'),points:[...p.querySelectorAll('[data-kw-punto]')].map(c=>({id:c.dataset.kwPunto,grouped:!!c.closest('.comercial-clausula')})),paragraphs:[...p.querySelectorAll('[data-kw-parrafo]')].map(c=>c.dataset.kwParrafo),bottom:(body.getBoundingClientRect().bottom-r.top)/scale};});
   },count);
   assert.ok(stats.every(p=>p.bottom<=990.1),'no clipped clauses or signatures');
   assert.equal(stats.at(-1).signatures,count+3);assert.equal(stats.at(-1).onlySignatures,true);assert.ok(stats.slice(0,-1).every(p=>p.signatures===0));
   const points=stats.flatMap(p=>p.points);assert.equal(points.length,10);assert.equal(new Set(points.map(p=>p.id)).size,10);assert.ok(points.every(p=>!p.grouped),'service and obligation points paginate independently');
   const paragraphs=stats.flatMap(p=>p.paragraphs);assert.ok(paragraphs.length>=20);assert.equal(new Set(paragraphs).size,paragraphs.length,'a paragraph that fits a page is never split');
  }
  await page.evaluate(()=>{const original=kwPDFVector.crear;kwPDFVector.crear=async(doc,options)=>{window.qaPdfText=[...doc.querySelectorAll('.print-page')].map(p=>p.textContent);return original(doc,options);};window.qaPreviewText=[...document.querySelectorAll('.page.kw-contrato-hoja')].map(p=>p.textContent);});
  const downloadEvent=page.waitForEvent('download');await page.evaluate(()=>kwContratoDocumento.exportar(qaComercialConfig,{nombre:'Comercial QA'}));const download=await downloadEvent;
  const out=path.join(root,'artifacts/comercial-distribucion');fs.mkdirSync(out,{recursive:true});await download.saveAs(path.join(out,'comercial-seis-clientes.pdf'));
  const texts=await page.evaluate(()=>({pdf:qaPdfText,preview:qaPreviewText}));assert.deepEqual(texts.pdf,texts.preview);
  assert.equal((fs.readFileSync(path.join(out,'comercial-seis-clientes.pdf'),'latin1').match(/\/Type \/Page\b/g)||[]).length,texts.preview.length);
  const sheets=await page.evaluate(()=>({head:[...document.head.querySelectorAll('style,link[rel="stylesheet"]')].map(el=>el.outerHTML).join(''),sheets:[...document.querySelectorAll('.page.kw-contrato-hoja')].map(p=>{const clone=p.cloneNode(true);clone.style.transform='none';return clone.outerHTML;})}));
  const imagePage=await context.newPage();await imagePage.setViewportSize({width:816,height:1056});
  for(const [nombre,html] of [['primera-hoja',sheets.sheets[0]],['hoja-firmas',sheets.sheets.at(-1)]]){
   await imagePage.setContent('<html class="kw-auth-ok"><head><base href="https://kw.local/">'+sheets.head+'<style>html,body{margin:0!important;padding:0!important;display:block!important;width:816px!important;height:1056px!important;overflow:hidden!important}.page.kw-contrato-hoja{transform:none!important}</style></head><body>'+html+'</body></html>');
   await imagePage.screenshot({path:path.join(artifactDir,nombre+'.png')});
  }
  await imagePage.close();
  // A paragraph longer than a whole sheet must still preserve every word.
  const overflow=await page.evaluate(()=>{
   const i=kwComercialContenido.findIndex(p=>p.startsWith('PRIMERA.'));const previous=kwComercialContenido[i];kwComercialContenido[i]='PRIMERA. '+('CONTENIDOEXTENSO '.repeat(1800));
   try{kwContratoDocumento.render(qaComercialConfig);return [...document.querySelectorAll('.page.kw-contrato-hoja .kw-contrato-cuerpo')].map(p=>p.textContent).join(' ').match(/CONTENIDOEXTENSO/g).length;}finally{kwComercialContenido[i]=previous;kwContratoDocumento.render(qaComercialConfig);}
  });assert.equal(overflow,1800*6,'all repeated client declarations preserve their complete text');
  await page.setViewportSize({width:390,height:1000});await page.locator('[data-kw-mobile="preview"]').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
