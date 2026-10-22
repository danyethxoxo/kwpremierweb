import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {jsPDF} from 'jspdf';
const root=fileURLToPath(new URL('../',import.meta.url));
const sdk=fs.readFileSync(path.join(root,'tests/contrato-comercial-browser.test.mjs'),'utf8').split('const sdk=`')[1].split('`;')[0];
async function entorno(page){
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/auth-guard.js'))return route.fulfill({contentType:'application/javascript',body:sdk});
    if(url.pathname.endsWith('/kw-session.js'))return route.fulfill({body:''});
    // Estas pruebas nunca contactan servicios ni envian archivos a la web real.
    if(url.hostname!=='kw.local')return route.abort();
    const file=path.join(root,decodeURIComponent(url.pathname));
    return route.fulfill({status:fs.existsSync(file)?200:404,body:fs.existsSync(file)?fs.readFileSync(file):'',contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
  });
}
test('movil: encabezado compartido, acuerdos legibles, apertura y regreso a escritorio',async()=>{
  const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);await entorno(page);
    const errores=[];page.on('pageerror',e=>errores.push(e.message));
    await page.addInitScript(()=>sessionStorage.setItem('qaRows',JSON.stringify([{id:'guardado',user_id:'qa-user',tipo_documento:'acuerdo_referido',nombre_archivo:'Acuerdo guardado de prueba',estado:'finalizado',folio:'QA-001',revision:0,updated_at:'2026-10-22T12:00:00Z',datos:{'f-comprador-direccion':'Calle de prueba 25'}}])));
    await page.goto('https://kw.local/documentos/acuerdos/acuerdoreferido.html');
    await page.locator('.lista-item-original').waitFor();
    fs.mkdirSync(path.join(root,'artifacts/movil-compartido'),{recursive:true});
    await page.screenshot({path:path.join(root,'artifacts/movil-compartido/acuerdos.png')});
    assert.equal(await page.locator('body > header.kw-header').count(),1);
    assert.equal(await page.getByText('Acuerdo guardado de prueba',{exact:true}).isVisible(),true);
    for(const width of [320,390,768,1023]){
      await page.setViewportSize({width,height:844});
      assert.ok(await page.locator('html').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'sin desborde a '+width);
      assert.ok(await page.locator('.btn-nuevo-documento').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
    }
    await page.getByText('Acuerdo guardado de prueba',{exact:true}).click();
    await page.waitForURL(/\?doc=guardado/);await page.waitForFunction(()=>document.getElementById('f-comprador-direccion').value==='Calle de prueba 25');
    await page.goto('https://kw.local/documentos/contratos/renta.html');await page.locator('.kw-movil-accion').waitFor();
    await page.setViewportSize({width:1440,height:1000});
    await page.waitForFunction(()=>!document.body.classList.contains('kw-movil'));
    assert.equal(await page.locator('.vista-lista-header .btn-nuevo-documento').isVisible(),true);
    assert.equal(await page.locator('.kw-movil-header').count(),0);
    for(const url of ['portal.html','hub/drive.html','hub/pagina-universal.html']){
      await page.setViewportSize({width:390,height:844});await page.goto('https://kw.local/'+url);
      await page.waitForFunction(()=>document.body.classList.contains('kw-movil'));
      assert.equal(await page.locator('body > header.kw-header').count(),1,url);
      assert.ok((await page.locator('header .kw-header-title').innerText()).trim(),url+': titulo visible');
      assert.ok(await page.locator('html').evaluate(el=>el.scrollWidth<=el.clientWidth+1),url);
      if(url==='hub/pagina-universal.html'){
        assert.equal(await page.locator('main .kw-page-titulo').isVisible(),false,'el titulo no se duplica');
        assert.equal(await page.locator('.kw-movil-buscar').isVisible(),true,await page.locator('.kw-movil-buscar').evaluate(el=>JSON.stringify({html:el.outerHTML,parent:el.parentElement.className,hidden:el.hidden,visibility:getComputedStyle(el).visibility,rect:el.getBoundingClientRect().toJSON()})));
        await page.locator('#kw-drawer-toggle').click();
        await page.getByRole('dialog',{name:'Filtros y herramientas'}).waitFor();
        await page.getByRole('button',{name:'Cerrar filtros',exact:true}).click();
        await page.locator('.kw-lateral-movil').waitFor({state:'hidden'});
        await page.screenshot({path:path.join(root,'artifacts/movil-compartido/universal.png')});
      }
    }
    assert.deepEqual(errores,[]);
  }finally{await browser.close();}
});
test('firmas movil: selecciona, quita, reelige, une PDFs y abre el editor sin dibujar todas las hojas',async()=>{
  const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});page.setDefaultTimeout(10000);await entorno(page);
    const errores=[];page.on('pageerror',e=>errores.push(e.message));
    await page.goto('https://kw.local/hub/firmas.html?vista=nuevo-documento');
    await page.locator('#pantalla-carga').waitFor({state:'hidden'});
    const pdf=new jsPDF();for(let n=1;n<=25;n++){if(n>1)pdf.addPage();pdf.text('Pagina de prueba '+n,20,25);}
    const archivo={name:'Contrato.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf.output('arraybuffer'))};
    await page.locator('#archivo').setInputFiles(archivo);
    await page.locator('#btn-continuar').waitFor({state:'visible'});
    assert.ok((await page.locator('#lista-archivos').innerText()).includes('Contrato.pdf'));
    await page.locator('[data-quita]').click();
    assert.equal(await page.locator('#archivos-pie').isVisible(),false);
    await page.locator('#archivo').setInputFiles(archivo);await page.locator('#btn-continuar').click();
    await page.waitForFunction(()=>document.querySelectorAll('#paginas .pagina-caja').length===25||document.getElementById('msg-archivos').textContent.length);
    await page.locator('#editor-cargando').waitFor({state:'hidden'});
    assert.equal(await page.locator('#paginas .pagina-caja').count(),25,await page.locator('#msg-archivos').innerText());
    const dibujadas=await page.locator('#paginas canvas').evaluateAll(els=>els.filter(el=>el.width>1).length);
    await page.screenshot({path:path.join(root,'artifacts/movil-compartido/editor.png')});
    assert.ok(dibujadas<10,'se dibujan las hojas visibles, no las 25 de golpe');
    await page.locator('#paginas .pagina-caja').last().scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('#paginas .pagina-caja:last-of-type canvas')?.width>1||Array.from(document.querySelectorAll('#paginas canvas')).at(-1)?.width>1);
    assert.equal(await page.locator('script[src*="pdf-lib-"]').count(),0,'un solo PDF conserva su archivo sin cargar la union');
    await page.goBack();await page.goForward();
    await page.locator('#paginas .pagina-caja').nth(12).scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelectorAll('#paginas canvas')[12]?.width>1);
    await page.goBack();await page.locator('#archivo').waitFor({state:'attached'});
    await page.locator('#archivo').setInputFiles([archivo,{...archivo,name:'Anexo.pdf'}]);
    await page.locator('#btn-continuar').click();
    await page.waitForFunction(()=>document.querySelectorAll('#paginas .pagina-caja').length===50||document.getElementById('msg-archivos').textContent.length);
    await page.locator('#editor-cargando').waitFor({state:'hidden'});
    assert.equal(await page.locator('#paginas .pagina-caja').count(),50);
    assert.equal(await page.locator('script[src*="pdf-lib-"]').count(),1);
    assert.deepEqual(errores,[]);
  }finally{await browser.close();}
});

test('firmas movil: avisa si falla el visor y permite continuar al recuperar la conexion',async()=>{
  const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);await entorno(page);
    let falla=true;
    await page.route('**/pdf-3.11.174.min.js',route=>falla?route.abort():route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'assets/vendor/firmas/pdf-3.11.174.min.js'))}));
    await page.goto('https://kw.local/hub/firmas.html?vista=nuevo-documento');
    await page.locator('#pantalla-carga').waitFor({state:'hidden'});
    const pdf=new jsPDF();pdf.text('Archivo de prueba sin extension',20,25);
    await page.locator('#archivo').setInputFiles({name:'Archivo de Drive',mimeType:'application/pdf',buffer:Buffer.from(pdf.output('arraybuffer'))});
    await page.waitForFunction(()=>document.getElementById('msg-archivos').textContent.includes('visor'));
    assert.equal(await page.locator('#btn-continuar').isEnabled(),true);
    falla=false;await page.locator('#btn-continuar').click();
    await page.locator('#paginas .pagina-caja').waitFor();
    await page.locator('#editor-cargando').waitFor({state:'hidden'});
    assert.equal(await page.locator('#editor-nombre').innerText(),'Archivo de Drive');
  }finally{await browser.close();}
});
