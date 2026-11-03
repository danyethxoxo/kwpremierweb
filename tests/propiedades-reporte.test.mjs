import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/enviar-reporte-propiedades/index.ts',import.meta.url),'utf8').replace(/^import[^\r\n]*\r?\n/gm,''),{mode:'strip'});
function preparar(anterior) {
 const filtros=[];
 const historial=[
  {propiedad_id:'alta',tipo:'alta',estatus_anterior:null,estatus_nuevo:'publicada'},
  {propiedad_id:'baja',tipo:'cambio',estatus_anterior:'publicada',estatus_nuevo:'suspendida'},
  {propiedad_id:'reactiva',tipo:'cambio',estatus_anterior:'suspendida',estatus_nuevo:'publicada'},
  {propiedad_id:'editada',tipo:'cambio',estatus_anterior:'publicada',estatus_nuevo:'publicada'},
  {propiedad_id:'editada',tipo:'cambio',estatus_anterior:'publicada',estatus_nuevo:'publicada'},
 ];
 const admin={from(tabla){let estatus;const q={select(){return q},eq(k,v){if(k==='estatus')estatus=v;return q},gt(k,v){filtros.push(['gt',k,v]);return q},lte(k,v){filtros.push(['lte',k,v]);return q},order(){return q},limit(){return q},range(){return q},async maybeSingle(){return {data:tabla==='propiedades_sync'?{ultima_corrida:'2026-10-04T15:00:00Z',propiedades_afectadas:7401}:anterior}},then(ok,bad){return Promise.resolve(tabla==='propiedades_historial'?{data:historial}:{count:estatus==='publicada'?7401:estatus==='suspendida'?289:7690}).then(ok,bad)}};return q}};
 const scope=vm.createContext({Deno:{env:{get:()=>''}},secureServe:()=>{},Date,Response,console,Map});vm.runInContext(source,scope);return {scope,admin,filtros};
}
test('reporte cubre cambios desde el último corte, incluidos los anteriores a la última corrida',async()=>{
 const m=preparar({periodo_hasta:'2026-10-03T15:01:00Z',enviado_at:'2026-10-03T15:02:00Z'}),r=await m.scope.prepararReporte(m.admin);
 assert.equal(m.filtros[0][2],'2026-10-03T15:01:00Z');assert.equal(m.filtros[1][2],r.periodoHasta);
 assert.equal(r.nuevas.length,1);assert.equal(r.desactivadas.length,1);assert.equal(r.reactivadas.length,1);assert.equal(r.modificadas.length,1);assert.equal(r.inventarioAnterior,7400);
 assert.equal(r.historial.length,5);assert.equal(r.historial.filter(item=>item.propiedad_id==='editada').length,2);
});
test('reportes históricos usan fecha de envío; primer reporte cubre 24 horas',async()=>{
 const antiguo=preparar({enviado_at:'2026-10-03T15:02:00Z'});const r=await antiguo.scope.prepararReporte(antiguo.admin);assert.equal(r.periodoDesde,'2026-10-03T15:02:00Z');
 const primero=preparar(null),p=await primero.scope.prepararReporte(primero.admin);assert.equal(Date.parse(p.periodoHasta)-Date.parse(p.periodoDesde),86400000);
});

test('distingue comprobación de fecha de origen y avisa cuando KW no trae fechas recientes',()=>{
 const {scope}=preparar(null);
 assert.match(scope.avisoDeFuente('2026-10-29T00:00:00Z','2026-11-03T06:00:00Z'),/29 de octubre de 2026/);
 assert.equal(scope.avisoDeFuente('2026-11-02T00:00:00Z','2026-11-03T06:00:00Z'),null);
 assert.match(scope.avisoDeFuente(null,'2026-11-03T06:00:00Z'),/no proporciona/);
 assert.match(scope.avisoDeFuente('inválida','2026-11-03T06:00:00Z'),/no proporciona/);
});

test('Excel y correo muestran la comprobación y la advertencia sin presentar datos antiguos como actualizados',async()=>{
 const m=preparar(null),r=await m.scope.prepararReporte(m.admin);r.ultimaFechaOrigen='2026-10-29T00:00:00Z';r.avisoFuente=m.scope.avisoDeFuente(r.ultimaFechaOrigen,'2026-11-03T06:00:00Z');
 r.historial.forEach(h=>h.registrado_at='2026-10-04T15:00:00Z');
 let sheets;m.scope.buildXlsx=s=>{sheets=s;return new Uint8Array(0)};m.scope.reporteXlsx(r);
 const labels=sheets[0].rows.flat().map(c=>c.value);assert.ok(labels.includes('Última comprobación:'));assert.ok(labels.includes(r.avisoFuente));assert.ok(!labels.includes('Última actualización:'));
 let template;m.scope.plantillaCorreo=options=>{template=options;return 'html'};const correo=m.scope.armarCorreo(r);
 assert.equal(template.note,r.avisoFuente);assert.match(correo.texto,/Última comprobación:/);assert.match(correo.texto,/29 de octubre de 2026/);assert.doesNotMatch(correo.texto,/Última actualización:/);
});

test('vista previa interna nunca envía correo ni reclama un envío y el webhook no autoriza envíos',async()=>{
 let handler;const scope=vm.createContext({Deno:{env:{get:k=>({SUPABASE_URL:'https://example.test',SERVICE_ROLE_KEY:'test-service',SYNC_SECRET:'test-sync',WEBHOOK_SECRET:'test-hook'})[k]}},Response,Date,console,createClient:()=>({}),secureServe:(o,h)=>handler=h,enviarCorreo:()=>{throw Error('No debe enviar')}});vm.runInContext(source,scope);
 scope.prepararReporte=async()=>({ultimaCorrida:'2026-11-03',ultimaFechaOrigen:'2026-10-29',avisoFuente:'Fuente por revisar',nuevas:[],reactivadas:[],desactivadas:[],modificadas:[],publicadasActuales:7474});
 const request=(preview,secret='test-hook')=>new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json','x-webhook-secret':secret},body:JSON.stringify({vista_previa:preview})});
 const r=await handler(request(true));assert.equal(r.status,200);assert.equal((await r.json()).vista_previa,true);
 assert.equal((await handler(request(false))).status,401);assert.equal((await handler(request(true,'wrong'))).status,401);
});
