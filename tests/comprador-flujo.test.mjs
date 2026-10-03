import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
test('coincidencias: primera alerta pendiente, aislamiento, revision y pausa',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
   grant usage on schema auth,public to authenticated;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create table profiles(id uuid primary key);insert into profiles values('${a}'),('${b}');
   create table propiedades(id uuid primary key,fuente_id text,fuente text,titulo text,operacion text,estatus text,tipo text,precio numeric,moneda text,
    recamaras int,banos numeric,estacionamientos int,m2_construccion numeric,m2_terreno numeric,colonia text,municipio text,estado text,imagenes jsonb,
    miniatura_url text,asesor_nombre text,market_center text,enlace_kw text);
   create view propiedades_inventario with(security_invoker=true) as select * from propiedades;
   grant select on propiedades,propiedades_inventario to authenticated;
   create table notificaciones(id uuid default gen_random_uuid(),user_id uuid,tipo text,titulo text,mensaje text,url text);`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20260930194917_perfiles_comprador.sql',import.meta.url),'utf8'));
  const original=readFileSync(new URL('../supabase/migrations/20261001001343_comprador_matches_guardados.sql',import.meta.url),'utf8');
  await db.exec(original.slice(0,original.indexOf('-- SCHEDULE:')));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261003201850_comprador_carga_ligera_y_avisos.sql',import.meta.url),'utf8'));
  await db.exec(`set test.uid='${a}';set role authenticated;`);
  const {rows:[cliente]}=await db.query(`insert into perfiles_comprador(nombre,telefono,operacion,tipos,precio_max,estado) values('Cliente','555','venta',array['Casa'],3000000,'CDMX') returning id`);
  await db.exec('reset role');
  const {rows:[p]}=await db.query(`insert into propiedades(id,titulo,estatus,imagenes) values(gen_random_uuid(),'Propiedad completa','publicada','["https://foto.example/a.jpg"]') returning id`);
  const {rows:[e]}=await db.query('select revision from comprador_estados where perfil_id=$1',[cliente.id]);
  const resultados=JSON.stringify([{propiedad_id:p.id,porcentaje:100,criterios:[]}]);
  await db.query('select comprador_guardar_resultados($1,$2,$3)',[cliente.id,e.revision,resultados]);
  assert.equal((await db.query('select notificado_at from comprador_resultados')).rows[0].notificado_at,null);
  await db.exec(`set role authenticated;set test.uid='${a}'`);
  assert.equal((await db.query('select * from comprador_matches_pagina($1,100,0)',[cliente.id])).rows.length,1);
  await db.exec(`set test.uid='${b}'`);
  assert.equal((await db.query('select * from comprador_matches_pagina($1,100,0)',[cliente.id])).rows.length,0);
  await db.exec(`reset role;update comprador_estados set pendiente=true,motivo='inventario';set role authenticated;set test.uid='${a}'`);
  assert.equal((await db.query('select * from comprador_matches_pagina($1,100,0)',[cliente.id])).rows.length,1);
  await db.query('update perfiles_comprador set activo=false where id=$1',[cliente.id]);
  assert.equal((await db.query('select * from comprador_matches_pagina($1,100,0)',[cliente.id])).rows.length,0);
  await db.exec('reset role');
  assert.equal((await db.query('select comprador_guardar_resultados($1,$2,$3) ok',[cliente.id,e.revision,resultados])).rows[0].ok,false);
 } finally {await db.close();}
});
