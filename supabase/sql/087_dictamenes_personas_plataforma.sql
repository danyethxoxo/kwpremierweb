-- 087_dictamenes_personas_plataforma.sql
--
-- El selector de Dictámenes debe incluir a toda persona vigente en el
-- Market Center: asesores activos, back office activo y usuarios con
-- cuenta en la plataforma. `dictamen_asesores` se conserva como catálogo
-- histórico para no cambiar los UUID de dictámenes ya creados.
--
-- Requiere 079_dictamen_asesores_base.sql.

create or replace function public.dictamen_asesores_reconciliar()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila record;
begin
  -- La base central tiene prioridad para el nombre si una persona existe
  -- también como usuario. El correo es la llave común y evita duplicados.
  for v_fila in
    select distinct on (lower(trim(correo)))
      lower(trim(correo)) as correo,
      nombre
    from (
      select a.correo,
             nullif(trim(a.nombre), '') as nombre,
             1 as prioridad
        from public.asesores a
       where a.grupo in ('asesor_activo', 'back_office_activo')
         and nullif(trim(a.correo), '') is not null

      union all

      select p.email as correo,
             nullif(trim(concat_ws(' ', p.nombre, p.apellido)), '') as nombre,
             2 as prioridad
        from public.profiles p
       where nullif(trim(p.email), '') is not null
    ) personas
    order by lower(trim(correo)), prioridad, nombre nulls last
  loop
    perform public.dictamen_asesor_reflejar(v_fila.correo, v_fila.nombre, true);
  end loop;

  -- Quien ya no sea persona activa del directorio ni tenga cuenta queda
  -- conservado para los dictámenes históricos, pero no aparece al crear
  -- uno nuevo.
  update public.dictamen_asesores d
     set activo = false
   where d.activo
     and not exists (
       select 1
       from (
         select lower(trim(a.correo)) as correo
           from public.asesores a
          where a.grupo in ('asesor_activo', 'back_office_activo')
            and nullif(trim(a.correo), '') is not null

         union

         select lower(trim(p.email)) as correo
           from public.profiles p
          where nullif(trim(p.email), '') is not null
       ) personas
       where personas.correo = lower(trim(d.correo))
     );
end;
$$;

revoke all on function public.dictamen_asesores_reconciliar() from public;

-- Reemplaza la sincronización anterior, que solo consideraba
-- `asesor_activo`, por la conciliación de las tres fuentes vigentes.
create or replace function public.dictamen_asesores_actualizar_desde_base()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activos integer;
  v_total integer;
begin
  if not public.is_staff_or_above() then
    raise exception 'Solo liderazgo puede actualizar el catálogo de personas.';
  end if;

  perform public.dictamen_asesores_reconciliar();

  select count(*) filter (where activo), count(*)
    into v_activos, v_total
    from public.dictamen_asesores;

  return jsonb_build_object('activos', v_activos, 'total', v_total);
end;
$$;

revoke all on function public.dictamen_asesores_actualizar_desde_base() from public;
grant execute on function public.dictamen_asesores_actualizar_desde_base() to authenticated;

-- Si cambia el directorio central o un perfil, el catálogo se actualiza
-- de inmediato. Así no depende de que alguien vuelva a abrir Dictámenes.
create or replace function public.dictamen_asesores_reflejar_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.dictamen_asesores_reconciliar();
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists dictamen_asesores_desde_base on public.asesores;
create trigger dictamen_asesores_desde_base
  after insert or update of correo, nombre, grupo or delete on public.asesores
  for each row execute function public.dictamen_asesores_reflejar_cambio();

create or replace function public.dictamen_asesores_reflejar_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.dictamen_asesores_reconciliar();
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists dictamen_asesores_desde_profiles on public.profiles;
create trigger dictamen_asesores_desde_profiles
  after insert or update of email, nombre, apellido or delete on public.profiles
  for each row execute function public.dictamen_asesores_reflejar_perfil();

-- Primera conciliación al ejecutar este archivo.
select public.dictamen_asesores_reconciliar();
