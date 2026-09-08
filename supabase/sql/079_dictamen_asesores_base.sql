-- 079_dictamen_asesores_base.sql
-- Mantiene el catálogo histórico de Dictámenes sincronizado con la tabla
-- central public.asesores sin cambiar los UUID que ya usan los expedientes.
-- Requiere 061_dictamenes.sql y 073_asesores.sql.

create or replace function public.dictamen_asesor_reflejar(
  p_correo text,
  p_nombre text,
  p_activo boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_correo text := lower(trim(coalesce(p_correo, '')));
begin
  if v_correo = '' then
    return null;
  end if;

  select id into v_id
  from public.dictamen_asesores
  where lower(trim(coalesce(correo, ''))) = v_correo
  order by created_at
  limit 1;

  if v_id is null then
    insert into public.dictamen_asesores (nombre, correo, activo)
    values (coalesce(nullif(trim(p_nombre), ''), v_correo), v_correo, coalesce(p_activo, false))
    returning id into v_id;
  else
    update public.dictamen_asesores
       set nombre = coalesce(nullif(trim(p_nombre), ''), nombre),
           correo = v_correo,
           activo = coalesce(p_activo, false)
     where id = v_id
       and (nombre is distinct from coalesce(nullif(trim(p_nombre), ''), nombre)
         or correo is distinct from v_correo
         or activo is distinct from coalesce(p_activo, false));
  end if;

  return v_id;
end;
$$;

revoke all on function public.dictamen_asesor_reflejar(text, text, boolean) from public;

create or replace function public.dictamen_asesores_reflejar_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if nullif(trim(old.correo), '') is not null then
      update public.dictamen_asesores
         set activo = false
       where lower(trim(coalesce(correo, ''))) = lower(trim(old.correo));
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and lower(trim(coalesce(old.correo, ''))) is distinct from lower(trim(coalesce(new.correo, '')))
     and nullif(trim(old.correo), '') is not null then
    update public.dictamen_asesores
       set activo = false
     where lower(trim(coalesce(correo, ''))) = lower(trim(old.correo));
  end if;

  perform public.dictamen_asesor_reflejar(
    new.correo,
    new.nombre,
    new.grupo = 'asesor_activo'
  );
  return new;
end;
$$;

revoke all on function public.dictamen_asesores_reflejar_cambio() from public;

drop trigger if exists dictamen_asesores_desde_base on public.asesores;
create trigger dictamen_asesores_desde_base
  after insert or update of correo, nombre, grupo or delete on public.asesores
  for each row execute function public.dictamen_asesores_reflejar_cambio();

create or replace function public.dictamen_asesores_actualizar_desde_base()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila record;
  v_activos integer;
  v_total integer;
begin
  if not public.is_staff_or_above() then
    raise exception 'Solo liderazgo puede actualizar el catálogo de asesores.';
  end if;

  for v_fila in
    select correo, nombre, grupo
      from public.asesores
     where nullif(trim(correo), '') is not null
  loop
    perform public.dictamen_asesor_reflejar(
      v_fila.correo,
      v_fila.nombre,
      v_fila.grupo = 'asesor_activo'
    );
  end loop;

  update public.dictamen_asesores d
     set activo = false
   where nullif(trim(d.correo), '') is not null
     and not exists (
       select 1
         from public.asesores a
        where lower(trim(a.correo)) = lower(trim(d.correo))
          and a.grupo = 'asesor_activo'
     );

  select count(*) filter (where activo), count(*)
    into v_activos, v_total
    from public.dictamen_asesores;

  return jsonb_build_object('activos', v_activos, 'total', v_total);
end;
$$;

revoke all on function public.dictamen_asesores_actualizar_desde_base() from public;
grant execute on function public.dictamen_asesores_actualizar_desde_base() to authenticated;

-- Primera conciliación al instalar la migración. Aquí se replica el cuerpo
-- sin exigir una sesión autenticada en el SQL Editor.
do $$
declare
  v_fila record;
begin
  for v_fila in
    select correo, nombre, grupo
      from public.asesores
     where nullif(trim(correo), '') is not null
  loop
    perform public.dictamen_asesor_reflejar(
      v_fila.correo,
      v_fila.nombre,
      v_fila.grupo = 'asesor_activo'
    );
  end loop;

  update public.dictamen_asesores d
     set activo = false
   where nullif(trim(d.correo), '') is not null
     and not exists (
       select 1
         from public.asesores a
        where lower(trim(a.correo)) = lower(trim(d.correo))
          and a.grupo = 'asesor_activo'
     );
end;
$$;
