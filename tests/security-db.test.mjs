import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

test('Postgres migrations: idempotence, atomic budgets, privileges, gateway, MFA and input validation', async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls; create role authenticator;
      create schema auth; create schema storage; create schema extensions;
      create table auth.users(id uuid primary key, encrypted_password text);
      create table public.mfa_sesiones(user_id uuid);
      create table public.mfa_dispositivos(user_id uuid, revocado_en timestamptz);
      create table public.mfa_correo_codigos(user_id uuid, usado boolean);
      create extension pgcrypto with schema extensions;
      grant usage on schema public, auth, storage to anon, authenticated, service_role;
      create function auth.role() returns text language sql stable as $$ select current_setting('test.role',true) $$;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create function public.mfa_sesion_autorizada() returns boolean language sql stable as $$ select coalesce(current_setting('test.mfa',true),'false') = 'true' $$;
      create function public.is_staff_or_above() returns boolean language sql stable as $$ select coalesce(current_setting('test.staff',true),'false') = 'true' $$;
      create function public.is_admin_or_master() returns boolean language sql stable as $$ select false $$;
      create function public.is_master() returns boolean language sql stable as $$ select false $$;
      create function public.is_admin() returns boolean language sql stable as $$ select false $$;
      create function public.asesor_recibe_prospectos(uuid) returns boolean language sql stable security definer as $$ select true $$;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
      create table storage.objects(id int, bucket_id text, name text);
      alter table storage.objects enable row level security;
      create policy own_files on storage.objects for select to authenticated using (bucket_id = 'firmas' and (storage.foldername(name))[1] = auth.uid()::text);
      create table storage.buckets(id text primary key, public boolean);
      insert into storage.buckets values ('firmas', true), ('incidencias', true), ('perfiles', true);
      create table public.profiles(id uuid primary key, nombre text, email text, foto_url text);
      alter table public.profiles enable row level security;
      create policy own_profiles on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
      create table public.api_llaves(id int);
      create view public.api_llaves_visibles as select id from public.api_llaves;
      create schema vault; create schema net;
      create table vault.decrypted_secrets(name text primary key, decrypted_secret text);
      insert into vault.decrypted_secrets values ('kw_webhook_secret',repeat('w',40)), ('kw_sync_secret',repeat('s',40));
      create table net.requests(url text, headers jsonb, body jsonb);
      create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language plpgsql as $$
        begin insert into net.requests values (url,headers,body); return 1; end;
      $$;
      create table public.notificaciones(user_id uuid, titulo text, mensaje text, url text);
      create table public.prospectos(asesor_id uuid, nombre text, correo text, telefono text, mensaje text);
      grant all on all tables in schema public, storage to authenticated;
    `);
    for (let pass = 0; pass < 2; pass++) {
      for (const file of ['088_security_gateway.sql', '089_security_enforcement.sql', '090_security_validation.sql', '091_webhook_secrets_vault.sql']) {
        await db.exec(readFileSync(new URL('../supabase/sql/' + file, import.meta.url), 'utf8'));
      }
    }
    const secret = (await db.query('select gateway_secret from private.security_config')).rows[0].gateway_secret;
    assert.equal(secret.length, 64);
    const results = await Promise.all(Array.from({ length: 25 }, () => db.query("select public.security_consume_rate('test','user-a',7,60) as result")));
    assert.equal(results.filter((r) => r.rows[0].result.allowed).length, 7);
    assert.equal((await db.query("select public.security_consume_rate('test','user-b',7,60) as result")).rows[0].result.allowed, true);
    await db.exec("update private.security_rate_limits set window_start = now() - interval '2 minutes'");
    assert.equal((await db.query("select public.security_consume_rate('test','user-a',7,60) as result")).rows[0].result.allowed, true);
    assert.equal((await db.query("select count(*)::int as n from private.security_rate_limits where subject_hash like '%user%'")).rows[0].n, 0);
    await db.exec('set role authenticated');
    await assert.rejects(db.query("select public.security_consume_rate('test','bypass',9999,60)"), /permission denied/);
    await assert.rejects(db.query('select * from private.security_config'), /permission denied/);
    await db.exec('reset role');
    await db.query("select set_config('test.role','anon',false)");
    await assert.rejects(db.query('select public.mfa_verificar_peticion()'), /Utiliza la API/);
    await db.query("select set_config('request.headers',$1,false)", [JSON.stringify({ 'x-kw-gateway': secret })]);
    await db.query('select public.mfa_verificar_peticion()');
    await db.query("select set_config('test.role','authenticated',false)");
    await assert.rejects(db.query('select public.mfa_verificar_peticion()'), /dos pasos/);
    await db.query("select set_config('test.mfa','true',false)");
    await db.query('select public.mfa_verificar_peticion()');
    const id = '11111111-1111-4111-8111-111111111111';
    await db.query('insert into public.profiles values ($1,$2,$3,null)', [id, "O'Connor; DROP TABLE profiles; --", 'user@example.com']);
    await assert.rejects(db.query('update public.profiles set email = $1 where id = $2', ['x@invalid\r\nBcc:attacker@example.com', id]), /Correo invalido/);
    await assert.rejects(db.query('update public.profiles set foto_url = $1 where id = $2', ['javascript:alert(1)', id]), /HTTPS/);
    await db.query("select set_config('test.uid',$1,false)", [id]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from public.profiles')).rows.length, 1);
    await db.query("select set_config('test.uid','22222222-2222-4222-8222-222222222222',false)");
    assert.equal((await db.query('select * from public.profiles')).rows.length, 0);
    await db.exec('reset role');
    await db.query("insert into storage.objects values (1,'firmas',$1), (2,'incidencias',$1)", [id + '/contrato.pdf']);
    await db.query("select set_config('test.uid',$1,false), set_config('test.mfa','false',false)", [id]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await db.query("select set_config('test.mfa','true',false)");
    assert.equal((await db.query('select * from storage.objects')).rows.length, 2);
    await db.exec('reset role');
    assert.deepEqual((await db.query('select id from storage.buckets where public')).rows, [{ id: 'perfiles' }]);
    await db.query("insert into auth.users values ($1,'old-hash')", [id]);
    await db.query('insert into public.mfa_sesiones values ($1)', [id]);
    await db.query('insert into public.mfa_dispositivos values ($1,null)', [id]);
    await db.query('insert into public.mfa_correo_codigos values ($1,false)', [id]);
    await db.query("update auth.users set encrypted_password = 'new-hash' where id=$1", [id]);
    assert.equal((await db.query('select * from public.mfa_sesiones')).rows.length, 0);
    assert((await db.query('select revocado_en from public.mfa_dispositivos')).rows[0].revocado_en);
    assert.equal((await db.query('select usado from public.mfa_correo_codigos')).rows[0].usado, true);
    await db.exec(`
      create trigger webhook_test after insert on public.notificaciones for each row execute function public.notificar_email_nueva_notificacion();
      create trigger prospecto_test after insert on public.prospectos for each row execute function public.correo_prospecto_nuevo();
      insert into public.notificaciones values (null,'Titulo','Mensaje','/portal.html');
      insert into public.prospectos values (null,'Ana','ana@example.com',null,'Hola');
    `);
    assert.equal((await db.query('select * from net.requests')).rows.length, 2);
    await db.exec("update vault.decrypted_secrets set decrypted_secret = repeat('r',40) where name='kw_webhook_secret'");
    await db.exec("insert into public.notificaciones values (null,'Otro titulo','Mensaje','/portal.html')");
    assert.equal((await db.query("select headers->>'x-webhook-secret' as token from net.requests where body->'record'->>'titulo' = 'Otro titulo'")).rows[0].token, 'r'.repeat(40));
  } finally { await db.close(); }
});
