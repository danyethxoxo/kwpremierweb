import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import vm from 'node:vm';

test('operatividad: dictamen real, contrato posterior, correcciones y controles de acceso',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema private;
      create function public.is_staff_or_above() returns boolean language sql stable as $$select true$$;
      create function private.is_staff_or_above() returns boolean language sql stable as $$select coalesce(current_setting('test.staff',true),'si')='si'$$;
      create function public.mfa_sesion_autorizada() returns boolean language sql stable as $$select coalesce(current_setting('test.mfa',true),'si')='si'$$;
      create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
      create table profiles(id uuid primary key,nombre text,apellido text);
      create table dictamen_asesores(id uuid primary key,nombre text);
      create table dictamenes(id uuid primary key default gen_random_uuid(),asesor_id uuid,estado text,archivado_at timestamptz,
        fecha_dictamen date,inmueble text,folio text,operacion text,tipo_contrato text,uso text,precio_listado numeric,comision_porcentaje numeric,cliente text);
      create table dictamen_clientes(id uuid primary key default gen_random_uuid(),dictamen_id uuid,nombre text,orden int);
      create table documentos_guardados(id uuid primary key default gen_random_uuid(),user_id uuid,tipo_documento text,datos jsonb,
        folio text,estado text,dictamen_id uuid,finalizado_at timestamptz);
      create table propiedades(id uuid primary key default gen_random_uuid(),titulo text,estatus text,fuente_id text,datos_origen jsonb,
        precio numeric,colonia text,municipio text,estado text,cp text);
      grant usage on schema private to authenticated;`);
    await db.exec(readFileSync(new URL('../supabase/sql/072_operatividad.sql',import.meta.url),'utf8'));
    await db.exec(`insert into operatividad(direccion) select 'PRUEBA '||n from generate_series(1,17)n;
      insert into dictamen_asesores(id,nombre) values('11111111-1111-4111-8111-111111111111','Asesor Real');
      insert into dictamenes(asesor_id,estado,fecha_dictamen,inmueble,folio,operacion,tipo_contrato,uso,precio_listado,comision_porcentaje,cliente)
      values ('11111111-1111-4111-8111-111111111111','condicionada','2026-10-01','Inmueble real completo','REAL-001','venta','exclusiva','residencial',2500000,5,'Cliente real');
      insert into dictamenes(estado,inmueble,folio) values('borrador','Borrador','BOR-1'),('cerrado','Prueba antigua','OLD-1');`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261005032700_operatividad_dictamenes_reales.sql',import.meta.url),'utf8'));
    const rows=async()=>(await db.query('select * from operatividad')).rows;
    let o=(await rows())[0];
    assert.equal((await rows()).length,1);assert.equal(Number(o.precio),2500000);assert.equal(o.asociado_nombre,'Asesor Real');
    assert.equal((await db.query('select count(*)::int n from private.operatividad_pruebas_retiradas')).rows[0].n,17);
    await db.query('select operatividad_sincronizar_dictamen($1)',[o.dictamen_id]);
    assert.equal((await rows()).length,1);
    await db.query("update operatividad set precio=2600000 where id=$1",[o.id]);
    await db.query("update dictamenes set precio_listado=2700000,estado='autorizada' where id=$1",[o.dictamen_id]);
    o=(await rows())[0];assert.equal(Number(o.precio),2600000);assert.equal(o.estatus_dictamen,'AUTORIZADO');
    // El contrato nació primero como una fila independiente, después se enlaza.
    const doc=(await db.query(`insert into documentos_guardados(tipo_documento,estado,datos,folio)
      values('contrato_profeco','finalizado','{"f-con-precio":"2700000","f-con-fecha":"2026-09-28"}','CON-001') returning id`)).rows[0].id;
    await db.query('select operatividad_sincronizar_documento(g) from documentos_guardados g where id=$1',[doc]);
    assert.equal((await rows()).length,2);
    await db.query('update documentos_guardados set dictamen_id=$1 where id=$2',[o.dictamen_id,doc]);
    await db.query('select operatividad_sincronizar_documento(g) from documentos_guardados g where id=$1',[doc]);
    assert.equal((await rows()).length,1);o=(await rows())[0];assert.equal(o.documento_id,doc);assert.equal(Number(o.precio),2600000);
    assert.equal(o.folio,'REAL-001');assert.equal(new Date(o.fecha_contrato).toISOString().slice(0,10),'2026-09-28');
    await db.query("insert into dictamen_clientes(dictamen_id,nombre,orden) values($1,'Segundo cliente',0)",[o.dictamen_id]);
    assert.equal((await rows())[0].cliente_nombre,'Segundo cliente');
    await db.exec('set role authenticated');
    assert.equal((await db.query('select operatividad_listar() r')).rows[0].r.length,1);
    await db.exec("set test.staff='no'");await assert.rejects(db.query('select operatividad_listar()'),/Sin permiso/);
    await db.exec("set test.staff='si';set test.mfa='no'");await assert.rejects(db.query('select operatividad_listar()'),/Sin permiso/);
    await db.exec('reset role;set test.mfa=\'si\'');
    await db.exec(`alter table documentos_guardados add column nombre_archivo text, add column updated_at timestamptz default now();
      alter table dictamenes add column created_at timestamptz default now();
      alter table propiedades add column market_center text, add column asesor_nombre text;`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261005044140_operatividad_edicion_tabla.sql',import.meta.url),'utf8'));
    await db.exec(readFileSync(new URL('../supabase/migrations/20261005044836_operatividad_cambiar_dictamen.sql',import.meta.url),'utf8'));
    const doc2=(await db.query(`insert into documentos_guardados(tipo_documento,estado,datos,folio) values('contrato_profeco','finalizado','{}','CON-002') returning id`)).rows[0].id;
    await db.query('select operatividad_sincronizar_documento(g) from documentos_guardados g where id=$1',[doc2]);
    assert.equal((await rows()).length,2);
    await db.query('select operatividad_enlazar($1,\'contrato\',$2)',[o.id,doc2]);
    assert.equal((await rows()).length,1);o=(await rows())[0];assert.equal(o.documento_id,doc2);assert.equal(Number(o.precio),2600000);
    assert.equal((await db.query('select dictamen_id from documentos_guardados where id=$1',[doc])).rows[0].dictamen_id,null);
    const nuevoDictamen=(await db.query("insert into dictamenes(estado,inmueble,folio) values('condicionada','Otro inmueble','REAL-002') returning id")).rows[0].id;
    await db.query('select operatividad_enlazar($1,\'dictamen\',$2)',[o.id,nuevoDictamen]);
    o=(await rows()).find(f=>f.id===o.id);assert.equal(o.dictamen_id,nuevoDictamen);assert.equal(Number(o.precio),2600000);
    assert.equal((await db.query('select dictamen_id from documentos_guardados where id=$1',[doc2])).rows[0].dictamen_id,nuevoDictamen);
    const prop=(await db.query("insert into propiedades(titulo,market_center) values('Casa real','KW PREMIER') returning id")).rows[0].id;
    await db.query('select operatividad_enlazar($1,\'propiedad\',$2)',[o.id,prop]);assert.equal((await rows())[0].propiedad_id,prop);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261005055307_operatividad_quitar_enlaces.sql',import.meta.url),'utf8'));
    for(const [tipo,campo,origen] of [['propiedad','propiedad_id',prop],['contrato','documento_id',doc2],['dictamen','dictamen_id',nuevoDictamen]]) {
      await db.query('select operatividad_desenlazar($1,$2)',[o.id,tipo]);
      const actual=(await rows()).find(f=>f.id===o.id);
      assert.equal(actual[campo],null);assert.equal(Number(actual.precio),2600000);
      assert.equal((await db.query('select count(*)::int n from documentos_guardados where id=$1',[doc2])).rows[0].n,1);
      assert.equal((await db.query('select count(*)::int n from dictamenes where id=$1',[nuevoDictamen])).rows[0].n,1);
      if(tipo!=='propiedad')assert.equal((await db.query('select dictamen_id from documentos_guardados where id=$1',[doc2])).rows[0].dictamen_id,null);
      await db.query('select operatividad_enlazar($1,$2,$3)',[o.id,tipo,origen]);
      assert.equal((await rows()).find(f=>f.id===o.id)[campo],origen);
    }
    await db.query('update operatividad set archivado_at=now() where id=$1',[o.id]);
    await db.query('select operatividad_sincronizar_dictamen($1)',[o.dictamen_id]);assert.ok((await rows())[0].archivado_at);
    await db.exec("set role authenticated;set test.mfa='no'");await assert.rejects(db.query('select operatividad_opciones_enlace(\'propiedad\')'),/Sin permiso/);
    await assert.rejects(db.query('select operatividad_enlazar($1,\'propiedad\',$2)',[o.id,prop]),/Sin permiso/);
    await assert.rejects(db.query('select operatividad_desenlazar($1,\'propiedad\')',[o.id]),/Sin permiso/);
    await db.exec("reset role;set test.mfa='si'");
    await db.query('update dictamenes set archivado_at=now() where id=$1',[o.dictamen_id]);
    assert.equal((await db.query('select operatividad_listar() r')).rows[0].r.length,0);
    await db.exec('set role anon');await assert.rejects(db.query('select operatividad_listar()'),/permission denied/);
  }finally {await db.close();}
});

test('operatividad conserva scripts válidos y todos los campos de exportación',()=>{
  const html=readFileSync(new URL('../documentos/operatividad.html',import.meta.url),'utf8');
  for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
  assert.match(html,/function descargar\(/);assert.match(html,/function valoresDelEditor\(/);
  assert.match(html,/function cargarPropiedadesVinculables\(/);assert.match(html,/operatividad_listar/);
});

test('el menú reutiliza la campana del encabezado sin crear otra caja vacía',()=>{
  const js=readFileSync(new URL('../assets/js/drawer.js',import.meta.url),'utf8');
  const inicio=js.indexOf("if (!document.getElementById('notif-bell-slot')) {");
  assert.ok(inicio>=0);
  const bloque=js.slice(inicio,js.indexOf('}',inicio)+1);
  let caja={id:'notif-bell-slot'},creadas=0;
  const contexto={document:{getElementById:()=>caja,createElement:()=>({})},header:{appendChild(el){caja=el;creadas++;}}};
  vm.runInNewContext(bloque,contexto);assert.equal(creadas,0);
  caja=null;vm.runInNewContext(bloque,contexto);vm.runInNewContext(bloque,contexto);
  assert.equal(creadas,1);
});
