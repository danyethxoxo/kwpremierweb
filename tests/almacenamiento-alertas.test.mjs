import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const migration = readFileSync(new URL('../supabase/migrations/20261012225950_alertas_almacenamiento.sql',import.meta.url),'utf8');
test('alertas: 50/75/90, sin duplicados, rearme, reintentos con mismo ID y permisos privados',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;
      create schema private;create schema storage;create schema vault;create schema net;create schema cron;
      create table public.profiles(id uuid primary key);
      insert into public.profiles values('11111111-1111-4111-8111-111111111111');
      create table public.notificaciones(id uuid primary key default gen_random_uuid(),user_id uuid,tipo text,titulo text,mensaje text,url text);
      create table storage.objects(metadata jsonb);
      insert into storage.objects values('{"size":0}');
      create table vault.decrypted_secrets(name text,decrypted_secret text);
      insert into vault.decrypted_secrets values('kw_webhook_secret','test-only');
      create table net.http_request_queue(id bigserial primary key,body bytea);
      create table net._http_response(id bigint,status_code int,content text,error_msg text);
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int default 1000)
        returns bigint language plpgsql as $$declare v bigint;begin insert into net.http_request_queue(body) values(convert_to(body::text,'UTF8')) returning id into v;return v;end$$;
      create function public.mock_email_trigger() returns trigger language plpgsql as $$begin
        perform net.http_post(url:='test',headers:='{}',body:=jsonb_build_object('record',jsonb_build_object('notificacion_id',new.id)));return new;end$$;
      create trigger notify after insert on public.notificaciones for each row execute function public.mock_email_trigger();
      create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;`);
    await db.exec(migration);await db.exec(migration);
    await db.exec('select private.revisar_almacenamiento()');
    assert.equal((await db.query('select count(*)::int n from notificaciones')).rows[0].n,0);
    await db.exec("update private.almacenamiento_config set activo=true,destinatario='11111111-1111-4111-8111-111111111111',limite_base=9223372036854775807;");
    for(const [percentage,expected] of [[49,0],[50,1],[50,1],[75,2],[90,3],[90,3],[40,3],[50,4]]){
      await db.query("update storage.objects set metadata=jsonb_build_object('size',$1::bigint)",[Math.ceil(1073741824*percentage/100)]);
      await db.exec('select private.revisar_almacenamiento()');
      assert.equal((await db.query('select count(*)::int n from notificaciones')).rows[0].n,expected);
    }
    const event=(await db.query('select * from private.almacenamiento_envios order by intentado_at limit 1')).rows[0];
    await db.query('update private.almacenamiento_envios set intentado_at=now()-interval \'1 hour\' where notificacion_id=$1',[event.notificacion_id]);
    await db.exec('select private.revisar_almacenamiento()');
    const retry=(await db.query('select * from private.almacenamiento_envios where notificacion_id=$1',[event.notificacion_id])).rows[0];
    assert.equal(retry.intentos,2);assert.notEqual(retry.request_id,event.request_id);
    const body=(await db.query("select convert_from(body,'UTF8')::jsonb payload from net.http_request_queue where id=$1",[retry.request_id])).rows[0].payload;
    assert.equal(body.record.notificacion_id,event.notificacion_id);
    await db.query('insert into net._http_response(id,status_code,content) values($1,200,$2)',[retry.request_id,'{"ok":true}']);
    await db.exec('select private.revisar_almacenamiento()');
    assert.ok((await db.query('select enviado_at from private.almacenamiento_envios where notificacion_id=$1',[event.notificacion_id])).rows[0].enviado_at);
    assert.equal((await db.query("select has_function_privilege('authenticated','private.revisar_almacenamiento()','execute') allowed")).rows[0].allowed,false);
  }finally{await db.close()}
});
