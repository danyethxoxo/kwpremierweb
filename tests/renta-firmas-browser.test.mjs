import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const sdk=fs.readFileSync(path.join(root,'tests/contrato-comercial-browser.test.mjs'),'utf8').split('const sdk=`')[1].split('`;')[0];
test('Renta keeps up to six signatures lower on page two, with matching preview and PDF',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/auth-guard.js'))return route.fulfill({contentType:'application/javascript',body:sdk});
   if(url.pathname.endsWith('/kw-session.js')||url.hostname==='cdn.jsdelivr.net')return route.fulfill({body:''});
   if(url.hostname!=='kw.local')return route.abort();
   const file=path.join(root,decodeURIComponent(url.pathname));
   return route.fulfill({status:fs.existsSync(file)?200:404,body:fs.existsSync(file)?fs.readFileSync(file):'',contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://kw.local/documentos/contratos/renta.html?nuevo=1');await page.waitForSelector('.kw-contrato-hoja');
  for(const count of [1,2,3,4,6,3]){
   const result=await page.evaluate(count=>{
    document.getElementById('f-num-clientes').value=String(count);renderClientesFields();
    const nombres=['MARIA ELENA GONZALEZ HERNANDEZ','JOSE ANTONIO MARTINEZ RODRIGUEZ','ANA SOFIA LOPEZ VELAZQUEZ','CARLOS ALBERTO SANCHEZ TORRES','LUIS FERNANDO RUIZ PEREZ','GABRIELA ISABEL RAMIREZ DIAZ'];
    for(let i=0;i<count;i++){
     document.getElementById('f-cliente'+i).value=nombres[i];
     document.getElementById(i?'f-domicilio-cliente'+i:'f-domicilio').value='Calle San Francisco 25, departamento 201, Colonia Del Valle, Benito Juarez, Ciudad de Mexico, 03100';
    }
    document.getElementById('f-asesor').value='ALEJANDRO GARCIA FERNANDEZ';document.getElementById('f-inmueble').value='Avenida Insurgentes Sur 1234, departamento 301, Colonia Del Valle, Benito Juarez, Ciudad de Mexico, C.P. 03100';document.getElementById('f-monto').value='27000';document.getElementById('f-fecha').value='2026-10-16';
    updatePreview();kwContratoDocumento.render(configuracionDocumento());
    return [...document.querySelectorAll('.page.kw-contrato-hoja')].map(hoja=>{
     const r=hoja.getBoundingClientRect(),scale=r.width/816,firmas=hoja.querySelector('[data-kw-firmas]');
     return {text:hoja.textContent,signatures:hoja.querySelectorAll('.doc-firma-linea-top').length,bottom:(hoja.querySelector('.kw-contrato-cuerpo').getBoundingClientRect().bottom-r.top)/scale,gap:firmas?.previousElementSibling?(firmas.getBoundingClientRect().top-firmas.previousElementSibling.getBoundingClientRect().bottom)/scale:null,rows:firmas?[...firmas.children].map(f=>f.children.length):[]};
    });
   },count);
   assert.equal(result.reduce((n,p)=>n+p.signatures,0),count+3);
   assert.ok(result.every(p=>p.bottom<=990.1),'no content or signatures cross the footer');
   const groups=result.filter(p=>p.signatures);assert.equal(groups.length,1,'signatures stay together');
   if(count<=3){assert.equal(result.length,2,'up to three clients fit on two pages');assert.equal(result[1].signatures,count+3);assert.ok(result[1].gap>=55.9);assert.deepEqual(result[1].rows,count===1?[2,2]:count===2?[3,2]:[3,3]);}
  }
  await page.evaluate(()=>{
   const original=kwPDFVector.crear;
   kwPDFVector.crear=async(doc,options)=>{
    window.qaFirmasPDF=[...doc.querySelectorAll('.print-page')].map(p=>({text:p.textContent,lines:[...p.querySelectorAll('.doc-firma-linea-top')].map(el=>{const r=el.getBoundingClientRect(),pRect=p.getBoundingClientRect();return {x:r.left-pRect.left,y:r.top-pRect.top};})}));
    return original(doc,options);
   };
   window.qaFirmasVista=[...document.querySelectorAll('.page.kw-contrato-hoja')].map(p=>{const rect=p.getBoundingClientRect(),scale=rect.width/816;return {text:p.textContent,lines:[...p.querySelectorAll('.doc-firma-linea-top')].map(el=>{const r=el.getBoundingClientRect();return {x:(r.left-rect.left)/scale,y:(r.top-rect.top)/scale};})};});
  });
  const event=page.waitForEvent('download');await page.evaluate(()=>downloadPDF());const download=await event;
  const out=path.join(root,'artifacts/renta-firmas');fs.mkdirSync(out,{recursive:true});const pdf=path.join(out,'renta-tres-clientes.pdf');await download.saveAs(pdf);
  assert.equal((fs.readFileSync(pdf,'latin1').match(/\/Type \/Page\b/g)||[]).length,2);
  const exported=await page.evaluate(()=>({pdf:qaFirmasPDF,preview:qaFirmasVista}));
  assert.deepEqual(exported.pdf.map(p=>p.text),exported.preview.map(p=>p.text));
  exported.pdf.forEach((p,i)=>p.lines.forEach((line,j)=>{assert.ok(Math.abs(line.y-exported.preview[i].lines[j].y)<.2);assert.ok(Math.abs(line.x-exported.preview[i].lines[j].x)<.2);}));
  await page.setViewportSize({width:390,height:1000});await page.evaluate(()=>showMobileTab('preview'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.locator('.page.kw-contrato-hoja').count(),2);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
