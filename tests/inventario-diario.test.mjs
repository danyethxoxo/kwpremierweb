import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/inventario-diario/index.ts',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,''),{mode:'strip'});
function preparar({actualizada=false,enviada=false,falla=false,incompleta=false,ahora='2026-10-08T09:20:00Z'}={}) {
 const llamadas=[],actualizaciones=[];
 let handler;
 class Reloj extends Date {constructor(...args){super(...(args.length?args:[ahora]));}}
 const admin={from(table){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},async maybeSingle(){return {data:table==='propiedades_sync'?{ultimo_cursor:actualizada?'2026-10-08T09:01:00Z':'2026-10-07T09:01:00Z',ultimo_error:null}:enviada?{enviado_at:'2026-10-08T09:02:00Z'}:null}},update(v){actualizaciones.push(v);return q},then(ok){return Promise.resolve({error:null}).then(ok)}};return q}};
 const scope=vm.createContext({Date:Reloj,Intl,Response,AbortSignal,console:{error(){}},Deno:{env:{get:k=>({SUPABASE_URL:'https://example.com',SERVICE_ROLE_KEY:'service',WEBHOOK_SECRET:'webhook',SYNC_SECRET:'sync'})[k]}},createClient:()=>admin,secureServe:(o,h)=>handler=h,enviarCorreo:async()=>{},fetch:async url=>{llamadas.push(url);return Response.json(falla?{error:'error'}:{ok:true,corrida_completa:!incompleta},{status:falla?502:200})}});
 vm.runInContext(source,scope);
 return {llamadas,actualizaciones,run:()=>handler(new Request('https://example.com',{method:'POST',headers:{'x-webhook-secret':'webhook'}}))};
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
