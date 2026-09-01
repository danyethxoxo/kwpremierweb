-- ═════════════════════════════════════════════════════════════
-- 074 · Dictámenes: borradores incompletos
-- ═════════════════════════════════════════════════════════════
--
-- Permite guardar el formulario antes de contar con asesor o dirección.
-- El sitio mantiene esos expedientes en borrador y solo ofrece dictaminar
-- cuando ya tienen asesor, inmueble y por lo menos un cliente.

alter table public.dictamenes
  alter column asesor_id drop not null,
  alter column inmueble drop not null;

-- La vista usaba un JOIN obligatorio con asesores. Con LEFT JOIN, un
-- borrador sin asesor sigue apareciendo en la lista para poder retomarlo.
create or replace view public.dictamenes_con_asesor as
select
  d.id, d.folio, d.asesor_id, d.dictaminado_por,
  d.fecha_dictamen, d.cliente, d.inmueble,
  d.operacion, d.uso, d.tipo_inmueble_id, d.tipo_contrato,
  d.precio_listado, d.comision_porcentaje,
  d.escritura_propiedad,
  d.escritura_numero, d.escritura_fecha, d.notario_nombre, d.notaria_numero,
  d.condominio, d.escritura_condominio, d.cfdi,
  d.superficie_escritura, d.cuenta_predial, d.superficie_predial,
  d.superficie_terreno, d.superficie_construccion,
  d.estado_civil, d.folio_real, d.observaciones,
  d.estado, d.estatus_listado, d.archivado_at, d.dictaminado_at,
  d.created_at, d.updated_at,
  a.nombre          as asesor_nombre,
  a.correo          as asesor_correo,
  t.nombre          as tipo_inmueble,
  q.nombre          as dictaminador_nombre,
  q.apellido        as dictaminador_apellido,
  coalesce(c.total, 0)       as puntos_total,
  coalesce(c.pendientes, 0)  as puntos_pendientes,
  coalesce(c.corregidas, 0)  as puntos_corregidas,
  coalesce(cl.total, 0)      as clientes_total,
  coalesce(cl.nombres, d.cliente) as clientes_nombres
from public.dictamenes d
left join public.dictamen_asesores a on a.id = d.asesor_id
left join public.dictamen_tipos_inmueble t on t.id = d.tipo_inmueble_id
left join public.profiles q on q.id = d.dictaminado_por
left join lateral (
  select
    count(*)                                     as total,
    count(*) filter (where estado = 'pendiente') as pendientes,
    count(*) filter (where estado = 'corregida') as corregidas
  from public.dictamen_puntos pt
  where pt.dictamen_id = d.id
) c on true
left join lateral (
  select count(*) as total, string_agg(cx.nombre, ', ' order by cx.orden) as nombres
  from public.dictamen_clientes cx
  where cx.dictamen_id = d.id
) cl on true
where public.is_staff_or_above();

grant select on public.dictamenes_con_asesor to authenticated;
