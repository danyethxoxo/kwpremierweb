import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/sincronizar-propiedades/index.ts',import.meta.url),'utf8').replace(/^import[^\r\n]*\r?\n/gm,''));
function setup(){const scope=vm.createContext({Deno:{env:{get:()=>undefined}},secureServe(){},Map,Set});vm.runInContext(source,scope);return scope;}
test('prioriza agentes sin nombre y Premier, con una propiedad por agente y límite estricto',()=>{
 const s=setup();const pendientes=[
  {listado:{ID:1,Agent_ID:10,Market_Center_ID:1},existente:{asesor_nombre:'Conocido'}},
  {listado:{ID:2,Agent_ID:20,Market_Center_ID:1},existente:{}},
  {listado:{ID:3,Agent_ID:30,Market_Center_ID:21},existente:{}},
  {listado:{ID:4,Agent_ID:30,Market_Center_ID:21},existente:{}},
  {listado:{ID:5,Agent_ID:40,Market_Center_ID:21},existente:undefined},
 ];
 const result=s.priorizarDetallesKw(pendientes,3);assert.deepEqual(Array.from(result,p=>p.listado.ID),[3,5,2]);
 assert.equal(s.priorizarDetallesKw(pendientes,0).length,0);
 const full=s.priorizarDetallesKw(pendientes,25);assert.equal(full.length,5);assert.equal(new Set(full.map(p=>p.listado.ID)).size,5);
 const selected=new Set(result.map(p=>String(p.listado.ID)));assert.deepEqual(pendientes.filter(p=>!selected.has(String(p.listado.ID))).map(p=>p.listado.ID),[1,4]);
});
test('extrae el asesor de la ficha aunque el listado general no lo incluya',()=>{
 const s=setup();const fila=s.normalizarKwMexico({ID:782702,Agent_ID:696,Market_Center_ID:21},
  {success:true,data:{Property_Data:[],Property_Agent:[{ID:696,First_Name:'ELIZABETH',Last_Name:'ROBLES BONILLA',Agent_Command_ID:557233,Email:'elizabeth.robles@kwmexico.mx'}]}},new Map([['21','KW PREMIER']]));
 assert.equal(fila.asesor_nombre,'ELIZABETH ROBLES BONILLA');assert.equal(fila.asesor_kw_id,'557233');assert.equal(fila.asesor_email,'elizabeth.robles@kwmexico.mx');
});

test('no reescribe miles de pendientes sin cambios; sí guarda altas, cambios y asesores recuperados',()=>{
 const s=setup(),listado={ID:1,Agent_ID:696,Property_Status_ID:1,Title:'Casa'},existing={estatus:'publicada',asesor_nombre:'ELIZABETH ROBLES BONILLA',asesor_kw_id:'557233',datos_origen:{listado,detalle:null,detalle_pendiente:true}},names=new Map([['696','ELIZABETH ROBLES BONILLA']]),ids=new Map([['696','557233']]);
 assert.equal(s.listadoKwRequiereGuardar(listado,existing,names,ids),false);
 assert.equal(s.listadoKwRequiereGuardar(listado,undefined,names,ids),true);
 assert.equal(s.listadoKwRequiereGuardar({...listado,Title:'Casa nueva'},existing,names,ids),true);
 assert.equal(s.listadoKwRequiereGuardar(listado,{...existing,asesor_nombre:null},names,ids),true);
 assert.equal(s.listadoKwRequiereGuardar(listado,{...existing,asesor_kw_id:null},names,ids),true);
});

test('las fichas conocidas de Premier se completan antes del rezago de otros centros',()=>{
 const s=setup(),pendientes=Array.from({length:100},(_,i)=>({listado:{ID:i+1,Agent_ID:i+1,Market_Center_ID:1},existente:{asesor_nombre:'Asesor'}}));
 pendientes.push({listado:{ID:501,Agent_ID:501,Market_Center_ID:21},existente:{asesor_nombre:'Premier'}},{listado:{ID:502,Agent_ID:502,Market_Center_ID:21},existente:{asesor_nombre:'Premier'}});
 assert.deepEqual(Array.from(s.priorizarDetallesKw(pendientes,2),p=>p.listado.ID),[501,502]);
 assert.equal(s.priorizarDetallesKw(pendientes,25).length,25);
});
