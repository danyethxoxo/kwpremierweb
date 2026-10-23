import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {pdfScript} from './helpers/dictamen-pdf-runtime.mjs';
const html=fs.readFileSync(new URL('../hub/dictamenes.html',import.meta.url),'utf8');
function fn(name){const start=html.search(new RegExp('^  (?:async )?function '+name+'\\(','m'));return html.slice(start,html.indexOf('\n  }',start)+4);}
const actions=html.slice(html.indexOf('  function activarAccionesDictamen('),html.indexOf('\n  if (document.documentElement.classList.contains',html.indexOf('  function activarAccionesDictamen(')));
const styles=['kw-base.css','kw-claro.css','kw-avisos.css'].map(f=>fs.readFileSync(new URL('../assets/css/'+f,import.meta.url),'utf8')).join('\n')+[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const output=new URL('../artifacts/dictamen-visor/',import.meta.url);fs.mkdirSync(output,{recursive:true});
const buttonIds=['e-ver-pdf','e-descargar-menu','e-enviar-correo','e-cambiar-estatus','e-descargar','e-descargar-correcciones'];
async function setup(page){
  await page.setContent('<html class="kw-auth-ok"><style>'+styles+'</style><body><button id="e-guardar">Guardar</button>'+buttonIds.map(id=>'<button id="'+id+'">'+id+'</button>').join('')+'</body></html>');
  await page.addScriptTag({content:`var $=id=>document.getElementById(id), calls=[], failStatus=false;
    var ORDEN_ESTADOS=['devuelta','condicionada','autorizada'],ESTADOS={devuelta:'Devuelto',condicionada:'Autorizado condicionado',autorizada:'Autorizado para promoción'};
    var borrador={id:'test',asesor_id:'advisor'},dictamenes=[{id:'test',estado:'devuelta'}],asesores=[{id:'advisor',correo:'advisor@example.com'}];
    window.kwUI={cerrarModal:(overlay,done)=>done(),cargando:()=>{calls.push('loading');return()=>{};}};
    window.kwSupabase={rpc:async(name,args)=>{calls.push({name,args});return {error:failStatus?{message:'fallo'}:null};}};
    function leerEditor(){calls.push('read');} async function guardar(){calls.push('save');return 'test';}
    async function cargar(){calls.push('reload');}function aviso(){}function mostrarDictamenGuardado(){calls.push('success');}
    async function fallo(text){calls.push({error:text});}async function enviarDictamenPorCorreo(id,button,selection){calls.push({mail:selection});}
    function verPDF(){}function cerrarMenusPDF(){}function imprimir(){}
    ${fn('preguntarEstado')}
    ${actions}`});
}
test('guardar pide estatus antes de escribir; cancelar no guarda',async()=>{
  const browser=await chromium.launch({channel:'chrome'});try{const page=await browser.newPage();await setup(page);
    await page.click('#e-guardar');await page.click('[data-elige="autorizada"]');await page.click('[data-cancelar]');
    assert.deepEqual(await page.evaluate(()=>calls),['read']);assert.equal(await page.locator('#e-guardar').isEnabled(),true);
  }finally{await browser.close();}
});
test('guardar y enviar conserva orden y manda a los tres; fallo de estatus no envia',async()=>{
  const browser=await chromium.launch({channel:'chrome'});try{const page=await browser.newPage();
    for(const send of [false,true]){await setup(page);await page.click('#e-guardar');await page.click('[data-elige="autorizada"]');await page.click(send?'[data-enviar]':'[data-guardar]');
      const calls=await page.evaluate(()=>window.calls);assert.equal(calls.indexOf('save')<calls.findIndex(c=>c.name==='dictaminar'),true);assert.equal(calls.find(c=>c.name==='dictaminar').args.p_estado,'autorizada');assert.equal(calls.filter(c=>c.mail).length,send?1:0);if(send)assert.deepEqual(calls.find(c=>c.mail).mail,{destinatario:'todos'});
    }
    await setup(page);await page.evaluate(()=>failStatus=true);await page.click('#e-guardar');await page.click('[data-enviar]');assert.equal((await page.evaluate(()=>calls)).some(c=>c.mail),false);
  }finally{await browser.close();}
});
test('cambiar estatus no guarda cambios del formulario; modal cabe en movil',async()=>{
  const browser=await chromium.launch({channel:'chrome'});try{const page=await browser.newPage();for(const width of [1280,390,320]){
    await page.setViewportSize({width,height:800});await setup(page);await page.click('#e-cambiar-estatus');await page.click('[data-elige="condicionada"]');
    const box=await page.locator('.dic-modal-estado').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
    if(width===390){await page.waitForTimeout(200);await page.screenshot({path:new URL('estatus-movil.png',output).pathname.replace(/^\/(\w:)/,'$1')});}
    await page.click('[data-guardar]');const calls=await page.evaluate(()=>window.calls);assert.equal(calls.includes('save'),false);assert.equal(calls.find(c=>c.name==='dictaminar').args.p_estado,'condicionada');
  }}finally{await browser.close();}
});
test('visor dibuja ambos PDF sin descarga; menu permite elegir y validar otro correo',async()=>{
  const browser=await chromium.launch({channel:'chrome'});try{const page=await browser.newPage();let downloads=0;page.on('download',()=>downloads++);
    await page.route('http://kw.local/**',route=>{const path=new URL(route.request().url()).pathname;if(path.startsWith('/assets/'))return route.fulfill({path:new URL('..'+path,import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});return route.fulfill({contentType:'text/html',body:'<button id="anchor">Enviar</button>'});});
    await page.goto('http://kw.local/');for(const file of ['kw-base.css','kw-ui.css'])await page.addStyleTag({path:new URL('../assets/css/'+file,import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});await page.addScriptTag({path:new URL('../assets/js/kw-ui.js',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});await page.addScriptTag({path:new URL('../assets/js/kw-document-viewer.js',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});
    await page.addScriptTag({content:'var dictamenes=[],clientes=[],puntos=[];'+pdfScript+';cargarLogo=async()=>null;var qa={id:"qa",folio:"QA",estado:"devuelta",inmueble:"Prueba",asesor_nombre:"Asesor"};'});
    for(const width of [1280,390]){await page.setViewportSize({width,height:800});await page.evaluate(()=>kwDocumentViewer.open({title:'Dictamen QA',variants:['Solo con datos','Datos y correcciones'],initialIndex:1,filename:i=>'dictamen-'+(i?'con-correcciones':'solo-datos')+'.pdf',load:i=>crearPDF(qa,i===1)}));
      await page.waitForFunction(()=>document.querySelector('.kw-doc-pages canvas')?.getContext('2d').getImageData(0,0,1,1).data[3]>0);const bounds=await page.locator('.kw-doc-viewer').boundingBox();const margin=width===390?16:24;assert.equal(bounds.x,margin);assert.equal(bounds.y,margin);assert.equal(Math.round(width-bounds.x-bounds.width),margin);assert.equal(Math.round(800-bounds.y-bounds.height),margin);await page.screenshot({path:new URL('visor-'+width+'.png',output).pathname.replace(/^\/(\w:)/,'$1')});assert.equal(await page.locator('.kw-doc-viewer select').inputValue(),'1');await page.locator('.kw-doc-viewer .kw-select-btn').click();await page.locator('.kw-doc-viewer .kw-select-opcion[data-i="0"]').click();await page.waitForFunction(()=>document.querySelector('.kw-doc-pages canvas')?.getContext('2d').getImageData(0,0,1,1).data[3]>0);assert.equal(downloads,width===1280?0:1);const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar',exact:true}).click();assert.equal((await downloaded).suggestedFilename(),'dictamen-solo-datos.pdf');await page.getByRole('button',{name:'Cerrar visor'}).click();
    }
    await page.evaluate(()=>{window.selection=kwDocumentViewer.recipient(document.getElementById('anchor'));});assert.equal(await page.locator('.kw-doc-menu > button').count(),6);assert.equal(await page.locator('.kw-doc-menu').evaluate(el=>el.matches(':modal')),false);assert.ok((await page.locator('.kw-doc-menu').boundingBox()).width>=280);await page.screenshot({path:new URL('correo-movil.png',output).pathname.replace(/^\/(\w:)/,'$1')});
    await page.getByRole('button',{name:'Enviar a otro correo',exact:true}).click();await page.locator('input[type=email]').fill('invalid');await page.locator('button[type=submit]').click();assert.equal(await page.locator('.kw-doc-menu').isVisible(),true);
    await page.locator('input[type=email]').fill('other@example.com');await page.locator('button[type=submit]').click();assert.deepEqual(await page.evaluate(()=>selection),{destinatario:'otro',correo:'other@example.com'});
  }finally{await browser.close();}
});
