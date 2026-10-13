create or replace function public.propiedades_inventario_mapa(p_filtros jsonb default '{}')
returns jsonb language sql stable security invoker
set search_path=pg_catalog,public set jit=off as $$
 with filtradas as materialized (
  select id,lat,lng from public.propiedades_inventario_filtradas(p_filtros)
 ), ubicadas as materialized (
  select id,lat,lng from filtradas
  where lat between -85.05112878 and 85.05112878
    and lng between -180 and 180 and (lat<>0 or lng<>0)
 ), puntos as (
  select id,lat,lng from ubicadas order by id limit 12000
 )
 select jsonb_build_object(
  'total',(select count(*) from filtradas),
  'ubicadas',(select count(*) from ubicadas),
  'limite',12000,
  'puntos',coalesce((select jsonb_agg(jsonb_build_array(p.id,p.lat,p.lng,i.operacion) order by p.id) from puntos p join public.propiedades_inventario i on i.id=p.id),'[]'::jsonb)
 );
$$;
revoke all on function public.propiedades_inventario_mapa(jsonb) from public,anon;
grant execute on function public.propiedades_inventario_mapa(jsonb) to authenticated,service_role;
notify pgrst,'reload schema';
