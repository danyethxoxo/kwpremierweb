import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime,pdfScript} from './helpers/dictamen-pdf-runtime.mjs';

test('reproduce el fallo anterior con una respuesta de CFDI no vacía',()=>{
  const anterior=pdfScript.replace('textoSimple(respuestaCfdi(d.cfdi_necesario))','respuestaCfdi(d.cfdi_necesario)');
  const ctx=runtime({},anterior);
  assert.throws(()=>ctx.dibujarHoja({id:'qa',cfdi_necesario:'no'},null,false),/forEach/);
});

test('encabezado centrado, logo izquierdo y estatus con folio alineados a la derecha', () => {
  for (const estado of ['borrador', 'devuelta', 'condicionada', 'autorizada']) {
    const d = {id: 'qa', folio: 'DIC-2026-0042', revision: 2, estado};
    const ctx = runtime({dictamen: d});
    const pagina = ctx.dibujarHoja(d, {ancho: 600, alto: 150}, false)[0];
    const textos = [...pagina.matchAll(/BT\n([^]*?)\nET/g)].map(m => m[1]);
    const titulo = textos.find(t => t.includes('(Dictamen de expediente)'));
    const posicion = titulo.match(/([\d.]+) ([\d.]+) Td/);
    const ancho = ctx.anchoTexto('Dictamen de expediente', 13.5, true);
    assert.ok(Math.abs(Number(posicion[1]) + ancho / 2 - 306) < 0.01);
    assert.match(titulo, /^0\.81 0 0\.12 rg\n/);
    assert.match(pagina, /96 0 0 24 54 714 cm\n\/Im0 Do/);
    const folio = textos.find(t => t.includes('(DIC-2026-0042 · Rev 2)'));
    const xFolio = Number(folio.match(/([\d.]+) ([\d.]+) Td/)[1]);
    assert.ok(Math.abs(xFolio + ctx.anchoTexto('DIC-2026-0042 · Rev 2', 8, false) - 558) < 0.01);
    const estatus = textos[1];
    assert.match(estatus, /^0 0 0 rg\n\/F2 8 Tf/);
    assert.equal(pagina.includes('NaN'), false);
  }
});

test('apartados negros, rojo reservado al titulo y correcciones; marco redondeado por pagina', () => {
  const d = {id: 'qa', estado: 'autorizada', escritura_numero: '123',
    inmueble: 'Dirección '.repeat(45),
    observaciones: '\\n\\n<!--KW_CORRECCIONES:' + JSON.stringify({inmueble: 'Confirmar domicilio.'}) + '-->'};
  const ctx = runtime({dictamen: d, puntos: [{dictamen_id: 'qa', texto: 'Validar escritura.'}]});
  const paginas = ctx.dibujarHoja(d, null, true);
  assert.ok(paginas.length > 1);
  for (const pagina of paginas) {
    assert.equal((pagina.match(/ c\n/g) || []).length, 4);
    assert.equal((pagina.match(/h S\n/g) || []).length, 1);
    assert.equal(pagina.includes(' re S'), false);
    for (const m of pagina.matchAll(/BT\n([^]*?)\nET/g)) {
      const texto = m[1];
      if (texto.includes('/F2 7.5 Tf')) assert.match(texto, /^0 0 0 rg\n/);
      if (texto.startsWith('0.81 0 0.12 rg')) {
        assert.ok(texto.includes('(Dictamen de expediente)') || texto.includes('(Corrección:'));
      }
    }
  }
  assert.ok(paginas.join('').includes('(Corrección: Confirmar domicilio.)'));
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
