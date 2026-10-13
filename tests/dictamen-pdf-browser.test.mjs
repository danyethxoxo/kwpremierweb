import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {pdfScript} from './helpers/dictamen-pdf-runtime.mjs';

test('descarga solo datos y con correcciones con los nombres esperados',async()=>{
  const datos=process.env.KW_DICTAMEN_QA_DATA?JSON.parse(fs.readFileSync(process.env.KW_DICTAMEN_QA_DATA,'utf8')):
    {dictamen:{id:'qa',folio:'QA-001',estado:'condicionada',asesor_nombre:'Asesor QA',cliente:'Cliente QA',cfdi_necesario:'no'},
      clientes:[],puntos:[{dictamen_id:'qa',texto:'Validar expediente',estado:'pendiente'}]};
  const dir=process.env.KW_DICTAMEN_QA_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'kw-dictamen-pdf-'));
  fs.mkdirSync(dir,{recursive:true});
  const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
  try {
    const page=await browser.newPage({acceptDownloads:true});const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://kw.local/**',route=>{
      if(new URL(route.request().url()).pathname==='/assets/img/logo-kw-premier.png')return route.fulfill({contentType:'image/png',body:fs.readFileSync(new URL('../assets/img/logo-kw-premier.png',import.meta.url))});
      return route.fulfill({contentType:'text/html',body:'<button id="solo">Solo datos</button><button id="correcciones">Con correcciones</button>'});
    });
    await page.goto('http://kw.local/');
    await page.addScriptTag({content:'var dictamenes='+JSON.stringify([datos.dictamen])+';var clientes='+JSON.stringify(datos.clientes)+';var puntos='+JSON.stringify(datos.puntos)+';\n'+pdfScript});
    await page.evaluate(id=>{
      document.getElementById('solo').onclick=()=>imprimir(id,false);
      document.getElementById('correcciones').onclick=()=>imprimir(id,true);
    },datos.dictamen.id);
    for(const [boton,sufijo]of [['solo','solo-datos'],['correcciones','con-correcciones']]){
      const pendiente=page.waitForEvent('download');await page.locator('#'+boton).click();
      const download=await pendiente;
      assert.equal(await download.failure(),null);
      assert.equal(download.suggestedFilename(),'dictamen-'+datos.dictamen.folio+'-'+sufijo+'.pdf');
      const destino=path.join(dir,download.suggestedFilename());await download.saveAs(destino);
      const contenido=fs.readFileSync(destino).toString('latin1');
      assert.ok(contenido.startsWith('%PDF-1.4'));assert.ok(contenido.endsWith('%%EOF'));
    }
    assert.deepEqual(errors,[]);
    console.log('PDFs verificados: '+dir);
  } finally {await browser.close();}
});
