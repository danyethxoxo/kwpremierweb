import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('incidencias: permisos, conversación, versiones, notificaciones e idempotencia', async () => {
  const db=new PGlite();
  const asesor='11111111-1111-4111-8111-111111111111', otro='22222222-2222-4222-8222-222222222222', admin='33333333-3333-4333-8333-333333333333';
  const caso='44444444-4444-4444-8444-444444444444', mensaje='55555555-5555-4555-8555-555555555555';
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema private;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function private.is_admin_or_master() returns boolean language sql stable as $$select current_setting('test.role',true) in ('admin','master')$$;
      create function public.mfa_sesion_autorizada() returns boolean language sql stable as $$select coalesce(current_setting('test.mfa',true),'true')='true'$$;
      grant usage on schema auth,private to authenticated;
      create table public.profiles(id uuid primary key,nombre text,apellido text,email text,role text);
      create table public.incidencias(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),titulo text,descripcion text,imagenes text[] default '{}',estatus text default 'abierto',created_at timestamptz default now(),updated_at timestamptz default now(),respuesta text);
      create table public.notificaciones(user_id uuid,tipo text,titulo text,mensaje text,url text);
      create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp();return new;end$$;
      create trigger inc_updated before update on public.incidencias for each row execute function public.set_updated_at();
      alter table public.incidencias enable row level security;
      create policy inc_read on public.incidencias for select to authenticated using(user_id=auth.uid() or private.is_admin_or_master());
      create policy inc_insert on public.incidencias for insert to authenticated with check(user_id=auth.uid());
      create policy inc_update on public.incidencias for update to authenticated using(private.is_admin_or_master()) with check(private.is_admin_or_master());
      grant select,insert,update on public.incidencias to authenticated;
      grant select on public.profiles to authenticated;
    `);
    for(const [id,rol] of [[asesor,'asociado'],[otro,'asociado'],[admin,'admin']]){
      await db.query('insert into auth.users values($1)',[id]);await db.query('insert into profiles values($1,\'Nombre\',null,\'prueba@example.com\',$2)',[id,rol]);
    }
    const sql=readFileSync(new URL('../supabase/migrations/20261006042944_incidencias_demo_seguimiento.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql);
    await db.exec(`create trigger ticket_nuevo after insert on public.incidencias for each row execute function public.notificar_ticket_nuevo();create trigger ticket_estado after update on public.incidencias for each row execute function public.notificar_ticket_actualizado();`);
    async function usuario(id,rol='asociado') {await db.exec('reset role');await db.query("select set_config('test.uid',$1,false),set_config('test.role',$2,false)",[id,rol]);await db.exec('set role authenticated');}
    await usuario(asesor);
    await db.query("insert into incidencias(id,user_id,titulo,descripcion,tipo) values($1,$2,'No funciona guardar','Pasos para reproducir el problema','problema')",[caso,asesor]);
    await db.query('insert into incidencias_mensajes(id,incidencia_id,user_id,mensaje) values($1,$2,$3,$4)',[mensaje,caso,asesor,'Agrego más detalles']);
    await assert.rejects(db.query('insert into incidencias_mensajes(incidencia_id,user_id,mensaje) values($1,$2,$3)',[caso,otro,'Autor falso']),/row-level security/);
    await assert.rejects(db.query("select incidencias_guardar_seguimiento($1,'resuelto','Respuesta',now(),gen_random_uuid())",[caso]),/permiso/);
    await assert.rejects(db.query("insert into incidencias(user_id,titulo,descripcion) values($1,'a','breve')",[asesor]),/check constraint/);
    await usuario(otro);
    assert.equal((await db.query('select * from incidencias_mensajes')).rows.length,0);
    await assert.rejects(db.query('insert into incidencias_mensajes(incidencia_id,user_id,mensaje) values($1,$2,$3)',[caso,otro,'No debo escribir aquí']),/row-level security/);
    await usuario(admin,'admin');
    const version=(await db.query('select updated_at from incidencias where id=$1',[caso])).rows[0].updated_at;
    const reply='66666666-6666-4666-8666-666666666666';
    await db.query("select incidencias_guardar_seguimiento($1,'en_revision','Lo estamos revisando',$2,$3)",[caso,version,reply]);
    await db.query("select incidencias_guardar_seguimiento($1,'en_revision','Lo estamos revisando',$2,$3)",[caso,version,reply]);
    assert.equal((await db.query('select * from incidencias_mensajes')).rows.length,2);
    await assert.rejects(db.query("select incidencias_guardar_seguimiento($1,'resuelto','Respuesta obsoleta',$2,gen_random_uuid())",[caso,version]),/reporte cambió/);
    await db.exec("select set_config('test.mfa','false',false)");
    assert.equal((await db.query('select * from incidencias_mensajes')).rows.length,0);
    await assert.rejects(db.query('insert into incidencias_mensajes(incidencia_id,user_id,mensaje) values($1,$2,$3)',[caso,admin,'Sin MFA']),/row-level security/);
    await db.exec('reset role');
    const avisos=(await db.query('select * from notificaciones')).rows;
    assert(avisos.length>=3);assert(avisos.every(n=>n.url==='hub/tickets.html?id='+caso));
    assert(avisos.some(n=>n.user_id===asesor && n.mensaje==='Lo estamos revisando'));
    await db.exec('set role anon');await assert.rejects(db.query('select * from incidencias_mensajes'),/permission denied/);
  } finally {await db.close();}
});
