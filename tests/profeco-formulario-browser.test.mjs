import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const sdk=fs.readFileSync(path.join(root,'tests/contrato-comercial-browser.test.mjs'),'utf8').split('const sdk=`')[1].split('`;')[0];
const output=path.join(root,'artifacts/profeco-formulario');fs.mkdirSync(output,{recursive:true});
async function contexto(browser) {
  const ctx=await browser.newContext();
  await ctx.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.pathname.endsWith('/auth-guard.js'))return route.fulfill({body:sdk,contentType:'application/javascript'});
    if(u.hostname!=='kw.local'||u.pathname.endsWith('/kw-session.js'))return route.fulfill({body:''});
    const f=path.join(root,decodeURIComponent(u.pathname));
    return route.fulfill({status:fs.existsSync(f)?200:404,body:fs.existsSync(f)?fs.readFileSync(f):'',contentType:f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.css')?'text/css':f.endsWith('.js')?'application/javascript':'application/octet-stream'});
  });
  return ctx;
}
async function abrirGrupo(page, titulo) {
  const grupo=page.locator('details').filter({has:page.locator('summary').filter({hasText:new RegExp('^'+titulo+'$')})});
  if(!await grupo.evaluate(g=>g.open))await grupo.locator('summary').click();
  return grupo;
}
async function elegir(page,id,valor) {await page.locator('#'+id).selectOption(valor,{force:true});}

test('PROFECO: identificacion, condiciones, comas y guardado conservan los datos',async()=>{
  const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
  const ctx=await contexto(browser);
  try {
    const page=await ctx.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('https://kw.local/documentos/contratos/profeco.html?nuevo=1');
    await page.waitForSelector('#contrato-preview .kw-contrato-hoja');
    const consumidor=await abrirGrupo(page,'Datos del consumidor');
    assert.equal(await consumidor.locator('input[placeholder]').count(),0);
    await elegir(page,'f-cli0-idtipo','INE');
    assert.equal(await page.locator('#f-cli0-identidad').inputValue(),'Instituto Nacional Electoral');
    assert.equal(await page.locator('#f-cli0-idnum').inputValue(),'IDMEX');
    await page.locator('#f-cli0-idnum').fill('123456789');
    assert.equal(await page.locator('#f-cli0-idnum').inputValue(),'IDMEX123456789');
    await page.locator('#f-cli0-idnum').fill('');
    assert.equal(await page.locator('#f-cli0-idnum').inputValue(),'IDMEX');
    await elegir(page,'f-cli0-idtipo','PASAPORTE');
    assert.equal(await page.locator('#f-cli0-identidad').inputValue(),'Secretaría de Relaciones Exteriores (SRE)');
    assert.equal(await page.locator('#f-cli0-idnum').inputValue(),'');
    await elegir(page,'f-cli0-idtipo','INE');await page.locator('#f-cli0-idnum').fill('0123456789');
    await page.locator('#f-cli0-nombre').fill('Consumidor de prueba');
    await elegir(page,'f-num-clientes','2');
    assert.equal(await page.locator('#f-cli0-idnum').inputValue(),'IDMEX0123456789');
    await elegir(page,'f-cli1-idtipo','PASAPORTE');
    assert.equal(await page.locator('#f-cli1-identidad').inputValue(),'Secretaría de Relaciones Exteriores (SRE)');
    await page.locator('#f-cli1-idnum').fill('AB1234567');
    await page.locator('#f-cli0-idtipo').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'consumidor-1440.png')});
    const inmueble=await abrirGrupo(page,'Inmueble: identificación');
    await page.locator('#f-inm-escritura').fill('1000000');
    assert.equal(await page.locator('#f-inm-escritura').inputValue(),'1,000,000');
    assert.equal(await inmueble.locator('.kw-numero-controles').count(),0);
    const caracteristicas=await abrirGrupo(page,'Inmueble: características');
    for(const [nombre,selector,valor] of [['frente','f-car-frente-aplica','f-car-frente'],['fondo','f-car-fondo-aplica','f-car-fondo'],['roof','f-car-roof','f-car-roof-m2'],['jardin','f-car-jardin','f-car-jardin-m2'],['patio','f-car-patio','f-car-patio-m2']]) {
      assert.equal(await page.locator('#'+valor).isVisible(),false,nombre);
      await elegir(page,selector,'SI');assert.equal(await page.locator('#'+valor).isVisible(),true,nombre);
      await page.locator('#'+valor).fill('1234.50');assert.equal(await page.locator('#'+valor).inputValue(),'1,234.50');
      await elegir(page,selector,nombre==='frente'||nombre==='fondo'?'NO APLICA':'NO');
      assert.equal(await page.locator('#'+valor).isVisible(),false,nombre);
      assert.equal(await page.locator('#'+valor).inputValue(),'');
    }
    await elegir(page,'f-car-frente-aplica','SI');await page.locator('#f-car-frente').fill('15.25');
    await page.locator('#f-car-frente').fill('15.257');
    assert.equal(await page.locator('#f-car-frente').inputValue(),'15.257');
    await elegir(page,'f-car-jardin','SI');await page.locator('#f-car-jardin-m2').fill('1250.25');
    await elegir(page,'f-car-area-libre-unidad','m²');await page.locator('#f-car-area-libre').fill('2500');
    assert.equal(await caracteristicas.locator('.kw-numero-controles').count(),5);
    await page.locator('#f-car-niveles').locator('..').locator('[data-sumar]').click();
    assert.equal(await page.locator('#f-car-niveles').inputValue(),'1');
    await abrirGrupo(page,'Contenido del contrato');
    await page.locator('#f-con-precio').fill('1234567.89');
    assert.equal(await page.locator('#f-con-precio').inputValue(),'1,234,567.89');
    assert.ok((await page.locator('#precio-letra-display').textContent()).includes('1,234,567.89'));
    await page.evaluate(()=>guardarComoNuevo('Profeco QA'));
    const row=await page.evaluate(()=>window.qaRows.at(-1));
    assert.equal(row.datos['f-con-precio'],'1234567.89');
    assert.equal(row.datos['f-inm-escritura'],'1000000');
    assert.equal(row.datos['f-car-jardin-m2'],'1250.25');
    assert.equal(row.datos['f-car-frente-aplica'],'SI');
    assert.equal(row.datos['f-car-area-libre-unidad'],'m²');
    assert.equal(row.datos.clientes[0].idnum,'IDMEX0123456789');
    assert.equal(row.datos.clientes[1].idnum,'AB1234567');
    assert.equal(row.datos['f-car-frente'],'15.257');
    await page.evaluate(row=>abrirDocumentoGuardado(row,false),row);
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#f-con-precio').inputValue(),'1,234,567.89');
    assert.equal(await page.locator('#f-car-jardin-m2').inputValue(),'1,250.25');
    assert.equal(await page.locator('#f-cli0-idnum').inputValue(),'IDMEX0123456789');
    assert.ok(await page.evaluate(()=>document.getElementById('contrato-raw').textContent.includes('1,234,567.89')));
    const anterior={...row,datos:{...row.datos,'f-car-niveles':'PB + 2','f-car-patio':'Patio interior','f-car-patio-m2':'35','f-car-area-libre':'25 m²'}};
    delete anterior.datos['f-car-frente-aplica'];delete anterior.datos['f-car-area-libre-unidad'];
    await page.evaluate(row=>abrirDocumentoGuardado(row,false),anterior);await page.waitForTimeout(250);
    assert.equal(await page.locator('#f-car-frente-aplica').inputValue(),'SI');
    assert.equal(await page.locator('#f-car-niveles').inputValue(),'PB + 2');
    assert.equal(await page.locator('#f-car-patio').inputValue(),'Patio interior');
    assert.equal(await page.locator('#f-car-area-libre-unidad').inputValue(),'m²');
    assert.equal(await page.locator('#f-car-area-libre').inputValue(),'25');
    assert.deepEqual(errors,[]);
  } finally {await ctx.close();await browser.close();}
});

