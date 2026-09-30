import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('perfiles: guardar, editar, pausar y aislar cuentas mediante RLS', async () => {
  const db = new PGlite();
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; grant usage on schema auth,public to authenticated;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create table public.profiles(id uuid primary key);
      insert into public.profiles values ('${a}'),('${b}');`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20260930194917_perfiles_comprador.sql', import.meta.url), 'utf8'));
    await db.exec(`set role authenticated; set test.uid='${a}'`);
    const { rows } = await db.query(`insert into public.perfiles_comprador (nombre,telefono,operacion,tipos,precio_max,estado)
      values ('Cliente prueba','5555555555','venta',array['Casa'],3000000,'Querétaro') returning *`);
    const id = rows[0].id;
    assert.equal(rows[0].asesor_id, a);
    assert.equal(rows[0].umbral_match, 70);
    assert.equal(rows[0].avisos_correo, true);
    await db.query('update public.perfiles_comprador set activo=false,precio_max=3200000 where id=$1',[id]);
    assert.equal((await db.query('select activo from public.perfiles_comprador')).rows[0].activo, false);
    await assert.rejects(db.query('update public.perfiles_comprador set asesor_id=$1 where id=$2',[b,id]));
    await assert.rejects(db.query(`insert into public.perfiles_comprador (asesor_id,nombre,telefono,operacion,tipos,precio_max,estado)
      values ($1,'Ajeno','555','renta',array['Casa'],20000,'CDMX')`,[b]));
    await assert.rejects(db.query(`insert into public.perfiles_comprador (nombre,operacion,tipos,precio_max,estado)
      values ('Sin contacto','venta',array['Casa'],3000000,'CDMX')`));
    await assert.rejects(db.query(`insert into public.perfiles_comprador (nombre,telefono,operacion,tipos,precio_min,precio_max,estado)
      values ('Rango inválido','555','venta',array['Casa'],4000000,3000000,'CDMX')`));
    await assert.rejects(db.query(`insert into public.perfiles_comprador (nombre,telefono,operacion,tipos,precio_max,estado)
      values ('Tipo inválido','555','venta',array['Inventado'],3000000,'CDMX')`));
    await db.exec(`set test.uid='${b}'`);
    assert.equal((await db.query('select * from public.perfiles_comprador')).rows.length,0);
    assert.equal((await db.query('update public.perfiles_comprador set nombre=$1 where id=$2 returning id',['Intruso',id])).rows.length,0);
    await assert.rejects(db.query('delete from public.perfiles_comprador where id=$1',[id]));
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.perfiles_comprador'));
  } finally { await db.close(); }
});
