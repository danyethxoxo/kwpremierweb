import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime,pdfScript} from './helpers/dictamen-pdf-runtime.mjs';

test('reproduce el fallo anterior con una respuesta de CFDI no vacía',()=>{
  const anterior=pdfScript.replace('textoSimple(respuestaCfdi(d.cfdi_necesario))','respuestaCfdi(d.cfdi_necesario)');
  const ctx=runtime({},anterior);
  assert.throws(()=>ctx.dibujarHoja({id:'qa',cfdi_necesario:'no'},null,false),/forEach/);
});

test('ambas versiones del PDF aceptan todas las respuestas de CFDI y campos sin contestar',async()=>{
  for(const respuesta of ['si','no','no_aplica',null]){
    const d={id:'qa',folio:'QA-001',asesor_nombre:'Asesor QA',cliente:'Cliente QA',estado:'condicionada',
      cfdi_necesario:respuesta,cfdi_tiene:respuesta,fecha_dictamen:'2026-10-13',observaciones:'Observación de prueba'};
    const ctx=runtime({dictamen:d,puntos:[{dictamen_id:'qa',texto:'Validar expediente',estado:'pendiente'}]});
    for(const correcciones of [false,true]){
      const blob=await ctx.crearPDF(d,correcciones);
      assert.equal(blob.type,'application/pdf');
      const pdf=Buffer.from(await blob.arrayBuffer()).toString('latin1');
      assert.ok(pdf.startsWith('%PDF-1.4'));
      assert.ok(pdf.endsWith('%%EOF'));
      assert.ok(pdf.includes('CFDI'));
      if(respuesta==='no')assert.ok(pdf.includes('(No)'));
      if(respuesta==='si')assert.ok(pdf.includes('(Sí)'));
      if(respuesta==='no_aplica')assert.ok(pdf.includes('(No aplica)'));
      if(correcciones)assert.ok(pdf.includes('Validar expediente'));
    }
  }
});
