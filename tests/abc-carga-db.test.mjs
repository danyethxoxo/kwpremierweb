import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const dir=new URL('../supabase/migrations/',import.meta.url);
const migration=readFileSync(new URL(readdirSync(dir).find(f=>f.endsWith('_abc_carga_completa.sql')),dir),'utf8');

test('lectura agrupada conserva todas las filas, RLS, rol y MFA sin permisos anónimos',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('qa.uid',true),'')::uuid $$;
      create function private.is_staff_or_above() returns boolean language sql stable as $$
        select current_setting('qa.role',true) in ('staff','admin','master') $$;
      create function public.mfa_sesion_autorizada() returns boolean language sql stable as $$
        select current_setting('qa.mfa',true)='true' $$;
      create table public.abc_temas(id smallint,orden smallint,sesion text,nombre text,activo boolean);
      create table public.abc_asesores(kwid text,nombre text,dt_asignado text,activo boolean,fecha_ingreso date);
      create table public.abc_avance(kwid text,tema_id smallint,completado boolean);
      insert into abc_temas values(1,1,'ABC','Tema',true),(2,2,'ABC','Oculto',false);
      insert into abc_asesores values('1','QA',null,true,null);
      insert into abc_avance select i::text,1,true from generate_series(1,1888) i;
      insert into abc_avance values('incompleto',1,false);
      grant usage on schema auth,private,public to authenticated;
      grant select on abc_temas,abc_asesores,abc_avance to authenticated;
      alter table abc_temas enable row level security;
      alter table abc_asesores enable row level security;
      alter table abc_avance enable row level security;
      create policy qa on abc_temas for select to authenticated using (current_setting('qa.rows',true)='true');
      create policy qa on abc_asesores for select to authenticated using (current_setting('qa.rows',true)='true');
      create policy qa on abc_avance for select to authenticated using (current_setting('qa.rows',true)='true');
    `);
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(`set qa.uid='11111111-1111-4111-8111-111111111111';set qa.role='staff';set qa.mfa='true';set qa.rows='true';set role authenticated;`);
    let result=(await db.query('select public.abc_carga_completa() as datos')).rows[0].datos;
    assert.equal(result.temas.length,1);
    assert.equal(result.asesores.length,1);
    assert.equal(result.avances.length,1888);
    await db.exec(`set qa.rows='false';`);
    result=(await db.query('select public.abc_carga_completa() as datos')).rows[0].datos;
    assert.deepEqual(result,{temas:[],asesores:[],avances:[]});
    await db.exec(`set qa.rows='true';set qa.role='asesor';`);
    await assert.rejects(db.query('select public.abc_carga_completa()'),e=>e.code==='42501');
    await db.exec(`set qa.role='admin';set qa.mfa='false';`);
    await assert.rejects(db.query('select public.abc_carga_completa()'),e=>e.code==='42501');
    await db.exec(`set qa.role='staff';set qa.mfa='true';set qa.uid='';`);
    await assert.rejects(db.query('select public.abc_carga_completa()'),e=>e.code==='42501');
    await db.exec('reset role;set role anon;');
    await assert.rejects(db.query('select public.abc_carga_completa()'),e=>e.code==='42501');
  } finally {await db.close();}
});
