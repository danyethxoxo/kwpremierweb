-- Devuelve opciones únicas, no miles de filas repetidas para cada filtro.
-- El nombre conserva el contexto de inventario autorizado por la política
-- select_authenticated_via_propiedades_inventario. No eleva privilegios.
create or replace function public.propiedades_inventario_catalogo(
  p_campo text, p_mc text default null, p_estado text default null,
  p_municipio text default null
) returns jsonb
language plpgsql stable security invoker set search_path = pg_catalog, public
as $$
declare resultado jsonb;
begin
  if p_campo = 'colonia' then
    select coalesce(jsonb_agg(to_jsonb(opcion)), '[]'::jsonb) into resultado
    from (
      select distinct p.colonia, coalesce(p.municipio,'') as municipio,
        coalesce(p.estado,'') as estado
      from public.propiedades_inventario p
      where p.fuente = 'kwmexico' and nullif(p.colonia,'') is not null
        and lower(trim(coalesce(p.estado,''))) <> 'antioquia'
        and (nullif(p_estado,'') is null or p.estado = p_estado)
        and (nullif(p_municipio,'') is null or p.municipio = p_municipio)
    ) opcion;
  elsif p_campo = 'tipos_filtro' then
    select coalesce(jsonb_agg(jsonb_build_object('tipos_filtro',array[opcion.tipo])), '[]'::jsonb)
    into resultado from (
      select distinct unnest(p.tipos_filtro) as tipo
      from public.propiedades_inventario p where p.fuente = 'kwmexico'
    ) opcion where nullif(opcion.tipo,'') is not null;
  elsif p_campo in ('market_center','asesor_nombre','estado','municipio') then
    select coalesce(jsonb_agg(jsonb_build_object(p_campo,opcion.valor)), '[]'::jsonb)
    into resultado from (
      select distinct case p_campo
        when 'market_center' then p.market_center when 'asesor_nombre' then p.asesor_nombre
        when 'estado' then p.estado when 'municipio' then p.municipio end as valor
      from public.propiedades_inventario p
      where p.fuente = 'kwmexico'
        and (p_campo <> 'asesor_nombre' or nullif(p_mc,'') is null or p.market_center = p_mc)
        and (p_campo <> 'municipio' or nullif(p_estado,'') is null or p.estado = p_estado)
        and (p_campo <> 'estado' or lower(trim(coalesce(p.estado,''))) <> 'antioquia')
        and (p_campo <> 'estado' or nullif(p_municipio,'') is null or p.municipio = p_municipio)
    ) opcion where nullif(opcion.valor,'') is not null;
  else
    raise exception 'Campo de catálogo no permitido' using errcode = '22023';
  end if;
  return resultado;
end;
$$;
revoke all on function public.propiedades_inventario_catalogo(text,text,text,text) from public, anon;
grant execute on function public.propiedades_inventario_catalogo(text,text,text,text) to authenticated, service_role;
notify pgrst, 'reload schema';
