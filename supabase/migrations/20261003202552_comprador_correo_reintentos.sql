create table public.comprador_correo_envios (
 notificacion_id uuid primary key references public.notificaciones(id) on delete cascade,
 estado text not null default 'pendiente' check(estado in ('pendiente','enviado')),
 intentos integer not null default 0,
 proximo_intento timestamptz not null default (now()+interval '10 minutes'),
 enviado_at timestamptz,
 mensaje_id text
);
alter table public.comprador_correo_envios enable row level security;
revoke all on public.comprador_correo_envios from public,anon,authenticated;
grant all on public.comprador_correo_envios to service_role;

create or replace function private.comprador_registrar_correo() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.tipo='comprador_matches' then
  insert into public.comprador_correo_envios(notificacion_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end; $$;
revoke all on function private.comprador_registrar_correo() from public,anon,authenticated;
create trigger comprador_correo_registrar after insert on public.notificaciones
 for each row execute function private.comprador_registrar_correo();

-- Incluir el ID permite confirmar la entrega y reintentar sin duplicar el correo.
do $$ declare definicion text; begin
 definicion:=pg_get_functiondef('public.notificar_email_nueva_notificacion()'::regprocedure);
 definicion:=regexp_replace(definicion,'''user_id'',[[:space:]]*new.user_id',
  '''notificacion_id'', new.id, ''user_id'', new.user_id');
 execute definicion;
end; $$;

create or replace function private.comprador_reintentar_correos() returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare secreto text; envio record; n integer:=0;
begin
 select decrypted_secret into secreto from vault.decrypted_secrets where name='kw_webhook_secret' limit 1;
 if secreto is null then return 0; end if;
 for envio in select e.notificacion_id,n.user_id,n.titulo,n.mensaje,n.url
  from public.comprador_correo_envios e join public.notificaciones n on n.id=e.notificacion_id
  where e.estado='pendiente' and e.proximo_intento<=now() and e.intentos<10
  order by e.proximo_intento limit 20 for update of e skip locked loop
  perform net.http_post(url:='https://iloetojomzqtadkithtv.supabase.co/functions/v1/notificar-email',
   headers:=jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_ZvaIC0_lkd6OQ0VMihOvjA_BIgpbClq','x-webhook-secret',secreto),
   body:=jsonb_build_object('record',jsonb_build_object('notificacion_id',envio.notificacion_id,'user_id',envio.user_id,
    'titulo',envio.titulo,'mensaje',envio.mensaje,'url',envio.url)),timeout_milliseconds:=30000);
  update public.comprador_correo_envios set intentos=intentos+1,proximo_intento=now()+interval '10 minutes' where notificacion_id=envio.notificacion_id;
  n:=n+1;
 end loop;
 return n;
end; $$;
revoke all on function private.comprador_reintentar_correos() from public,anon,authenticated;
select cron.schedule('kw-comprador-correo-reintentos','*/5 * * * *','select private.comprador_reintentar_correos()');
