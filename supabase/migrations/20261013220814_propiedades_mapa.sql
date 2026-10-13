-- Compartir exactamente los filtros vigentes entre las tarjetas y el mapa.
-- No altera RLS ni descarga fotografias para construir los pines.
do $migracion$
declare
 definicion text;
 inicio integer;
 fin integer;
 candidatos text;
begin
 definicion := pg_get_functiondef('public.propiedades_inventario_pagina(jsonb,integer)'::regprocedure);
 inicio := strpos(definicion, 'select p.id,p.updated_at,p.precio,p.m2_construccion from public.propiedades p');
 fin := strpos(definicion, '), pagina as materialized (');
 if inicio=0 and strpos(definicion,'from public.propiedades_inventario_filtradas(p_filtros)')>0 then return; end if;
 if inicio=0 or fin=0 then raise exception 'No se encontro la consulta paginada esperada'; end if;
 candidatos := substring(definicion from inicio for fin-inicio);
 candidatos := replace(candidatos, 'p.m2_construccion from', 'p.m2_construccion,p.lat,p.lng from');
 candidatos := candidatos || $zona$
 and (select auth.uid()) is not null
 and (p_filtros->'zona' is null or p_filtros->'zona'='null'::jsonb or (
   jsonb_array_length(p_filtros->'zona')=4
   and p.lat between (p_filtros->'zona'->>0)::numeric and (p_filtros->'zona'->>2)::numeric
   and p.lng between (p_filtros->'zona'->>1)::numeric and (p_filtros->'zona'->>3)::numeric
 ))
 $zona$;
 execute 'create or replace function public.propiedades_inventario_filtradas(p_filtros jsonb default ''{}'')
 returns table(id uuid,updated_at timestamptz,precio numeric,m2_construccion numeric,lat numeric,lng numeric)
 language sql stable security invoker set search_path=pg_catalog,public set jit=off as '
 || quote_literal(candidatos);
 -- Mantener la paginacion y la ficha originales, incluida su vista protegida.
 execute substring(definicion from 1 for inicio-1)
 || 'select p.id,p.updated_at,p.precio,p.m2_construccion from public.propiedades_inventario_filtradas(p_filtros) p '
 || substring(definicion from fin);
end;
$migracion$;

revoke all on function public.propiedades_inventario_filtradas(jsonb) from public,anon;
grant execute on function public.propiedades_inventario_filtradas(jsonb) to authenticated,service_role;

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
  'puntos',coalesce((select jsonb_agg(jsonb_build_array(id,lat,lng) order by id) from puntos),'[]'::jsonb)
 );
$$;
revoke all on function public.propiedades_inventario_mapa(jsonb) from public,anon;
grant execute on function public.propiedades_inventario_mapa(jsonb) to authenticated,service_role;
notify pgrst,'reload schema';
