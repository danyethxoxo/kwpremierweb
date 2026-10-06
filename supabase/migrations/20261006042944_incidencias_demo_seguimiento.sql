-- Reportes de la demo: contexto, conversación y notificaciones con enlace directo.
alter table public.incidencias add column if not exists tipo text not null default 'problema';
alter table public.incidencias add column if not exists pagina text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='incidencias_demo_datos') then
    alter table public.incidencias add constraint incidencias_demo_datos check (
      tipo in ('problema','mejora','duda') and length(trim(titulo)) between 3 and 160
      and length(trim(descripcion)) between 10 and 6000 and cardinality(imagenes) <= 5
      and (pagina is null or (length(pagina) <= 300 and pagina ~ '^/[^[:cntrl:]]*$' and pagina !~ '^//'))
    ) not valid;
  end if;
end $$;

create or replace view public.incidencias_con_reportante
with (security_invoker=true, security_barrier=true) as
select i.id,i.user_id,i.titulo,i.descripcion,i.imagenes,i.estatus,i.created_at,i.updated_at,
  p.nombre as reportante_nombre,p.apellido as reportante_apellido,p.email as reportante_email,
  i.respuesta,i.tipo,i.pagina
from public.incidencias i join public.profiles p on p.id=i.user_id
where auth.uid()=i.user_id or private.is_admin_or_master();

create table if not exists public.incidencias_mensajes (
  id uuid primary key default gen_random_uuid(),
  incidencia_id uuid not null references public.incidencias(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  mensaje text not null check(length(trim(mensaje)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists incidencias_mensajes_hilo on public.incidencias_mensajes(incidencia_id,created_at);
alter table public.incidencias_mensajes enable row level security;
revoke all on public.incidencias_mensajes from anon,authenticated;
grant select,insert on public.incidencias_mensajes to authenticated;
grant all on public.incidencias_mensajes to service_role;
drop policy if exists leer_hilo on public.incidencias_mensajes;
create policy leer_hilo on public.incidencias_mensajes for select to authenticated using (
  (select public.mfa_sesion_autorizada()) and exists(select 1 from public.incidencias i where i.id=incidencia_id)
);
drop policy if exists participar_hilo on public.incidencias_mensajes;
create policy participar_hilo on public.incidencias_mensajes for insert to authenticated with check (
  user_id=(select auth.uid()) and (select public.mfa_sesion_autorizada())
  and exists(select 1 from public.incidencias i where i.id=incidencia_id)
);

create or replace function public.incidencias_guardar_seguimiento(
  p_id uuid,p_estatus text,p_mensaje text,p_version timestamptz,p_mensaje_id uuid
) returns void language plpgsql security invoker set search_path=public as $$
begin
  if not public.mfa_sesion_autorizada() or not private.is_admin_or_master() then
    raise exception 'No tienes permiso para gestionar este reporte';
  end if;
  if p_estatus not in ('abierto','en_revision','resuelto') then raise exception 'Estado inválido'; end if;
  if length(trim(coalesce(p_mensaje,''))) > 4000 then raise exception 'La respuesta es demasiado larga'; end if;
  -- La misma respuesta enviada de nuevo por una conexión interrumpida no se duplica.
  if exists(select 1 from public.incidencias_mensajes where id=p_mensaje_id and incidencia_id=p_id and user_id=auth.uid()) then return; end if;
  update public.incidencias set estatus=p_estatus where id=p_id and updated_at=p_version;
  if not found then raise exception 'El reporte cambió. Recarga antes de guardar'; end if;
  if trim(coalesce(p_mensaje,'')) <> '' then
    insert into public.incidencias_mensajes(id,incidencia_id,user_id,mensaje)
    values(p_mensaje_id,p_id,auth.uid(),trim(p_mensaje));
  end if;
end $$;
revoke all on function public.incidencias_guardar_seguimiento(uuid,text,text,timestamptz,uuid) from public,anon;
grant execute on function public.incidencias_guardar_seguimiento(uuid,text,text,timestamptz,uuid) to authenticated;

create or replace function public.notificar_ticket_nuevo()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.notificaciones(user_id,tipo,titulo,mensaje,url)
  select p.id,'ticket_nuevo','Nuevo reporte: '||new.titulo,
    'Hay un reporte nuevo para revisar ('||new.tipo||').',
    'hub/tickets.html?id='||new.id
  from public.profiles p where p.role in ('master','admin') and p.id<>new.user_id;
  return new;
end $$;
revoke all on function public.notificar_ticket_nuevo() from public,anon,authenticated;

create or replace function public.notificar_ticket_actualizado()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (new.estatus is distinct from old.estatus or new.respuesta is distinct from old.respuesta)
    and auth.uid() is distinct from new.user_id then
    insert into public.notificaciones(user_id,tipo,titulo,mensaje,url)
    values(new.user_id,'ticket_actualizado','Actualizaron tu reporte: '||new.titulo,
      case when new.respuesta is distinct from old.respuesta and coalesce(new.respuesta,'')<>''
        then 'Te respondieron: '||left(new.respuesta,120)
        else 'Estado: '||case new.estatus when 'en_revision' then 'En revisión' when 'resuelto' then 'Resuelto' else 'Abierto' end end,
      'hub/tickets.html?id='||new.id);
  end if;
  return new;
end $$;
revoke all on function public.notificar_ticket_actualizado() from public,anon,authenticated;

create or replace function public.notificar_mensaje_incidencia()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_reporte public.incidencias%rowtype;
begin
  select * into v_reporte from public.incidencias where id=new.incidencia_id;
  insert into public.notificaciones(user_id,tipo,titulo,mensaje,url)
  select p.id,'ticket_actualizado','Nuevo comentario: '||v_reporte.titulo,left(new.mensaje,160),
    'hub/tickets.html?id='||new.incidencia_id
  from public.profiles p where p.id<>new.user_id and
    (p.id=v_reporte.user_id or (new.user_id=v_reporte.user_id and p.role in ('admin','master')));
  return new;
end $$;
revoke all on function public.notificar_mensaje_incidencia() from public,anon,authenticated;
drop trigger if exists notificar_mensaje_incidencia on public.incidencias_mensajes;
create trigger notificar_mensaje_incidencia after insert on public.incidencias_mensajes
for each row execute function public.notificar_mensaje_incidencia();
