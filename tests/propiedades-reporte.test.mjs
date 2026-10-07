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
