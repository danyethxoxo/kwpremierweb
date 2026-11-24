import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {html, runtime} from './helpers/dictamen-pdf-runtime.mjs';

function fn(name) {
  const start=html.search(new RegExp('^  (?:async )?function '+name+'\\(','m'));
  return html.slice(start,html.indexOf('\n  }',start)+4);
}
function escenario(error=false) {
  const viejo={id:'qa',folio:'QA',revision:1,estado:'devuelta',asesor_correo:'qa@example.com',inmueble:'Anterior'};
  const nuevo={...viejo,revision:2,inmueble:'Actualizado',cfdi_necesario:'no',cfdi_tiene:'no',
    observaciones:'\\n\\n<!--KW_CORRECCIONES:'+JSON.stringify({inmueble:'CORRECCION RECIENTE',cfdi_necesario:'SI ES NECESARIO',cfdi_tiene:'SI CUENTA'})+'-->'};
  const ctx=runtime({dictamen:viejo,puntos:[{dictamen_id:'qa',texto:'Observacion anterior'}]});
  const requests=[],correos=[],avisos=[];
  ctx.window={kwSupabase:{from(tabla){requests.push(tabla);return {
    select(){return this;},eq(){return this;},order(){return this;},
    async maybeSingle(){return {data:error?null:nuevo,error:error?{message:'sin acceso'}:null};},
    async range(){return {data:tabla==='dictamen_puntos'?[{dictamen_id:'qa',texto:'OBSERVACION RECIENTE'}]:[{dictamen_id:'qa',nombre:'CLIENTE ACTUAL',orden:1}],error:null};}
  };},auth:{async getSession(){return {data:{session:{access_token:'qa'}}};}}},kwUI:{async alert(t){avisos.push(t);}}};
  const boton={innerHTML:'Enviar',disabled:false,setAttribute(){},removeAttribute(){},querySelector(){return null;},classList:{add(){},remove(){}}};
  ctx.$=()=>boton;
  ctx.cargar=async()=>{};
  ctx.fetch=async(url,opciones)=>{correos.push(JSON.parse(opciones.body));return {ok:true,async json(){return {ok:true,enviado_a:['qa@example.com']};}};};
  ctx.base64DeBlob=async blob=>Buffer.from(await blob.arrayBuffer()).toString('base64');
  vm.runInContext(fn('leerDetalleDictamen')+'\n'+fn('enviarDictamenPorCorreo'),ctx);
  return {ctx,requests,correos,avisos,boton};
}

test('correo adjunta la revision actual con correcciones y observaciones recien guardadas',async()=>{
  const {ctx,requests,correos,boton}=escenario();
  await ctx.enviarDictamenPorCorreo('qa',boton,{destinatario:'asesor'});
  assert.deepEqual(requests.sort(),['dictamen_clientes','dictamen_puntos','dictamenes_con_asesor'].sort());
  assert.equal(correos.length,1);
  const envio=correos[0];
  assert.equal(envio.nombre_archivo_con_correcciones,'dictamen-QA-rev-2-con-correcciones.pdf');
  const con=Buffer.from(envio.pdf_con_correcciones,'base64').toString('latin1');
  const solo=Buffer.from(envio.pdf_solo_datos,'base64').toString('latin1');
  for(const texto of ['CORRECCION RECIENTE','SI ES NECESARIO','SI CUENTA','OBSERVACION RECIENTE']) {
    assert.ok(con.includes(texto),texto);
    assert.equal(solo.includes(texto),false,texto);
  }
  assert.ok(con.includes('CLIENTE ACTUAL'));assert.ok(solo.includes('Actualizado'));
  assert.equal(con.includes('Observacion anterior'),false);
  assert.equal(boton.disabled,false);
});

test('si no se pueden consultar los datos actuales no se envia un PDF anterior',async()=>{
  const {ctx,correos,avisos,boton}=escenario(true);
  await ctx.enviarDictamenPorCorreo('qa',boton,{destinatario:'asesor'});
  assert.equal(correos.length,0);assert.equal(avisos[0],'sin acceso');assert.equal(boton.disabled,false);
});

test('escrituras antiguas conservan correcciones de sus campos desglosados en el PDF',async()=>{
  const ctx=runtime();
  const d={id:'qa',escritura_propiedad:'Escritura anterior',observaciones:'\\n\\n<!--KW_CORRECCIONES:'+JSON.stringify({escritura_fecha:'FECHA CORRECTA',notario_nombre:'NOTARIO CORRECTO'})+'-->'};
  const pdf=Buffer.from(await (await ctx.crearPDF(d,true)).arrayBuffer()).toString('latin1');
  assert.ok(pdf.includes('FECHA CORRECTA'));assert.ok(pdf.includes('NOTARIO CORRECTO'));
});
