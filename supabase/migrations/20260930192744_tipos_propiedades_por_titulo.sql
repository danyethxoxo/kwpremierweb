create or replace function public.propiedad_tipos_filtro(tipo_original text, titulo text)
returns text[] language plpgsql immutable parallel safe security invoker set search_path = pg_catalog
as $$
declare
 texto text := lower(translate(coalesce(titulo,''), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu'));
 palabra text;
 inferido text;
 tipos text[] := case when nullif(trim(tipo_original),'') is null then array[]::text[] else array[trim(tipo_original)] end;
begin
 -- El primer tipo mencionado describe el inmueble principal; los posteriores
 -- pueden ser usos posibles, anexos o referencias a su entorno.
 palabra := substring(texto from '\m(casas?|departamentos?|deptos?|depas?|terrenos?|lotes?|oficinas?|local|locales|bodegas?|duplex|naves?|edificios?|ranchos?)\M');
 if palabra is null then return tipos; end if;
 if texto ~ '\m(busco|buscamos|busca|necesito|necesitamos)\M' then return tipos; end if;
 inferido := case
 when palabra ~ '^casa' then 'Casa'
 when palabra ~ '^(departamento|depto|depa)' then 'Departamento'
 when palabra ~ '^(terreno|lote)' then 'Terreno'
 when palabra ~ '^oficina' then 'Oficina'
 when palabra ~ '^local' then 'Local comercial'
 when palabra ~ '^bodega' then 'Bodega'
 when palabra = 'duplex' then 'Duplex'
 when palabra ~ '^nave' then 'Nave industrial'
 when palabra ~ '^edificio' then 'Edificio'
 when palabra ~ '^rancho' then 'Rancho'
 end;
 if inferido is not null and not (inferido = any(tipos)) then tipos := array_append(tipos,inferido); end if;
 return tipos;
end;
$$;
revoke all on function public.propiedad_tipos_filtro(text,text) from public, anon;
grant execute on function public.propiedad_tipos_filtro(text,text) to authenticated, service_role;
create index if not exists propiedades_tipos_filtro_gin
on public.propiedades using gin (public.propiedad_tipos_filtro(tipo,titulo));
create or replace view public.propiedades_inventario
with (security_invoker = true) as
select p.id, p.fuente_id, p.titulo, p.descripcion, p.operacion, p.estatus, p.tipo,
p.precio, p.moneda, p.recamaras, p.banos, p.estacionamientos,
p.m2_construccion, p.m2_terreno, p.calle, p.colonia, p.municipio, p.estado, p.cp, p.pais, p.lat, p.lng,
p.imagenes, p.caracteristicas, p.asesor_id, p.asesor_nombre, p.market_center,
p.created_at, p.updated_at, p.fuente,
case when p.fuente = 'kwmexico' and coalesce(
nullif(p.datos_origen->'listado'->>'Property_Command_ID', ''),
nullif(p.datos_origen->'detalle'->'data'->'Property_Data'->0->>'Property_Command_ID', '')
) ~ '^[0-9]+$' then
'https://kw.com/es-419/property/' ||
coalesce(nullif(regexp_replace(regexp_replace(trim(concat_ws(' ',
p.datos_origen->'listado'->>'Street_Number',
p.datos_origen->'listado'->>'Street',
p.datos_origen->'listado'->>'City',
p.datos_origen->'listado'->>'State',
p.datos_origen->'listado'->>'Postal_Code'
)), '[^a-zA-Z0-9 -]', '', 'g'), '[ -]+', '-', 'g'), ''), 'Propiedad') ||
'/' || coalesce(
nullif(p.datos_origen->'listado'->>'Property_Command_ID', ''),
nullif(p.datos_origen->'detalle'->'data'->'Property_Data'->0->>'Property_Command_ID', '')
) end as enlace_kw, p.asesor_kw_id, public.propiedad_tipos_filtro(p.tipo,p.titulo) as tipos_filtro
from public.propiedades p;
