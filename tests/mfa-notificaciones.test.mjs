import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('a new authorized session notifies once; navigation and concurrent upserts do not duplicate it', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table public.mfa_sesiones(session_id uuid primary key, user_id uuid, verificado_hasta timestamptz);
      create table public.notificaciones(user_id uuid, tipo text, titulo text, mensaje text, url text);
    `);
    const migration = readFileSync(new URL('../supabase/migrations/20261006034150_mfa_notificacion_inicio_sesion.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const user = '11111111-1111-4111-8111-111111111111';
    const session = '22222222-2222-4222-8222-222222222222';
    const upsert = id => db.query(`insert into public.mfa_sesiones values ($1,$2,now()+interval '1 day','Chrome en Windows')
      on conflict(session_id) do update set verificado_hasta=excluded.verificado_hasta`, [id,user]);
    await upsert(session);
    await Promise.all([upsert(session),upsert(session),upsert(session)]);
    let rows = (await db.query('select * from public.notificaciones')).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tipo, 'inicio_sesion');
    assert.match(rows[0].mensaje, /Chrome en Windows/);
    assert.equal(rows[0].url, 'perfil.html');
    await upsert('33333333-3333-4333-8333-333333333333');
    rows = (await db.query('select * from public.notificaciones')).rows;
    assert.equal(rows.length, 2);
  } finally { await db.close(); }
});
