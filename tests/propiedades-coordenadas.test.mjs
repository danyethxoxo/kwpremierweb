import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('corrige longitudes mexicanas y excluye coordenadas falsas incluso en futuras sincronizaciones', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema private;
      create role anon; create role authenticated;
      create table public.propiedades(id int primary key, pais text, lat numeric, lng numeric);
      insert into public.propiedades values
      (1,'MX',22.15,100.9),(2,'MX',1,1),(3,'MX',31.68,-106.4),
      (4,'MX',32.96,-165.01),(5,'US',40.71,-74.0),(6,'MX',22,null);`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261015154831_validar_coordenadas_propiedades_mexico.sql',import.meta.url),'utf8'));
    const rows = (await db.query('select id,lat::float8 as lat,lng::float8 as lng from public.propiedades order by id')).rows;
    assert.deepEqual(rows,[
      {id:1,lat:22.15,lng:-100.9},{id:2,lat:null,lng:null},
      {id:3,lat:31.68,lng:-106.4},{id:4,lat:null,lng:null},
      {id:5,lat:40.71,lng:-74},{id:6,lat:null,lng:null}
    ]);
    await db.exec(`update public.propiedades set lat=10,lng=120 where id=1;
      insert into public.propiedades values (7,'México',28.63,106.08),(8,'MX',100,1218);`);
    assert.deepEqual((await db.query('select id,lat::float8 as lat,lng::float8 as lng from public.propiedades where id in (1,7,8) order by id')).rows,
      [{id:1,lat:null,lng:null},{id:7,lat:28.63,lng:-106.08},{id:8,lat:null,lng:null}]);
  } finally { await db.close(); }
});

test('Coahuila rechaza Guatemala y conserva Matamoros; valida estados y aliases', async () => {
  const db=new PGlite();
  try {
    await db.exec(`create schema private; create role anon; create role authenticated; create role service_role;
      create table public.propiedades(id int primary key,pais text,estado text,lat numeric,lng numeric);
      insert into public.propiedades values
      (1,'MX','Coahuila de Zaragoza',14.6366533,-90.5101264),
      (2,'MX','Coahuila de Zaragoza',25.526,-103.228),
      (3,'MX','Estado de México',19.29,-99.65);`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261015154831_validar_coordenadas_propiedades_mexico.sql',import.meta.url),'utf8'));
    await db.exec(readFileSync(new URL('../supabase/migrations/20261015161800_validar_coordenadas_por_estado.sql',import.meta.url),'utf8'));
    assert.deepEqual((await db.query('select id,lat::float8 as lat,lng::float8 as lng from public.propiedades order by id')).rows,
      [{id:1,lat:null,lng:null},{id:2,lat:25.526,lng:-103.228},{id:3,lat:19.29,lng:-99.65}]);
    await db.exec(`update public.propiedades set lat=14.6366533,lng=-90.5101264 where id=2;
      insert into public.propiedades values (4,'MX','Coahuila',25.526,103.228);
      update public.propiedades set estado='Quintana Roo' where id=4;`);
    assert.equal((await db.query('select count(*)::int n from public.propiedades where id in (2,4) and lat is null and lng is null')).rows[0].n,2);
    assert.equal((await db.query("select private.coordenadas_en_estado('Estado de México',19.29,-99.65) as ok")).rows[0].ok,true);
    await db.exec('grant select,insert,update on public.propiedades to service_role; set role service_role;');
    await assert.rejects(db.query("select private.coordenadas_en_estado('Coahuila',25.526,-103.228)"), /permission denied for schema private/);
    await db.exec('reset role;');
    const permisos=readFileSync(new URL('../supabase/migrations/20261016133529_restore_property_sync_private_schema_usage.sql',import.meta.url),'utf8');
    await db.exec(permisos); await db.exec(permisos);
    await db.exec("set role service_role; update public.propiedades set lat=25.526,lng=-103.228 where id=2; reset role;");
    assert.equal((await db.query('select lat::float8 as lat from public.propiedades where id=2')).rows[0].lat,25.526);
    assert.equal((await db.query("select has_schema_privilege('anon','private','USAGE') as acceso")).rows[0].acceso,false);
  } finally { await db.close(); }
});
