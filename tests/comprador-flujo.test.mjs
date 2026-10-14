import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import '../assets/js/comprador-matches.js';
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
  await db.exec(`alter table propiedades add column asesor_kw_id text,add column calle text,add column cp text,add column pais text,add column descripcion text,add column caracteristicas jsonb;
   create or replace view propiedades_inventario with(security_invoker=true) as select * from propiedades;
   create function propiedad_tipos_filtro(text,text) returns text[] language sql immutable as $$select array[$1]$$;`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261003210800_comprador_carrusel_cuatro.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261003215055_comprador_catalogo_directo_y_tarjetas.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261014223000_comprador_zonas_estrictas.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261014225821_comprador_tipo_validado_y_prioridades.sql',import.meta.url),'utf8'));
  await db.exec(`alter table propiedades add column lat numeric,add column lng numeric,add column updated_at timestamptz;
   create function propiedad_poligono(jsonb) returns polygon language sql immutable as $$select null::polygon$$;`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261005050009_propiedades_filtros_multiples.sql',import.meta.url),'utf8').split('do $$')[0]);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261008160536_correos_utf8_estados_cdmx.sql',import.meta.url),'utf8').split('do $$')[0]);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261014155225_propiedades_operacion_por_texto.sql',import.meta.url),'utf8').split('-- Mantener')[0]);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261014232939_comprador_busqueda_unificada_y_cercania.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261014233223_optimizar_filtro_compartido_comprador.sql',import.meta.url),'utf8'));
  await db.exec(`set test.uid='${a}';set role authenticated;`);
  const {rows:[cliente]}=await db.query(`insert into perfiles_comprador(nombre,telefono,operacion,tipos,precio_max,estado) values('Cliente','555','venta',array['Casa'],3000000,'CDMX') returning id`);
  await db.exec('reset role');
  const {rows:[p]}=await db.query(`insert into propiedades(id,titulo,estatus,imagenes,tipo,operacion,estado,precio,moneda,fuente) values(gen_random_uuid(),'Propiedad completa','publicada','["https://foto.example/a.jpg"]','Casa','venta','CDMX',2800000,'MXN','kwmexico') returning id`);
  const {rows:[e]}=await db.query('select revision from comprador_estados where perfil_id=$1',[cliente.id]);
  const resultados=JSON.stringify([{propiedad_id:p.id,porcentaje:100,categoria:'fuertes',criterios:[]}]);
  await db.query('select comprador_guardar_resultados($1,$2,$3)',[cliente.id,e.revision,resultados]);
  assert.equal((await db.query('select notificado_at from comprador_resultados')).rows[0].notificado_at,null);
  await db.exec(`set role authenticated;set test.uid='${a}'`);
  await assert.rejects(db.query("select * from comprador_catalogo_calculo('CDMX','venta',0)"));
  assert.equal((await db.query('select * from comprador_matches_pagina($1,80,0)',[cliente.id])).rows.length,1);
  await db.exec(`set test.uid='${b}'`);
  assert.equal((await db.query('select * from comprador_matches_pagina($1,80,0)',[cliente.id])).rows.length,0);
  await db.exec(`reset role;update comprador_estados set pendiente=true,motivo='inventario';set role authenticated;set test.uid='${a}'`);
  assert.equal((await db.query('select * from comprador_matches_pagina($1,80,0)',[cliente.id])).rows.length,1);
  await db.query('update perfiles_comprador set activo=false where id=$1',[cliente.id]);
  assert.equal((await db.query('select * from comprador_matches_pagina($1,80,0)',[cliente.id])).rows.length,0);
  await db.exec('reset role');
  assert.equal((await db.query('select comprador_guardar_resultados($1,$2,$3) ok',[cliente.id,e.revision,resultados])).rows[0].ok,false);
  // Guardado real de varias zonas, alternativas y exclusiones con el motor compartido.
  const colonias=[{estado:'CDMX',municipio:'Benito Juárez',colonia:'Del Valle'},{estado:'CDMX',municipio:'Coyoacán',colonia:'Del Carmen'}];
  await db.query(`update perfiles_comprador set activo=true,municipios=array['Benito Juárez','Coyoacán'],colonias_seleccionadas=$2,recamaras_min=3 where id=$1`,[cliente.id,JSON.stringify(colonias)]);
  await db.query(`update propiedades set municipio='Benito Juárez',colonia='Del Valle',recamaras=3 where id=$1`,[p.id]);
  const propiedades=[
   ['Otra zona','Casa','Cuauhtémoc','Roma Norte',2800000,3],
   ['Otra característica','Casa','Coyoacán','Del Carmen',2800000,1],
   ['Otro presupuesto','Casa','Coyoacán','Del Carmen',3100000,3],
   ['Exclusiva Oficina Corporativa en El Wtc Piso 19 con Baño Privado','Casa','Benito Juárez','Del Valle',2800000,3],
   ['Fuera de ciudad','Casa','Benito Juárez','Del Valle',2800000,3]
  ];
  const filas=[];
  for(const [titulo,tipo,municipio,colonia,precio,recamaras] of propiedades) {
   const {rows:[fila]}=await db.query(`insert into propiedades(id,titulo,tipo,municipio,colonia,precio,recamaras,estado,moneda,operacion,estatus,fuente) values(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,'MXN','venta','publicada','kwmexico') returning *`,[titulo,tipo,municipio,colonia,precio,recamaras,titulo==='Fuera de ciudad'?'Jalisco':'CDMX']);filas.push(fila);
  }
  const c=(await db.query('select * from perfiles_comprador where id=$1',[cliente.id])).rows[0];
  assert.equal(filas[3].tipo_comprador,'Oficina');
  for(const [tipo,titulo] of [['Casa','Local comercial en venta'],['Departamento','Casa en venta con jardin'],['Casa','Casa con oficina y cerca de locales'],['Casa','Casa adaptada para oficinas'],['Oficina','En venta en colonia Casa Blanca'],['Casa','Exclusivo PH en Napoles'],['Casa','Terreno para construir casas']]) {
   assert.equal((await db.query('select comprador_tipo_validado($1,$2) tipo',[tipo,titulo])).rows[0].tipo,globalThis.kwCompradorMatches.tipoValidado(tipo,titulo));
  }
  assert.equal((await db.query(`select comprador_categoria_valida(c,p,'otras_caracteristicas',79) ok from perfiles_comprador c,propiedades p where c.id=$1 and p.id=$2`,[cliente.id,filas[0].id])).rows[0].ok,false);
  assert.equal((await db.query(`select comprador_categoria_valida(c,p,'fuertes',100) ok from perfiles_comprador c,propiedades p where c.id=$1 and p.id=$2`,[cliente.id,filas[0].id])).rows[0].ok,false);
  assert.equal((await db.query(`select comprador_categoria_valida(c,p,'otras_zonas',79) ok from perfiles_comprador c,propiedades p where c.id=$1 and p.id=$2`,[cliente.id,p.id])).rows[0].ok,false);
  const todas=(await db.query('select * from propiedades')).rows;
  const calculados=todas.flatMap(p=>{const m=globalThis.kwCompradorMatches.evaluar(c,p);return m?[{propiedad_id:p.id,...m}]:[];});
  // Un resultado de oficina manipulado tampoco se acepta en la base de datos.
  calculados.push({propiedad_id:filas[3].id,porcentaje:100,categoria:'fuertes',criterios:[]});
  const revision=(await db.query('select revision from comprador_estados where perfil_id=$1',[cliente.id])).rows[0].revision;
  await db.query('select comprador_guardar_resultados($1,$2,$3)',[cliente.id,revision,JSON.stringify(calculados)]);
  assert.deepEqual((await db.query('select niveles from comprador_estados where perfil_id=$1',[cliente.id])).rows[0].niveles,{'80':1,'-1':1,'-2':1,'-3':1});
  assert.equal((await db.query('select count(*)::int n from comprador_resultados where vigente')).rows[0].n,4);
  assert.equal((await db.query("select count(*)::int n from comprador_catalogo_candidatos('CDMX','venta',array['Casa'],'MXN',0,3000000,0)")).rows[0].n,4);
  await db.exec(`set role authenticated;set test.uid='${a}'`);
  assert.equal((await db.query('select * from comprador_matches_pagina($1,-1,0)',[cliente.id])).rows.length,1);
  await assert.rejects(db.query("select * from comprador_catalogo_candidatos('CDMX','venta',array['Casa'],'MXN',0,3000000,0)"));
  await db.exec(`set test.uid='${b}'`);
  assert.equal((await db.query('select * from comprador_matches_pagina($1,-1,0)',[cliente.id])).rows.length,0);
  await db.exec('reset role');
  const resumen=(await db.query("select pg_get_functiondef('private.comprador_enviar_resumenes()'::regprocedure) def")).rows[0].def;
  await db.exec(resumen.replace("if extract(hour from now() at time zone 'America/Mexico_City')<>9 then return 0; end if;",'if false then return 0; end if;'));
  assert.equal((await db.query('select private.comprador_enviar_resumenes() n')).rows[0].n,1);
  const avisos=(await db.query('select mensaje from notificaciones')).rows;
  assert.equal(avisos.length,1);assert.match(avisos[0].mensaje,/1 nuevas coincidencias/);
  assert.equal((await db.query("select count(*)::int n from comprador_resultados where categoria<>'fuertes' and notificado_at is not null")).rows[0].n,0);
  assert.equal((await db.query('select private.comprador_enviar_resumenes() n')).rows[0].n,0);
  await db.query('update perfiles_comprador set municipios=$2,colonias_seleccionadas=$3 where id=$1',[cliente.id,['Cuauhtémoc'],JSON.stringify([{estado:'CDMX',municipio:'Cuauhtémoc',colonia:'Roma Norte'}])]);
  const rev2=(await db.query('select revision from comprador_estados where perfil_id=$1',[cliente.id])).rows[0].revision;
  await db.query('select comprador_guardar_resultados($1,$2,$3)',[cliente.id,rev2,JSON.stringify([{propiedad_id:filas[0].id,porcentaje:100,categoria:'fuertes',criterios:[]}])]);
  assert.equal((await db.query('select notificado_at from comprador_resultados where propiedad_id=$1',[filas[0].id])).rows[0].notificado_at,null);
  assert.equal((await db.query('select private.comprador_enviar_resumenes() n')).rows[0].n,1);
  // Igualar los cinco resultados del filtro normal, incluyendo alias de ciudad y operación inferida.
  await db.query(`update perfiles_comprador set municipios=array['Zona prueba'],colonias_seleccionadas='[]',recamaras_min=null,banos_min=null,estacionamientos_min=null,superficie_min=null,precio_min=null where id=$1`,[cliente.id]);
  for(let i=0;i<5;i++) await db.query(`insert into propiedades(id,titulo,tipo,municipio,colonia,precio,estado,moneda,operacion,estatus,fuente,lat,lng) values(gen_random_uuid(),$1,$2,'Zona prueba','Centro',2500000,'Ciudad de México','MXN',$3,'publicada','kwmexico',19.4,-99.16)`,['Casa en venta prueba '+i,i===0?'Oficina':'Casa',i===4?null:'venta']);
  for(const [titulo,lat,lng] of [['Casa cercana',19.405,-99.16],['Casa lejana',20.1,-99.16],['Casa sin coordenadas',0,0]]) await db.query(`insert into propiedades(id,titulo,tipo,municipio,colonia,precio,estado,moneda,operacion,estatus,fuente,lat,lng) values(gen_random_uuid(),$1,'Casa','Otra zona','Otra',2500000,'CDMX','MXN','venta','publicada','kwmexico',$2,$3)`,[titulo,lat,lng]);
  const cp=(await db.query('select * from perfiles_comprador where id=$1',[cliente.id])).rows[0];
  const filtro=(await db.query('select comprador_filtros(c) f from perfiles_comprador c where id=$1',[cliente.id])).rows[0].f;
  const directas=(await db.query('select id from propiedades_inventario_filtradas($1)',[JSON.stringify(filtro)])).rows.map(p=>p.id).sort();
  const candidatos=(await db.query('select * from comprador_candidatos_perfil($1,0)',[cliente.id])).rows;
  const matches=candidatos.flatMap(p=>{const m=globalThis.kwCompradorMatches.evaluar(cp,p);return m?[{propiedad_id:p.id,...m}]:[];});
  assert.equal(directas.length,5);
  assert.deepEqual(matches.filter(m=>m.categoria==='fuertes').map(m=>m.propiedad_id).sort(),directas);
  const cerca=candidatos.find(p=>p.titulo==='Casa cercana'),lejos=candidatos.find(p=>p.titulo==='Casa lejana'),sin=candidatos.find(p=>p.titulo==='Casa sin coordenadas');
  assert(Number(cerca.distancia_km)>.5&&Number(cerca.distancia_km)<.6);
  assert.equal(globalThis.kwCompradorMatches.evaluar(cp,cerca).categoria,'zonas_cercanas');
  assert.equal(lejos.distancia_km,null);assert.equal(sin.distancia_km,null);
  assert.equal(globalThis.kwCompradorMatches.evaluar(cp,lejos).categoria,'otras_zonas');
  const rev3=(await db.query('select revision from comprador_estados where perfil_id=$1',[cliente.id])).rows[0].revision;
  await db.query('select comprador_guardar_resultados($1,$2,$3)',[cliente.id,rev3,JSON.stringify(matches)]);
  const cercanas=(await db.query('select * from comprador_matches_pagina($1,-4,0)',[cliente.id])).rows;
  assert.equal(cercanas.length,1);assert(Number(cercanas[0].propiedad.distancia_km)<2);
  await db.query('select private.comprador_enviar_resumenes()');
  assert.equal((await db.query("select count(*)::int n from comprador_resultados where categoria='zonas_cercanas' and notificado_at is not null")).rows[0].n,0);
 } finally {await db.close();}
});
