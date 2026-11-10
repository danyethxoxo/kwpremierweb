import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const code=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/sincronizar-propiedades/index.ts',import.meta.url),'utf8').replace(/^import[^\r\n]*\r?\n/gm,''));
function setup(){const s=vm.createContext({Deno:{env:{get:()=>undefined}},secureServe(){},Map,Set,Response,console});vm.runInContext(code,s);return s;}
test('reconoce los cambios de ubicación y de asesor aunque precio y estatus sigan iguales',()=>{
 const s=setup(),old={ID:842678,Title:'Casa',Current_Price:11990000,Property_Status_ID:1};
 for(const field of ['Geo_Estado','Geo_Municipio','Geo_Colonia','Geo_Calle','Geo_Num_Calle','Geo_Codigo_Postal','Geo_Direccion_Completa','Geo_Pais','Colony','Street_Number','Postal_Code','Country','Currency','Agent_ID','Property_Command_ID','Building_Area','Construction_Area']){
  assert.equal(s.kwCambioListado({...old,[field]:'nuevo'},old),true,field);
 }
 assert.equal(s.kwCambioListado({...old},old),false);
});
test('repara superficies desactualizadas sin necesitar un cambio en el listado crudo',()=>{
 const s=setup(),listado={ID:10,Living_Area:900,Lot_Size_Area:800,Property_Status_ID:1};
 const existente={estatus:'publicada',m2_construccion:null,m2_terreno:800,datos_origen:{listado}};
 assert.equal(s.kwRequiereRepararSuperficie(listado,existente),true);
 assert.equal(s.listadoKwRequiereGuardar(listado,existente,new Map(),new Map()),true);
 assert.equal(s.kwRequiereRepararSuperficie(listado,{...existente,m2_construccion:900}),false);
 assert.equal(s.kwRequiereRepararSuperficie({...listado,Living_Area:null},{...existente,m2_construccion:900}),false,'no borra una superficie con un nulo de origen');
 assert.equal(s.kwRequiereRepararSuperficie({Building_Area:123},{m2_construccion:100}),true);
});
test('una reparación de superficie conserva la galería completa; una ficha cambiada queda pendiente',()=>{
 const s=setup(),listado={ID:10,Living_Area:900},detalle={success:true,data:{Property_Data:[],Property_Photos:[{Photo_URL:'https://ejemplo.com/foto.jpg'}]}};
 const existente={datos_origen:{listado,detalle,detalle_pendiente:false}};
 const repaired=s.normalizarDetallePendiente(listado,existente,new Map());
 assert.equal(repaired.datos_origen.detalle_pendiente,false);
 assert.equal(repaired.datos_origen.detalle,detalle);
 assert.equal(s.normalizarDetallePendiente({...listado,Geo_Calle:'Calle nueva'},existente,new Map()).datos_origen.detalle_pendiente,true);
 assert.equal(s.normalizarDetallePendiente(listado,undefined,new Map()).datos_origen.detalle_pendiente,true);
});
test('un catálogo incompleto o con IDs repetidos no actualiza ni desactiva propiedades',async()=>{
 for(const catalog of [{propiedades:[{ID:1}],total:2,completa:false},{propiedades:[{ID:1},{ID:1}],total:2,completa:true}]){
  const s=setup(),tables=[];s.traerCatalogoKwMexico=async()=>catalog;
  const response=await s.sincronizarKwMexico({from(name){tables.push(name);return {upsert:async()=>({error:null})}}},'2026-11-10T18:00:00Z');
  assert.equal(response.status,502);assert.deepEqual(tables,['propiedades_sync']);
 }
});

