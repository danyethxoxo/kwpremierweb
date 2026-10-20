-- Anexar precio y moneda a la respuesta compacta sin cambiar índices previos.
-- Mantener SECURITY INVOKER y la misma vista y filtros con RLS.
create or replace function public.propiedades_inventario_mapa(p_filtros jsonb default '{}'::jsonb)
returns jsonb language sql stable
set search_path to 'pg_catalog', 'public'
set jit to 'off'
as $function$
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
  'puntos',coalesce((select jsonb_agg(jsonb_build_array(p.id,p.lat,p.lng,
   case when cardinality(i.operaciones_filtro)>1 then 'mixto' else i.operacion end,
   i.precio,i.moneda) order by p.id)
   from puntos p join public.propiedades_inventario i on i.id=p.id),'[]'::jsonb)
 );
$function$;
notify pgrst,'reload schema';
