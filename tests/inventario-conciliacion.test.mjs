import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
function cargar(nombre,extra={}) {
 const codigo=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/'+nombre+'/index.ts',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,''),{mode:'strip'});
 const scope=vm.createContext({Date,Intl,Response,AbortSignal,URL,console,
  Deno:{env:{get:()=>undefined}},secureServe(){},...extra});
 vm.runInContext(codigo,scope);return scope;
}
test('los reportes acumulan el día y el correo de medianoche incluye el día anterior',()=>{
 const s=cargar('enviar-reporte-propiedades');
 for(const [hora,desde] of [
  ['2026-11-11T06:00:08Z','2026-11-10T06:00:00.000Z'],
  ['2026-11-11T15:44:00Z','2026-11-11T06:00:00.000Z'],
  ['2026-11-11T18:00:00Z','2026-11-11T06:00:00.000Z'],
  ['2026-11-12T05:59:00Z','2026-11-11T06:00:00.000Z'],
  ['2026-01-01T06:00:08Z','2025-12-31T06:00:00.000Z'],
  ['2024-03-01T06:00:08Z','2024-02-29T06:00:00.000Z'],
 ])assert.equal(s.inicioDiaReporte(hora),desde);
});
test('la conciliación exige los mismos IDs, incluso si los totales son iguales',async()=>{
 const filas=[{fuente_id:'1'},{fuente_id:'2'}];
 const admin={from(){const q={select(){return q},eq(){return q},order(){return q},range:async(a,b)=>({data:filas.slice(a,b+1),error:null})};return q;}};
 const s=cargar('sincronizar-propiedades');
 const ok=await s.verificarPublicadasKw(admin,[{ID:1,Property_Status_ID:1},{ID:2,Property_Status_ID:1}]);
 assert.equal(ok.correcta,true);assert.equal(ok.publicadas_web,2);
 await assert.rejects(()=>s.verificarPublicadasKw(admin,[{ID:1,Property_Status_ID:1},{ID:3,Property_Status_ID:1}]),/1 faltantes y 1 activas/);
});
