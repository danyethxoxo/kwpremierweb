-- No se encolan registros históricos: solo nuevas altas y reactivaciones.
create table public.asesores_altas_google (
 asesor_id uuid primary key references public.asesores(id) on delete cascade,
 correo text not null,
 revision uuid not null default gen_random_uuid(),
 estado text not null default 'pendiente' check(estado in ('pendiente','completo','cancelado')),
 intentos integer not null default 0,
 proximo_at timestamptz not null default now(),
 actualizado_at timestamptz not null default now(),
 detalle jsonb
);
alter table public.asesores_altas_google enable row level security;
revoke all on public.asesores_altas_google from public,anon,authenticated;
grant all on public.asesores_altas_google to service_role;
grant select on public.asesores_altas_google to authenticated;
create policy liderazgo_consulta_altas_google on public.asesores_altas_google for select to authenticated
 using ((select private.is_staff_or_above()) and (select public.mfa_sesion_autorizada()));

create table public.asesores_altas_google_control (
 id boolean primary key default true check(id), lease uuid, iniciado_at timestamptz
);
insert into public.asesores_altas_google_control(id) values(true);
alter table public.asesores_altas_google_control enable row level security;
revoke all on public.asesores_altas_google_control from public,anon,authenticated;
grant all on public.asesores_altas_google_control to service_role;

create function private.asesores_programar_altas_google() returns bigint
language plpgsql security definer set search_path=pg_catalog as $$
declare v_secret text; v_request bigint;
begin
 if not exists(select 1 from public.asesores_altas_google where estado='pendiente' and proximo_at<=now()) then return null; end if;
 select decrypted_secret into v_secret from vault.decrypted_secrets where name='kw_webhook_secret' limit 1;
 if v_secret is null then return null; end if;
 select net.http_post(
  url:='https://iloetojomzqtadkithtv.supabase.co/functions/v1/hyper-processor',
  headers:=jsonb_build_object('Content-Type','application/json','x-webhook-secret',v_secret),
  body:='{"accion":"procesar_altas_google"}'::jsonb,timeout_milliseconds:=120000
 ) into v_request;
 return v_request;
end; $$;
revoke all on function private.asesores_programar_altas_google() from public,anon,authenticated;

create function private.asesores_encolar_alta_google() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.grupo not in ('asesor_activo','back_office_activo') or nullif(trim(new.correo),'') is null then return new; end if;
 if tg_op='UPDATE' then
  if old.grupo in ('asesor_activo','back_office_activo') and lower(trim(coalesce(old.correo,'')))=lower(trim(new.correo)) then return new; end if;
 end if;
 insert into public.asesores_altas_google(asesor_id,correo) values(new.id,lower(trim(new.correo)))
 on conflict(asesor_id) do update set correo=excluded.correo,revision=gen_random_uuid(),estado='pendiente',intentos=0,proximo_at=now(),actualizado_at=now(),detalle=null;
 -- El guardado no depende de que pg_net pueda despertar al trabajador.
 begin perform private.asesores_programar_altas_google(); exception when others then null; end;
 return new;
end; $$;
revoke all on function private.asesores_encolar_alta_google() from public,anon,authenticated;
create trigger asesores_encolar_alta_google after insert or update of grupo,correo on public.asesores
 for each row execute function private.asesores_encolar_alta_google();

create function public.asesores_altas_google_tomar() returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare v_lease uuid:=gen_random_uuid(); v_tareas jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Servicio interno'; end if;
 update public.asesores_altas_google_control set lease=v_lease,iniciado_at=now()
 where id and (lease is null or iniciado_at<now()-interval '5 minutes');
 if not found then return null; end if;
 with lote as (
  select asesor_id from public.asesores_altas_google where estado='pendiente' and proximo_at<=now()
  order by proximo_at limit 5 for update skip locked
 ), tomadas as (
  update public.asesores_altas_google q set intentos=intentos+1 from lote where q.asesor_id=lote.asesor_id returning q.*
 ) select coalesce(jsonb_agg(to_jsonb(tomadas)),'[]'::jsonb) into v_tareas from tomadas;
 return jsonb_build_object('lease',v_lease,'tareas',v_tareas);
end; $$;

create function public.asesores_altas_google_finalizar(p_lease uuid,p_asesor uuid,p_revision uuid,p_estado text,p_detalle jsonb) returns void
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Servicio interno'; end if;
 if not exists(select 1 from public.asesores_altas_google_control where id and lease=p_lease) then raise exception 'Proceso vencido'; end if;
 update public.asesores_altas_google set estado=p_estado,detalle=p_detalle,actualizado_at=now(),proximo_at=now()+interval '2 minutes'
 where asesor_id=p_asesor and revision=p_revision and estado='pendiente';
 if found and p_estado='completo' then
  insert into public.altas_procesadas(correo,nombre,telefono,pasos,completo)
  select q.correo,a.nombre,a.telefono,
   jsonb_build_object('contactos',jsonb_build_object('ok',true),'drive',jsonb_build_object('ok',true),'calendario',jsonb_build_object('ok',true),'origen','automatico'),true
  from public.asesores_altas_google q join public.asesores a on a.id=q.asesor_id where q.asesor_id=p_asesor;
 end if;
end; $$;

create function public.asesores_altas_google_liberar(p_lease uuid) returns void
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Servicio interno'; end if;
 update public.asesores_altas_google_control set lease=null where id and lease=p_lease;
end; $$;
revoke all on function public.asesores_altas_google_tomar() from public,anon,authenticated;
revoke all on function public.asesores_altas_google_finalizar(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.asesores_altas_google_liberar(uuid) from public,anon,authenticated;
grant execute on function public.asesores_altas_google_tomar() to service_role;
grant execute on function public.asesores_altas_google_finalizar(uuid,uuid,uuid,text,jsonb) to service_role;
grant execute on function public.asesores_altas_google_liberar(uuid) to service_role;
select cron.schedule('asesores-altas-google-reintentos','* * * * *','select private.asesores_programar_altas_google();');
alter publication supabase_realtime add table public.asesores_altas_google;
