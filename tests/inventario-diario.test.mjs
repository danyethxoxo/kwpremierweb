import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/inventario-diario/index.ts',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,''),{mode:'strip'});
function preparar({actualizada=false,enviada=false,falla=false,incompleta=false,pendientesPremier=false,ahora='2026-10-08T09:20:00Z'}={}) {
 const llamadas=[],actualizaciones=[],registros=[];
 let handler;
 class Reloj extends Date {constructor(...args){super(...(args.length?args:[ahora]));}}
 const admin={from(table){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},async maybeSingle(){return {data:table==='propiedades_sync'?{ultimo_cursor:actualizada?'2026-10-08T09:01:00Z':'2026-10-07T09:01:00Z',ultimo_error:null}:enviada?{enviado_at:'2026-10-08T09:02:00Z'}:null}},update(v){actualizaciones.push(v);return q},then(ok){return Promise.resolve({error:null,data:table==='propiedades' && pendientesPremier?[{fuente_id:'1'}]:[]}).then(ok)}};return q}};
 const scope=vm.createContext({Date:Reloj,Intl,Response,AbortSignal,console:{error(){},info(...args){registros.push(args)}},Deno:{env:{get:k=>({SUPABASE_URL:'https://example.com',SERVICE_ROLE_KEY:'service',WEBHOOK_SECRET:'webhook',SYNC_SECRET:'sync'})[k]}},createClient:()=>admin,secureServe:(o,h)=>handler=h,enviarCorreo:async()=>{},fetch:async url=>{llamadas.push(url);return Response.json(falla?{error:'error'}:{ok:true,corrida_completa:!incompleta},{status:falla?502:200})}});
 vm.runInContext(source,scope);
 return {llamadas,actualizaciones,registros,run:(body={})=>handler(new Request('https://example.com',{method:'POST',headers:{'x-webhook-secret':'webhook'},body:JSON.stringify(body)}))};
}
test('primera corrida sincroniza antes de enviar el reporte; siguientes intentos no duplican',async()=>{
 const primera=preparar();assert.equal((await primera.run()).status,200);assert.equal(primera.llamadas.length,2);assert.match(primera.llamadas[0],/sincronizar-propiedades/);
 const repetida=preparar({actualizada:true,enviada:true});assert.equal((await repetida.run()).status,200);assert.equal(repetida.llamadas.length,0);
});
test('reintentar un correo no repite la sincronizacion; una falla de fuente no envia reporte',async()=>{
 const correo=preparar({actualizada:true});await correo.run();assert.equal(correo.llamadas.length,1);assert.match(correo.llamadas[0],/enviar-reporte/);
 const fuente=preparar({falla:true});assert.equal((await fuente.run()).status,502);assert.equal(fuente.llamadas.length,1);
 const parcial=preparar({incompleta:true});assert.equal((await parcial.run()).status,502);assert.equal(parcial.llamadas.length,1);assert.equal(parcial.actualizaciones.length,1);
});
test('rechaza disparos sin secreto antes de consultar datos',async()=>{
 const scope=vm.createContext({Response,Deno:{env:{get:()=>''}},secureServe:(o,h)=>scope.handler=h});vm.runInContext(source,scope);const r=await scope.handler(new Request('https://example.com'));assert.equal(r.status,401);
});

test('registra la lectura programada y permite probar el mismo flujo sin enviar correos',async()=>{
 const prueba=preparar();
 const response=await prueba.run({solo_sincronizar:true});
 assert.equal(response.status,200);
 assert.equal(prueba.llamadas.length,1);
 assert.match(prueba.llamadas[0],/sincronizar-propiedades/);
 assert.equal(prueba.registros.length,1);
 const log=JSON.parse(prueba.registros[0][1]);
 assert.equal(log.solo_sincronizar,true);
 assert.equal(log.corrida_completa,true);
 assert.equal(log.corte,'2026-10-08T06:00:00.000Z');
});

test('cada periodo hace una lectura nueva aunque ya haya lectura y reporte del periodo anterior',async()=>{
 for(const ahora of ['2026-10-08T18:00:00Z','2026-10-09T06:00:00Z']){
  const siguiente=preparar({actualizada:true,enviada:true,ahora});
  assert.equal((await siguiente.run()).status,200);assert.equal(siguiente.llamadas.length,2);
 }
});

test('los cortes corresponden a medianoche y mediodia de Ciudad de Mexico',()=>{
 const scope=vm.createContext({Date,Response,Deno:{env:{get:()=>''}},secureServe(){}});vm.runInContext(source,scope);
 const casos=[['2026-10-22T05:59:59Z','2026-10-21T18:00:00Z'],['2026-10-22T06:00:00Z','2026-10-22T06:00:00Z'],['2026-10-22T17:59:59Z','2026-10-22T06:00:00Z'],['2026-10-22T18:00:00Z','2026-10-22T18:00:00Z'],['2026-10-23T00:30:00Z','2026-10-22T18:00:00Z']];
 for(const [fecha,corte] of casos)assert.equal(scope.corteLectura(new Date(fecha)),Date.parse(corte));
});

test('los reintentos completan fichas de Premier aunque el catálogo y el correo ya estén al día',async()=>{
 const retry=preparar({actualizada:true,enviada:true,pendientesPremier:true});
 assert.equal((await retry.run()).status,200);
 assert.equal(retry.llamadas.length,1);
 assert.match(retry.llamadas[0],/sincronizar-propiedades/);
 const done=preparar({actualizada:true,enviada:true,pendientesPremier:false});
 assert.equal((await done.run()).status,200);
 assert.equal(done.llamadas.length,0);
});
