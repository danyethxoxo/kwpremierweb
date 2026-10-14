-- Una sola clasificacion para filtros, tarjetas, fichas y pines.
-- Conserva la operacion del feed cuando es valida. Los codigos desconocidos
-- se complementan con el titulo y, despues, con la descripcion.
create or replace function public.propiedad_operaciones_filtro(
 p_operacion text, p_titulo text, p_descripcion text
) returns text[] language plpgsql immutable parallel safe security invoker
set search_path=pg_catalog,public as $$
declare
 texto text;
 palabras text[];
 operaciones text[];
 palabra text;
 original text := lower(trim(p_operacion));
 es_titulo boolean := true;
begin
 if original in ('venta','renta') then return array[original]; end if;
 foreach texto in array array[p_titulo,p_descripcion] loop
  texto := translate(lower(regexp_replace(coalesce(texto,''),'<[^>]*>',' ','g')),'áéíóúü','aeiouu');
  operaciones := array[]::text[];
  -- Palabras completas: rentabilidad, preventas de boletos y restaurantes
  -- no deben convertir una propiedad en renta o venta.
  for palabras in select regexp_matches(texto,
   '\m(venta|ventas|vende|venden|vendo|vendemos|preventa|sale|selling|renta|rentan|rento|rentamos|alquiler|alquila|alquilan|arrendamiento|arrienda|rent|rental|lease)\M','g') loop
   palabra := case when palabras[1] in ('venta','ventas','vende','venden','vendo','vendemos','preventa','sale','selling') then 'venta' else 'renta' end;
   if not palabra=any(operaciones) then operaciones := array_append(operaciones,palabra); end if;
  end loop;
  if cardinality(operaciones)>0 then
   -- En la descripcion, una mencion secundaria (p. ej. potencial de renta)
   -- no constituye una segunda operacion. Exigir una oferta conjunta explicita.
   if not es_titulo
    and cardinality(operaciones)>1
    and texto !~ '\m(venta|renta)\M[[:space:]$€0-9.,]*(mxn|usd|pesos|dolares)?[[:space:]]*([/&,]|y/o|y|o|u)?[[:space:]]*(en[[:space:]]+)?\m(venta|renta)\M' then
    return array[operaciones[1]];
   end if;
   return operaciones;
  end if;
  es_titulo := false;
 end loop;
 return array[]::text[];
end;
$$;
revoke all on function public.propiedad_operaciones_filtro(text,text,text) from public,anon;
grant execute on function public.propiedad_operaciones_filtro(text,text,text) to authenticated,service_role;

-- Mantener todas las columnas y expresiones actuales de la vista protegida.
do $migracion$
declare definicion text; nueva text;
begin
 definicion := pg_get_viewdef('public.propiedades_inventario'::regclass,true);
 if strpos(definicion,'AS operaciones_filtro')=0 then
  nueva := regexp_replace(definicion,'(p\.)?\moperacion,',
   '(public.propiedad_operaciones_filtro(p.operacion,p.titulo,p.descripcion))[1] AS operacion,');
  if nueva=definicion then raise exception 'No se encontro la operacion de la vista'; end if;
  definicion := nueva;
  nueva := regexp_replace(definicion,'\s+FROM (public\.)?propiedades p;\s*$',
   ', public.propiedad_operaciones_filtro(p.operacion,p.titulo,p.descripcion) AS operaciones_filtro FROM public.propiedades p');
  if nueva=definicion then raise exception 'No se encontro la tabla de la vista'; end if;
  execute 'create or replace view public.propiedades_inventario with (security_invoker=true) as ' || nueva;
 end if;

 definicion := pg_get_functiondef('public.propiedades_inventario_filtradas(jsonb)'::regprocedure);
 nueva := replace(definicion,
  'p.operacion=any(public.propiedad_filtro_valores(p_filtros,''operacion''))',
  '(cardinality(public.propiedad_operaciones_filtro(p.operacion,p.titulo,p.descripcion))=0 or public.propiedad_operaciones_filtro(p.operacion,p.titulo,p.descripcion) && public.propiedad_filtro_valores(p_filtros,''operacion''))');
 if nueva=definicion and strpos(definicion,'propiedad_operaciones_filtro')=0 then
  raise exception 'No se encontro el filtro de operacion';
 end if;
 execute nueva;

 definicion := pg_get_functiondef('public.propiedades_inventario_pagina(jsonb,integer)'::regprocedure);
 if strpos(definicion,'v.operaciones_filtro')=0 then
  nueva := replace(definicion,'v.operacion,v.estatus','v.operacion,v.operaciones_filtro,v.estatus');
  if nueva=definicion then raise exception 'No se encontro la operacion de la tarjeta'; end if;
  execute nueva;
 end if;
end;
$migracion$;

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
  'puntos',coalesce((select jsonb_agg(jsonb_build_array(p.id,p.lat,p.lng,
   case when cardinality(i.operaciones_filtro)>1 then 'mixto' else i.operacion end) order by p.id)
   from puntos p join public.propiedades_inventario i on i.id=p.id),'[]'::jsonb)
 );
$$;
revoke all on function public.propiedades_inventario_mapa(jsonb) from public,anon;
grant execute on function public.propiedades_inventario_mapa(jsonb) to authenticated,service_role;
notify pgrst,'reload schema';
