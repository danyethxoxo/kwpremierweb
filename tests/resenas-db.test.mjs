import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('migration repairs review links and new trigger notifications without publishing reviews', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create table profiles(id text, role text);
      create table resenas(id text, nombre text, estrellas integer, aprobada boolean default false);
      create table notificaciones(user_id text, tipo text, titulo text, mensaje text, url text, leido boolean default false);
      insert into profiles values ('master','master'),('admin','admin'),('other','asociado');
      insert into resenas values ('old','Cliente',1,false);
      insert into notificaciones values ('master','resena','Aviso','Pendiente','/kwpremierweb/hub/admin.html',true),
        ('master','login','Sesión','Aviso','/perfil.html',false);`);
    const sql = readFileSync(new URL('../supabase/migrations/20261009031818_resenas_notificaciones.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    assert.deepEqual((await db.query("select url,leido from notificaciones where tipo='resena'")).rows, [{ url: '/hub/resenas.html', leido: true }]);
    assert.equal((await db.query("select url from notificaciones where tipo='login'")).rows[0].url, '/perfil.html');
    await db.exec(`create trigger notify after insert on resenas for each row execute function public.notificar_resena_nueva();
      insert into resenas values ('new','Nuevo cliente',1,false);`);
    const avisos = (await db.query("select user_id,url from notificaciones where titulo='Nueva reseña de Nuevo cliente' order by user_id")).rows;
    assert.deepEqual(avisos, [{ user_id: 'admin', url: '/hub/resenas.html' }, { user_id: 'master', url: '/hub/resenas.html' }]);
    assert.equal((await db.query('select count(*)::int as n from resenas where aprobada')).rows[0].n, 0);
    assert.equal((await db.query("select has_function_privilege('anon','public.notificar_resena_nueva()','EXECUTE') as allowed")).rows[0].allowed, false);
  } finally { await db.close(); }
});
