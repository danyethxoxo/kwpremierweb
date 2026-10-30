create table public.dictamen_autoguardados (
  user_id uuid not null references public.profiles(id) on delete cascade,
  dictamen_id uuid not null references public.dictamenes(id) on delete cascade,
  datos jsonb not null check (jsonb_typeof(datos) = 'object' and octet_length(datos::text) <= 131072),
  updated_at timestamptz not null default now(),
  primary key (user_id, dictamen_id)
);
create index dictamen_autoguardados_dictamen_idx on public.dictamen_autoguardados(dictamen_id);
alter table public.dictamen_autoguardados enable row level security;
revoke all on public.dictamen_autoguardados from anon, authenticated;
grant select, delete on public.dictamen_autoguardados to authenticated;
create policy respaldo_propio on public.dictamen_autoguardados for select to authenticated
  using (user_id = (select auth.uid()) and (select private.puede_dictaminar()) and (select public.mfa_sesion_autorizada()));
create policy quitar_respaldo_propio on public.dictamen_autoguardados for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.puede_dictaminar()) and (select public.mfa_sesion_autorizada()));

create function public.autoguardar_dictamen(p_id uuid, p_datos jsonb, p_nuevo boolean default false)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_dic public.dictamenes%rowtype;
  v_asesor uuid;
  v_inmueble text;
begin
  if auth.uid() is null or private.puede_dictaminar() is not true or public.mfa_sesion_autorizada() is not true then
    raise exception 'No tienes permiso para guardar este borrador';
  end if;
  if p_id is null or jsonb_typeof(p_datos) is distinct from 'object' or octet_length(p_datos::text) > 131072 then
    raise exception 'Borrador no valido';
  end if;
  -- El mismo ID hace idempotentes los reintentos despues de una desconexion.
  if p_nuevo then
    insert into public.dictamenes (id, dictaminado_por, estado) values (p_id, auth.uid(), 'borrador')
      on conflict (id) do nothing;
  end if;
  select * into v_dic from public.dictamenes where id=p_id for update;
  if not found or v_dic.archivado_at is not null then raise exception 'El dictamen ya no esta disponible'; end if;
  insert into public.dictamen_autoguardados(user_id,dictamen_id,datos,updated_at)
  values(auth.uid(),p_id,p_datos,clock_timestamp())
  on conflict(user_id,dictamen_id) do update set datos=excluded.datos,updated_at=excluded.updated_at;
  -- La vista previa del borrador se identifica en el listado. Un dictamen
  -- emitido conserva todos sus datos hasta que se pulsa Guardar.
  if v_dic.estado='borrador' and v_dic.folio is null then
    select id into v_asesor from public.dictamen_asesores where id::text=p_datos#>>'{borrador,asesor_id}';
    v_inmueble:=nullif(trim(p_datos#>>'{borrador,inmueble}'),'');
    update public.dictamenes set asesor_id=v_asesor,inmueble=v_inmueble,
      operacion=case when p_datos#>>'{borrador,operacion}' in ('venta','renta') then p_datos#>>'{borrador,operacion}' else operacion end,
      uso=case when p_datos#>>'{borrador,uso}' in ('residencial','comercial','mixto','terreno_ejidal') then p_datos#>>'{borrador,uso}' else uso end
    where id=p_id;
  end if;
  return p_id;
end; $$;
revoke all on function public.autoguardar_dictamen(uuid,jsonb,boolean) from public, anon;
grant execute on function public.autoguardar_dictamen(uuid,jsonb,boolean) to authenticated;

create or replace function public.dictamen_historia()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if tg_op='INSERT' then
    perform public.dictamen_anotar(new.id,'creado','Borrador');return new;
  end if;
  if new.estado is distinct from old.estado then
    perform public.dictamen_anotar(new.id,'estado',public.dictamen_nombre_estado(new.estado)||
      case when new.folio is distinct from old.folio and new.folio is not null then '. Folio '||new.folio else '' end);
  end if;
  if new.observaciones is distinct from old.observaciones then
    perform public.dictamen_anotar(new.id,'observaciones','Se actualizaron las observaciones y correcciones del dictamen.');
  end if;
  if new.estatus_listado is distinct from old.estatus_listado then
    perform public.dictamen_anotar(new.id,'listado','Listado: '||public.dictamen_nombre_estado(new.estatus_listado));
  end if;
  if new.archivado_at is distinct from old.archivado_at then
    perform public.dictamen_anotar(new.id,case when new.archivado_at is null then 'restaurado' else 'archivado' end,
      case when new.archivado_at is null then 'Se regreso del archivo' else 'Se archivo' end);
  end if;
  return new;
end; $$;
revoke execute on function public.dictamen_historia() from public, anon, authenticated;

drop policy if exists delete_borradores on public.dictamenes;
create policy delete_borradores on public.dictamenes for delete to authenticated
  using (private.puede_dictaminar() and estado='borrador' and folio is null);

create or replace function public.dictamen_punto_historia()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if tg_op='DELETE' then
    -- Una eliminacion en cascada no puede crear historial de un padre eliminado.
    if exists(select 1 from public.dictamenes where id=old.dictamen_id) then
      perform public.dictamen_anotar(old.dictamen_id,'punto_quitado','Se quitó: '||old.texto);
    end if;
    return old;
  end if;
  if tg_op='INSERT' then
    perform public.dictamen_anotar(new.dictamen_id,'punto_nuevo','Se pidió: '||new.texto);return new;
  end if;
  if new.texto is distinct from old.texto then
    perform public.dictamen_anotar(new.dictamen_id,'punto_editado','Antes: '||old.texto||E'\nAhora: '||new.texto);
  end if;
  if new.estado is distinct from old.estado then
    perform public.dictamen_anotar(new.dictamen_id,case when new.estado='corregida' then 'punto_corregida' else 'punto_pendiente' end,
      case when new.estado='corregida' then 'Corregida: ' else 'De vuelta a pendiente: ' end||new.texto);
  end if;
  if new.nota is distinct from old.nota then
    perform public.dictamen_anotar(new.dictamen_id,'punto_nota',coalesce(new.nota,'Se quitó la nota de la observación.'));
  end if;
  return new;
end; $$;
revoke execute on function public.dictamen_punto_historia() from public, anon, authenticated;
