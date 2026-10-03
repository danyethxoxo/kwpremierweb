import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import vm from 'node:vm';
test('pagina de propiedades conserva filtros, total, orden y separacion entre paginas',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;
   create function is_staff_or_above() returns boolean language sql stable as $$select false$$;
   create function propiedad_tipos_filtro(text,text) returns text[] language sql immutable as $$select array[$1]$$;
   create table propiedades(id uuid primary key,fuente text,fuente_id text,titulo text,operacion text,estatus text,tipo text,precio numeric,moneda text,
    recamaras int,banos numeric,estacionamientos int,m2_construccion numeric,m2_terreno numeric,calle text,colonia text,municipio text,estado text,cp text,pais text,
    imagenes jsonb,miniatura_url text,caracteristicas jsonb,asesor_id uuid,asesor_nombre text,market_center text,updated_at timestamptz,enlace_kw text,asesor_kw_id text);
   alter table propiedades enable row level security;
   create policy select_publicadas on propiedades for select to authenticated using(true);
   create policy inventario on propiedades for select to authenticated using(position('propiedades_inventario' in current_setting('request.path',true))>0);
   grant usage on schema auth,public to authenticated;
   grant select on propiedades to authenticated;
   create view propiedades_inventario with(security_invoker=true) as select * from propiedades;
   grant select on propiedades_inventario to authenticated;
   insert into propiedades(id,fuente,titulo,operacion,estatus,tipo,precio,estado,municipio,imagenes,updated_at)
    select gen_random_uuid(),'kwmexico','Casa '||n,'venta',case when n<=45 then 'publicada' else 'suspendida' end,'Casa',n*1000,
     case when n%2=0 then 'Jalisco' else 'CDMX' end,'Municipio','[]',now()-n*interval '1 minute' from generate_series(1,50) n;`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261003205838_propiedades_permisos_por_consulta.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261003212106_propiedades_filtros_vacios.sql',import.meta.url),'utf8'));
  await db.exec("set request.path='/rpc/propiedades_inventario_pagina';set role authenticated");
  const page=async(filters={},n=1)=>(await db.query('select propiedades_inventario_pagina($1,$2) r',[JSON.stringify(filters),n])).rows[0].r;
  const first=await page({estatus:'publicada'}),second=await page({estatus:'publicada'},2),last=await page({estatus:'publicada'},3);
  const vacios=await page({estatus:'publicada',minimo:0,maximo:0,recamaras:0,recamarasMax:0,banos:0,estacionamientos:0,m2Min:0,m2Max:0});
  assert.equal(vacios.total,45);assert.equal(vacios.data.length,20);
  assert.equal(first.total,45);assert.equal(first.data.length,20);assert.equal(last.data.length,5);
  assert.equal(new Set(first.data.concat(second.data).map(p=>p.id)).size,40);
  const filtered=await page({estatus:'publicada',estado:'CDMX',minimo:10000,maximo:19000,tipo:'Casa',orden:'precio-desc'});
  assert.equal(filtered.total,5);assert.equal(Number(filtered.data[0].precio),19000);
  assert(filtered.data.every(p=>p.estado==='CDMX' && p.estatus==='publicada'));
  assert.equal((await page({estatus:'inactiva'})).total,5);
  assert.equal((await page({texto:'Casa 45'})).total,1);
  await db.exec('reset role;set role anon');
  await assert.rejects(page({estatus:'publicada'}));
 }finally{await db.close();}
});
test('carga de propiedades reintenta fallos transitorios y traduce el total del RPC',async()=>{
 const html=readFileSync(new URL('../propiedades.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('  var controladorCargaServidor'),html.indexOf('  function opcionesCatalogoActualizadas'));
 let calls=0;const sb={rpc:()=>({abortSignal:async()=>++calls===1?{status:503,error:{code:'57014'}}:{data:{data:[{id:'propiedad'}],total:7401}}})};
 const scope=vm.createContext({sb,solicitudPaginaServidor:1,AbortController,setTimeout,clearTimeout});vm.runInContext(source,scope);
 const r=await scope.consultaPaginaServidor(1,{estatus:'publicada'});assert.equal(calls,2);assert.equal(r.count,7401);assert.equal(r.data[0].id,'propiedad');
});

test('formulario sin números envía filtros nulos al servidor',()=>{
 const html=readFileSync(new URL('../propiedades.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('  function leerFiltrosServidor()'),html.indexOf('  function filtrosServidorActuales()'));
 const scope=vm.createContext({val:()=>'',num:()=>0,ubicacionColonia:()=>null});vm.runInContext(source,scope);
 const filtros=scope.leerFiltrosServidor();
 for(const campo of ['minimo','maximo','recamaras','recamarasMax','banos','estacionamientos','m2Min','m2Max']) assert.equal(filtros[campo],null);
});
