-- Fase 27: el inventario completo para quien tiene sesión.
--
-- La página de Propiedades es pública, y hacia afuera solo debe verse lo
-- publicado. Pero adentro los asesores necesitan buscar por estatus
-- (vendidas, rentadas, borradores) para saber qué pasó con cada cosa.
--
-- Se resuelve con una vista aparte: mismas columnas seguras que la
-- pública, sin el filtro de estatus, y con permiso de lectura solo para
-- `authenticated`. `anon` no la puede tocar, así que el visitante de la
-- calle sigue viendo únicamente lo publicado.
--
-- Requiere 023_propiedades.sql.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

create or replace view public.propiedades_inventario as
select
  p.id, p.fuente_id,
  p.titulo, p.descripcion, p.operacion, p.estatus, p.tipo,
  p.precio, p.moneda,
  p.recamaras, p.banos, p.estacionamientos,
  p.m2_construccion, p.m2_terreno,
  p.calle, p.colonia, p.municipio, p.estado, p.cp, p.pais, p.lat, p.lng,
  p.imagenes, p.caracteristicas,
  p.asesor_id, p.asesor_nombre, p.market_center,
  p.created_at, p.updated_at
from public.propiedades p;

-- Una vista corre con los permisos de su dueño, así que el candado real
-- es a quién se le da el `select`: aquí, solo a quien inició sesión.
revoke all on public.propiedades_inventario from anon;
grant select on public.propiedades_inventario to authenticated;

-- La vista pública sigue igual, pero se le agrega market_center y calle
-- para que la búsqueda por dirección funcione también sin sesión.
-- (Las columnas nuevas van al final: `create or replace view` no deja
-- meterlas a la mitad.)
create or replace view public.propiedades_publicas as
select
  p.id, p.fuente_id,
  p.titulo, p.descripcion, p.operacion, p.tipo,
  p.precio, p.moneda,
  p.recamaras, p.banos, p.estacionamientos,
  p.m2_construccion, p.m2_terreno,
  p.colonia, p.municipio, p.estado, p.cp, p.pais, p.lat, p.lng,
  p.imagenes, p.caracteristicas,
  p.asesor_id, p.asesor_nombre, p.market_center,
  p.created_at, p.updated_at,
  p.estatus, p.calle
from public.propiedades p
where p.estatus = 'publicada';

grant select on public.propiedades_publicas to anon, authenticated;