test('PROFECO: contraer desde abajo, campos sin desbordamiento y miniaturas como Comercial',async()=>{
  const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});const ctx=await contexto(browser);
  try {
    const page=await ctx.newPage();
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});
      await page.goto('https://kw.local/documentos/contratos/profeco.html?nuevo=1');await page.waitForSelector('#contrato-preview .kw-contrato-hoja',{state:'attached'});
      const grupo=await abrirGrupo(page,'Inmueble: características');
      assert.equal(await page.locator('[data-contraer-grupo]').count(),await page.locator('details').count());
      await elegir(page,'f-car-frente-aplica','SI');await elegir(page,'f-car-fondo-aplica','SI');
      await elegir(page,'f-car-roof','SI');await elegir(page,'f-car-jardin','SI');await elegir(page,'f-car-patio','SI');
      await page.locator('#f-car-frente-aplica').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(output,'caracteristicas-'+width+'.png')});
      await grupo.locator('[data-contraer-grupo]').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(output,'formulario-'+width+'.png')});
      await grupo.locator('[data-contraer-grupo]').click();assert.equal(await grupo.evaluate(g=>g.open),false);
      assert.equal(await grupo.locator('summary').evaluate(e=>e===document.activeElement),true);
      const max=await page.locator('#acuerdos-form-col .kw-form-scroll').evaluate(e=>({ancho:e.clientWidth,scroll:e.scrollWidth}));
      assert.ok(max.scroll<=max.ancho+1,JSON.stringify(max));
      if(width===390)await page.locator('[data-kw-mobile="preview"],.mobile-tab').filter({hasText:'Vista previa'}).first().click();
      const miniaturas=page.locator('.kw-contrato-miniaturas');
      if(!await miniaturas.isVisible())await page.locator('[data-miniaturas]').click();
      await miniaturas.locator('button').first().waitFor();
      await miniaturas.screenshot({path:path.join(output,'miniaturas-profeco-'+width+'.png')});
      const primera=await miniaturas.locator('.kw-miniatura-lienzo').first().boundingBox();
      await miniaturas.locator('button').last().click();
      await page.waitForFunction(()=>document.querySelector('.kw-contrato-miniaturas button:last-child')?.getAttribute('aria-current')==='page');
      assert.equal(await miniaturas.locator('button').last().getAttribute('aria-current'),'page');
      const desbordamiento=await miniaturas.evaluate(e=>e.scrollWidth-e.clientWidth);
      assert.ok(desbordamiento<=1);
      await page.goto('https://kw.local/documentos/contratos/comercial.html?nuevo=1');await page.waitForSelector('.kw-contrato-hoja',{state:'attached'});
      if(width===390)await page.locator('[data-kw-mobile="preview"]').click();
      if(!await miniaturas.isVisible())await page.locator('[data-miniaturas]').click();
      await miniaturas.locator('button').first().waitFor();
      await miniaturas.screenshot({path:path.join(output,'miniaturas-comercial-'+width+'.png')});
      const referencia=await miniaturas.locator('.kw-miniatura-lienzo').first().boundingBox();
      assert.equal(primera.width,referencia.width);assert.equal(primera.height,referencia.height);
    }
  } finally {await ctx.close();await browser.close();}
});
