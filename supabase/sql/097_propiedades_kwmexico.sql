-- Inventario privado de KW Premier alimentado desde el catalogo de KW Mexico.
-- Se conserva la vista publica para las propiedades manuales ya existentes,
-- pero nunca se exponen desde ella las filas cuya fuente es kwmexico.

create index if not exists idx_propiedades_fuente_mc
  on public.propiedades(fuente, market_center, updated_at desc);

drop policy if exists "select_publicadas" on public.propiedades;
drop policy if exists "select_publicadas_anon" on public.propiedades;
create policy "select_publicadas" on public.propiedades
  for select to anon, authenticated
  using (
    public.is_staff_or_above()
    or (
      estatus = 'publicada'
      and (auth.uid() is not null or fuente <> 'kwmexico')
    )
  );

create or replace view public.propiedades_inventario
with (security_invoker = true)
as
select
  p.id, p.fuente_id,
  p.titulo, p.descripcion, p.operacion, p.estatus, p.tipo,
  p.precio, p.moneda,
  p.recamaras, p.banos, p.estacionamientos,
  p.m2_construccion, p.m2_terreno,
  p.calle, p.colonia, p.municipio, p.estado, p.cp, p.pais, p.lat, p.lng,
  p.imagenes, p.caracteristicas,
  p.asesor_id, p.asesor_nombre, p.market_center,
  p.created_at, p.updated_at,
  p.fuente
from public.propiedades p;

revoke all on public.propiedades_inventario from anon;
grant select on public.propiedades_inventario to authenticated;

create or replace view public.propiedades_publicas
with (security_invoker = true)
as
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
where p.estatus = 'publicada'
  and p.fuente <> 'kwmexico';

grant select on public.propiedades_publicas to anon, authenticated;
