-- Respuestas de CFDI y datos notariales independientes del condominio.
alter table public.dictamenes
  add column if not exists cfdi_necesario text check (cfdi_necesario in ('si', 'no', 'no_aplica')),
  add column if not exists cfdi_tiene text check (cfdi_tiene in ('si', 'no', 'no_aplica')),
  add column if not exists condominio_notario_nombre text,
  add column if not exists condominio_notaria_numero text;

-- Solo se infiere Sí para expedientes que ya tienen número de CFDI.
update public.dictamenes set cfdi_necesario = 'si', cfdi_tiene = 'si'
where nullif(trim(cfdi), '') is not null and cfdi_necesario is null and cfdi_tiene is null;

alter table public.dictamenes drop constraint if exists dictamenes_uso_check;
alter table public.dictamenes add constraint dictamenes_uso_check
  check (uso in ('residencial', 'comercial', 'mixto', 'terreno_ejidal'));

insert into public.dictamen_tipos_inmueble (nombre)
select 'Terreno ejidal' where not exists (
  select 1 from public.dictamen_tipos_inmueble where lower(trim(nombre)) = 'terreno ejidal'
);

create or replace view public.dictamenes_con_asesor as
select
  d.id,
  d.folio,
  d.revision,
  d.asesor_id,
  d.dictaminado_por,
  d.fecha_dictamen,
  d.cliente,
  d.inmueble,
  d.operacion,
  d.uso,
  d.tipo_inmueble_id,
  d.tipo_contrato,
  d.precio_listado,
  d.comision_porcentaje,
  d.escritura_propiedad,
  d.escritura_numero,
  d.escritura_fecha,
  d.notario_nombre,
  d.notaria_numero,
  d.condominio,
  d.escritura_condominio,
  d.cfdi,
  d.superficie_escritura,
  d.cuenta_predial,
  d.superficie_predial,
  d.superficie_terreno,
  d.superficie_construccion,
  d.estado_civil,
  d.folio_real,
  d.observaciones,
  d.estado,
  d.estatus_marketing,
  d.estatus_listado,
  d.archivado_at,
  d.dictaminado_at,
  d.created_at,
  d.updated_at,
  a.nombre as asesor_nombre,
  a.correo as asesor_correo,
  t.nombre as tipo_inmueble,
  q.nombre as dictaminador_nombre,
  q.apellido as dictaminador_apellido,
  coalesce(c.total, 0::bigint) as puntos_total,
  coalesce(c.pendientes, 0::bigint) as puntos_pendientes,
  coalesce(c.corregidas, 0::bigint) as puntos_corregidas,
  coalesce(cl.total, 0::bigint) as clientes_total,
  coalesce(cl.nombres, d.cliente) as clientes_nombres,
  d.marketing_checklist,
  d.marketing_comentario_general,
  d.escritura_condominio_fecha,
  d.cfdi_necesario,
  d.cfdi_tiene,
  d.condominio_notario_nombre,
  d.condominio_notaria_numero
from public.dictamenes d
join public.dictamen_asesores a on a.id = d.asesor_id
left join public.dictamen_tipos_inmueble t on t.id = d.tipo_inmueble_id
left join public.profiles q on q.id = d.dictaminado_por
left join lateral (
  select
    count(*) as total,
    count(*) filter (where pt.estado = 'pendiente') as pendientes,
    count(*) filter (where pt.estado = 'corregida') as corregidas
  from public.dictamen_puntos pt
  where pt.dictamen_id = d.id
) c on true
left join lateral (
  select
    count(*) as total,
    string_agg(cx.nombre, ', ' order by cx.orden) as nombres
  from public.dictamen_clientes cx
  where cx.dictamen_id = d.id
) cl on true
where private.is_staff_or_above();
