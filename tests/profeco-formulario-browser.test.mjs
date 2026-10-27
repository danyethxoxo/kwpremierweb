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

test('PROFECO: divisas, detalles juridicos y fechas por partes se guardan y reabren',async()=>{
  const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{}), ctx=await contexto(browser);
  try {
    const page=await ctx.newPage({viewport:{width:1440,height:1000}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('https://kw.local/documentos/contratos/profeco.html?nuevo=1');
    await page.waitForSelector('#contrato-preview .kw-contrato-hoja');
    assert.equal(await page.locator('#f-con-contraprestacion').inputValue(),'6');
    for(const id of ['f-nec-precio-compra','f-nec-inversion']) {
      await page.locator('#'+id).evaluate(el=>el.closest('details').open=true);
      assert.equal(await page.locator('#'+id).locator('..').locator('span').textContent(),'$');
      await page.locator('#'+id).fill('1000000.50');await elegir(page,id+'-divisa','DLS');
    }
    for(const [control,campo] of [['f-car-bodega-aplica','f-car-bodega'],['f-car-cuota-aplica','f-car-cuota'],['f-hip-gravamen','f-hip-acreedor'],['f-suc-aplica','f-suc-herederos'],['f-jui-proceso','f-jui-tipo']]) {
      await page.locator('#'+control).evaluate(el=>el.closest('details').open=true);
      assert.equal(await page.locator('#'+campo).isVisible(),false);
      await elegir(page,control,'SI');assert.equal(await page.locator('#'+campo).isVisible(),true);
      await page.locator('#'+campo).fill(campo.includes('car-')?'1000':'Prueba');
      await elegir(page,control,'NO');assert.equal(await page.locator('#'+campo).isVisible(),false);
      assert.equal(await page.locator('#'+campo).inputValue(),'');
    }
    await elegir(page,'f-car-cuota-aplica','SI');await page.locator('#f-car-cuota').fill('1500');await elegir(page,'f-car-cuota-divisa','DLS');
    await page.locator('#f-con-fecha-dia').evaluate(el=>el.closest('details').open=true);
    const buscarFecha=async(parte,texto)=>{
      const campo=page.locator('#f-con-fecha-'+parte).locator('..').locator('.kw-select-busqueda');
      await campo.fill(texto);await campo.press('Enter');
    };
    await buscarFecha('ano','2024');await buscarFecha('mes','feb');await buscarFecha('dia','29');
    assert.equal(await page.locator('#f-con-fecha').inputValue(),'2024-02-29');
    await elegir(page,'f-con-fecha-ano','2025');assert.equal(await page.locator('#f-con-fecha').inputValue(),'');
    assert.equal(await page.locator('#f-con-fecha-dia option[value="29"]').count(),0);
    await elegir(page,'f-con-fecha-dia','28');
    assert.equal(await page.locator('[data-profeco-fecha-partes] > .kw-select').count(),12);
    assert.equal(await page.locator('#f-con-fecha-mes').locator('..').locator('.kw-select-valor').textContent(),'Febrero');
    await page.locator('#f-con-fecha-mes').locator('..').locator('.kw-select-busqueda').click();
    const meses=page.locator('#f-con-fecha-mes').locator('..').locator('.kw-select-menu');
    assert.ok(await meses.evaluate(el=>el.matches(':popover-open')));
    await meses.getByText('Marzo',{exact:true}).click();
    assert.equal(await page.locator('#f-con-fecha').inputValue(),'2025-03-28');
    await elegir(page,'f-con-fecha-mes','02');
    await abrirGrupo(page,'Contenido del contrato');
    await elegir(page,'f-con-vig-inicio-ano','2026');await elegir(page,'f-con-vig-inicio-mes','10');await elegir(page,'f-con-vig-inicio-dia','27');
    assert.equal(await page.locator('#f-con-vig-fin').inputValue(),'2027-04-26');
    assert.equal(await page.locator('#f-con-vig-fin-dia').inputValue(),'26');
    const mismaFila=await page.evaluate(()=>document.getElementById('f-con-precio').closest('.acuerdo-duo')===document.getElementById('f-con-divisa').closest('.acuerdo-duo'));
    assert.ok(mismaFila);
    await page.evaluate(()=>guardarComoNuevo('Profeco condiciones QA'));
    const row=await page.evaluate(()=>window.qaRows.at(-1));
    assert.equal(row.datos['f-con-fecha'],'2025-02-28');assert.equal(row.datos['f-nec-inversion-divisa'],'DLS');
    assert.equal(row.datos['f-car-cuota'],'1500');assert.equal(row.datos['f-car-cuota-divisa'],'DLS');assert.equal(row.datos['f-hip-acreedor'],'');
    await page.evaluate(row=>abrirDocumentoGuardado(row,false),row);await page.waitForTimeout(250);
    assert.equal(await page.locator('#f-con-fecha-dia').inputValue(),'28');assert.equal(await page.locator('#f-con-fecha-mes').inputValue(),'02');
    assert.equal(await page.locator('#f-nec-precio-compra-divisa').inputValue(),'DLS');
    assert.ok((await page.locator('#contrato-raw').textContent()).includes('1,000,000.50 DLS'));
    await page.evaluate(()=>bloquearFormulario(true));assert.equal(await page.locator('#f-con-fecha-dia').isDisabled(),true);
    await page.evaluate(()=>bloquearFormulario(false));
    await page.locator('#guardar-exito .guardar-exito-ok').click();
    await abrirGrupo(page,'Generales');
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});
      await page.locator('#f-con-fecha-dia').scrollIntoViewIfNeeded();
      const desborde=await page.locator('.kw-fecha-partes').evaluateAll(cajas=>cajas.some(c=>c.scrollWidth>c.clientWidth+1));assert.equal(desborde,false);
      await page.screenshot({path:path.join(output,'fechas-'+width+'.png')});
      await abrirGrupo(page,'Contenido del contrato');
      await page.locator('#f-con-precio').scrollIntoViewIfNeeded();
      const alineados=await page.evaluate(()=>{
        const a=document.getElementById('f-con-precio').closest('.acuerdo-field').getBoundingClientRect();
        const b=document.getElementById('f-con-divisa').closest('.acuerdo-field').getBoundingClientRect();
        return Math.abs(a.top-b.top)<2 && b.left>a.left;
      });assert.ok(alineados,'Precio y divisa en la misma fila a '+width);
      await page.screenshot({path:path.join(output,'precio-fila-'+width+'.png')});
    }
    assert.deepEqual(errors,[]);
  } finally {await ctx.close();await browser.close();}
});

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
    assert.equal(await page.locator('#f-con-divisa').inputValue(),'MXN');
    assert.equal(await page.locator('#f-con-precio').locator('..').locator('span').textContent(),'$');
    await elegir(page,'f-con-divisa','DLS');
    assert.ok((await page.locator('#precio-letra-display').textContent()).includes('DÓLARES ESTADOUNIDENSES'));
    await page.locator('#f-con-precio').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'precio-divisa-1440.png')});
    assert.equal(await page.locator('#f-con-precio').inputValue(),'1,234,567.89');
    assert.ok((await page.locator('#precio-letra-display').textContent()).includes('1,234,567.89'));
    await page.evaluate(()=>guardarComoNuevo('Profeco QA'));
    const row=await page.evaluate(()=>window.qaRows.at(-1));
    assert.equal(row.datos['f-con-precio'],'1234567.89');
    assert.equal(row.datos['f-con-divisa'],'DLS');
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
    assert.equal(await page.locator('#f-con-divisa').inputValue(),'DLS');
    assert.equal(await page.locator('#f-car-jardin-m2').inputValue(),'1,250.25');
    assert.equal(await page.locator('#f-cli0-idnum').inputValue(),'IDMEX0123456789');
    assert.ok(await page.evaluate(()=>document.getElementById('contrato-raw').textContent.includes('1,234,567.89')));
    const anterior={...row,datos:{...row.datos,'f-car-niveles':'PB + 2','f-car-patio':'Patio interior','f-car-patio-m2':'35','f-car-area-libre':'25 m²'}};
    delete anterior.datos['f-car-frente-aplica'];delete anterior.datos['f-car-area-libre-unidad'];
    delete anterior.datos['f-con-divisa'];
    await page.evaluate(row=>abrirDocumentoGuardado(row,false),anterior);await page.waitForTimeout(250);
    assert.equal(await page.locator('#f-car-frente-aplica').inputValue(),'SI');
    assert.equal(await page.locator('#f-car-niveles').inputValue(),'PB + 2');
    assert.equal(await page.locator('#f-car-patio').inputValue(),'Patio interior');
    assert.equal(await page.locator('#f-car-area-libre-unidad').inputValue(),'m²');
    assert.equal(await page.locator('#f-car-area-libre').inputValue(),'25');
    assert.equal(await page.locator('#f-con-divisa').inputValue(),'MXN');
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
      assert.equal(await page.locator('summary').filter({hasText:'Datos del profesional asignado'}).count(),1);
      const consumidor=await abrirGrupo(page,'Datos del consumidor');
      await consumidor.locator('[data-contraer-grupo]').scrollIntoViewIfNeeded();
      const ubicacion=await consumidor.evaluate(g=>{const boton=g.querySelector('[data-contraer-grupo]'),s=getComputedStyle(boton);return {arriba:boton.getBoundingClientRect().top,telefono:g.querySelector('input[id$="-tel"]').getBoundingClientRect().bottom,borde:s.borderTopWidth,fondo:s.backgroundColor,sombra:s.boxShadow};});
      assert.ok(ubicacion.arriba>=ubicacion.telefono+10,JSON.stringify(ubicacion));
      assert.equal(ubicacion.borde,'0px');assert.equal(ubicacion.fondo,'rgba(0, 0, 0, 0)');assert.equal(ubicacion.sombra,'none');
      await page.screenshot({path:path.join(output,'flecha-consumidor-'+width+'.png')});
      await consumidor.locator('[data-contraer-grupo]').click();
      await abrirGrupo(page,'Inmueble: identificación');
      const caja=page.locator('#f-inm-condominio').locator('..');
      await caja.locator('.kw-select-btn').click();
      const menu=caja.locator('.kw-select-menu');await menu.waitFor({state:'visible'});
      assert.ok((await menu.boundingBox()).width<=(await caja.locator('.kw-select-btn').boundingBox()).width+1);
      const visible=await menu.evaluate(m=>{const op=m.querySelector('.kw-select-opcion:last-child'),r=op.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {completo:!!hit&&op.contains(hit),top:m.getBoundingClientRect().top,bottom:m.getBoundingClientRect().bottom,alto:innerHeight};});
      assert.ok(visible.completo,JSON.stringify(visible));assert.ok(visible.top>=0&&visible.bottom<=visible.alto);
      await page.screenshot({path:path.join(output,'menu-regimen-'+width+'.png')});
      await menu.getByRole('option',{name:'NO',exact:true}).click();assert.equal(await page.locator('#f-inm-condominio').inputValue(),'NO');
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
