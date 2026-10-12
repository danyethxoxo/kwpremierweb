-- Cuotas del plan Free. Los avisos usan el correo registrado del destinatario.
-- Se instala desactivado hasta que se configure expresamente el destinatario.
create table if not exists private.almacenamiento_config (
  id boolean primary key default true check (id),
  destinatario uuid references public.profiles(id) on delete set null,
  activo boolean not null default false,
  limite_base bigint not null default 524288000 check (limite_base > 0),
  limite_archivos bigint not null default 1073741824 check (limite_archivos > 0)
);
insert into private.almacenamiento_config(id) values (true) on conflict do nothing;

create table if not exists private.almacenamiento_estado (
  recurso text primary key check (recurso in ('base','archivos')),
  ultimo_nivel integer not null default 0,
  usado_bytes bigint not null default 0,
  medido_at timestamptz
);
insert into private.almacenamiento_estado(recurso) values ('base'),('archivos') on conflict do nothing;

create table if not exists private.almacenamiento_envios (
  notificacion_id uuid primary key references public.notificaciones(id) on delete cascade,
  recurso text not null,
  nivel integer not null check (nivel in (50,75,90)),
  request_id bigint,
  intentos integer not null default 1,
  intentado_at timestamptz not null default now(),
  enviado_at timestamptz,
  ultimo_error text
);
alter table private.almacenamiento_config enable row level security;
alter table private.almacenamiento_estado enable row level security;
alter table private.almacenamiento_envios enable row level security;
revoke all on private.almacenamiento_config, private.almacenamiento_estado, private.almacenamiento_envios from public,anon,authenticated;

create or replace function private.almacenamiento_nivel(p_usado bigint,p_limite bigint)
returns integer language sql immutable set search_path='' as $$
  select case when p_usado::numeric*100/p_limite >= 90 then 90
    when p_usado::numeric*100/p_limite >= 75 then 75
    when p_usado::numeric*100/p_limite >= 50 then 50 else 0 end;
$$;
revoke all on function private.almacenamiento_nivel(bigint,bigint) from public,anon,authenticated;

create or replace function private.revisar_almacenamiento()
returns void language plpgsql security invoker set search_path='' as $$
declare
  cfg private.almacenamiento_config%rowtype;
  r record; e record; respuesta record;
  nivel integer; anterior integer; aviso uuid; solicitud bigint;
  titulo text; mensaje text; secreto text; entrega boolean;
begin
  if not pg_try_advisory_xact_lock(hashtext('kw-revisar-almacenamiento')) then return; end if;
  select * into cfg from private.almacenamiento_config where id;
  if not cfg.activo or cfg.destinatario is null then return; end if;
  select decrypted_secret into secreto from vault.decrypted_secrets where name='kw_webhook_secret' limit 1;
  if secreto is null then raise exception 'Falta el secreto del servicio de correo'; end if;

  -- Confirma entregas y reintenta con el mismo ID para que Resend no duplique.
  for e in select * from private.almacenamiento_envios where enviado_at is null loop
    select * into respuesta from net._http_response where id=e.request_id;
    entrega := false;
    if respuesta.status_code between 200 and 299 then
      begin entrega := coalesce((respuesta.content::jsonb->>'ok')::boolean,false);
      exception when others then entrega := false; end;
    end if;
    if entrega then
      update private.almacenamiento_envios set enviado_at=now(),ultimo_error=null where notificacion_id=e.notificacion_id;
    elsif e.intentos < 12 and e.intentado_at < now()-interval '30 minutes' then
      select net.http_post(
        url:='https://iloetojomzqtadkithtv.supabase.co/functions/v1/notificar-email',
        headers:=jsonb_build_object('Content-Type','application/json','x-webhook-secret',secreto,
          'apikey','sb_publishable_ZvaIC0_lkd6OQ0VMihOvjA_BIgpbClq',
          'Authorization','Bearer sb_publishable_ZvaIC0_lkd6OQ0VMihOvjA_BIgpbClq'),
        body:=jsonb_build_object('record',jsonb_build_object('notificacion_id',n.id,'user_id',n.user_id,
          'titulo',n.titulo,'mensaje',n.mensaje,'url',n.url)),timeout_milliseconds:=15000
      ) into solicitud from public.notificaciones n where n.id=e.notificacion_id;
      update private.almacenamiento_envios set request_id=solicitud,intentos=intentos+1,intentado_at=now(),
        ultimo_error=coalesce(respuesta.error_msg,'Sin confirmación de entrega') where notificacion_id=e.notificacion_id;
    end if;
  end loop;

  for r in
    select 'base'::text as recurso,'Base de datos'::text as nombre,pg_database_size(current_database()) as usado,cfg.limite_base as limite
    union all
    select 'archivos','Archivos de KW Premier',coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$'
      then (metadata->>'size')::bigint else 0 end),0)::bigint,cfg.limite_archivos from storage.objects
  loop
    nivel := private.almacenamiento_nivel(r.usado,r.limite);
    select ultimo_nivel into anterior from private.almacenamiento_estado where recurso=r.recurso for update;
    if nivel > anterior then
      titulo := format('Supabase: %s alcanzó el umbral de %s%%',r.nombre,nivel);
      mensaje := format('Uso actual: %s%%. Usados: %s MB de %s MB. Espacio disponible estimado: %s MB. Revisión automática de KW Premier cada hora.',
        round(r.usado::numeric*100/r.limite,1),round(r.usado::numeric/1048576,1),round(r.limite::numeric/1048576,1),
        round(greatest(r.limite-r.usado,0)::numeric/1048576,1));
      if r.recurso='archivos' then mensaje := mensaje || ' Esta medición incluye solo KW Premier; la cuota de archivos se comparte con los otros proyectos de la organización.'; end if;
      insert into public.notificaciones(user_id,tipo,titulo,mensaje,url)
        values(cfg.destinatario,'almacenamiento',titulo,mensaje,'/hub/admin.html') returning id into aviso;
      -- El trigger de correo ya existente dejó esta solicitud en cola.
      select id into solicitud from net.http_request_queue
        where convert_from(body,'UTF8')::jsonb->'record'->>'notificacion_id'=aviso::text order by id desc limit 1;
      insert into private.almacenamiento_envios(notificacion_id,recurso,nivel,request_id)
        values(aviso,r.recurso,nivel,solicitud);
    end if;
    -- Al bajar de un umbral se rearma el aviso para una subida posterior.
    update private.almacenamiento_estado set ultimo_nivel=nivel,usado_bytes=r.usado,medido_at=now() where recurso=r.recurso;
  end loop;
end;
$$;
revoke all on function private.revisar_almacenamiento() from public,anon,authenticated;
select cron.schedule('kw-alertas-almacenamiento','23 * * * *','select private.revisar_almacenamiento()');
