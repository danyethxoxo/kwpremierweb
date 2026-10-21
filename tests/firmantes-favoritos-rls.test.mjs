import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('favoritos: cada cuenta solo puede leer y modificar los suyos', async () => {
  const db = new PGlite();
  try {
    const uno = '00000000-0000-4000-8000-000000000001', dos = '00000000-0000-4000-8000-000000000002';
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('${uno}'),('${dos}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;`);
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261021233751_firmas_favoritos_personales.sql', import.meta.url), 'utf8'));
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uno}',false);
      insert into public.firmas_favoritos_personales(user_id,correo,nombre) values ('${uno}','cliente@ejemplo.com','Cliente');`);
    assert.equal((await db.query('select * from public.firmas_favoritos_personales')).rows.length, 1);
    await db.exec(`select set_config('request.jwt.claim.sub','${dos}',false)`);
    assert.equal((await db.query('select * from public.firmas_favoritos_personales')).rows.length, 0);
    assert.equal((await db.query("update public.firmas_favoritos_personales set nombre='Intruso' returning *")).rows.length, 0);
    assert.equal((await db.query('delete from public.firmas_favoritos_personales returning *')).rows.length, 0);
    await assert.rejects(db.exec(`insert into public.firmas_favoritos_personales(user_id,correo,nombre) values ('${uno}','intruso@ejemplo.com','Intruso')`), /row-level security/);
    await db.exec(`select set_config('request.jwt.claim.sub','${uno}',false)`);
    assert.equal((await db.query("update public.firmas_favoritos_personales set nombre='Cliente corregido' returning *")).rows.length, 1);
    assert.equal((await db.query('delete from public.firmas_favoritos_personales returning *')).rows.length, 1);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.exec('select * from public.firmas_favoritos_personales'), /permission denied/);
    await assert.rejects(db.exec("insert into public.firmas_favoritos_personales(user_id,correo,nombre) values ('00000000-0000-4000-8000-000000000001','intruso@ejemplo.com','Intruso')"), /permission denied/);
  } finally { await db.close(); }
});
