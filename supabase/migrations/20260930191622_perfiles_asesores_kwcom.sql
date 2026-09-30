alter table public.propiedades add column if not exists asesor_kw_id text;
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
) end as enlace_kw, p.asesor_kw_id
from public.propiedades p;
