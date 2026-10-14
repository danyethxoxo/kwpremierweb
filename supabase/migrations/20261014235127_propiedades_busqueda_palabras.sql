-- Palabras independientes, acentos y equivalencias inmobiliarias, sin servicios externos.
create or replace function public.propiedad_palabras_normalizar(texto text) returns text
language sql immutable parallel safe security invoker set search_path=pg_catalog as $$
 select regexp_replace(regexp_replace(regexp_replace(regexp_replace(
 translate(lower(coalesce(texto,'')),'áéíóúüñ','aeiouun'),
 '\mworld\s+trade\s+cent(er|re)\M','wtc','g'),
 '\m(depto|dpto|depa|deptos|dptos|depas)\M','departamento','g'),
 '\m(piscina|piscinas)\M','alberca','g'),
 '\m(cochera|cocheras|parking)\M','estacionamiento','g')
$$;

create or replace function public.propiedad_palabras_consulta(texto text) returns tsquery
language sql immutable parallel safe security invoker set search_path=pg_catalog,public as $$
 select plainto_tsquery('pg_catalog.spanish',public.propiedad_palabras_normalizar(texto))
$$;

alter table public.propiedades add column busqueda_palabras tsvector generated always as (
 to_tsvector('pg_catalog.spanish',public.propiedad_palabras_normalizar(
 coalesce(titulo,'')||' '||coalesce(asesor_nombre,'')||' '||coalesce(calle,'')||' '||
 coalesce(colonia,'')||' '||coalesce(municipio,'')||' '||coalesce(estado,'')||' '||
 coalesce(public.comprador_tipo_validado(tipo,titulo),'')||' '||coalesce(market_center,'')
 ))) stored;
create index propiedades_busqueda_palabras_idx on public.propiedades using gin(busqueda_palabras);

do $$
declare definicion text; anterior text;
begin
 select pg_get_functiondef('public.propiedades_inventario_filtradas(jsonb)'::regprocedure) into definicion;
 anterior := $old$(nullif(p_filtros->>'texto','') is null or strpos(translate(lower(concat_ws(' ',p.titulo,p.asesor_nombre,p.calle,p.colonia,p.municipio,p.estado,p.tipo_comprador,p.market_center)),'áéíóúüñ','aeiouun'),translate(lower(p_filtros->>'texto'),'áéíóúüñ','aeiouun'))>0)$old$;
 if strpos(definicion,anterior)=0 then raise exception 'No se encontro el filtro de texto esperado'; end if;
 execute replace(definicion,anterior,$new$(nullif(btrim(p_filtros->>'texto'),'') is null or p.busqueda_palabras @@ public.propiedad_palabras_consulta(p_filtros->>'texto'))$new$);
end $$;

revoke all on function public.propiedad_palabras_normalizar(text),public.propiedad_palabras_consulta(text) from public,anon;
grant execute on function public.propiedad_palabras_normalizar(text),public.propiedad_palabras_consulta(text) to authenticated,service_role;
