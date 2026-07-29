-- Fase 28b: los documentos hechos con el creador de formatos, vistos
-- desde el Panel.
--
-- La tabla `documentos_plantilla` (031) solo la ve su dueño o Admin/Master
-- (RLS). Pero el Panel de Liderazgo necesita revisar lo de todo el equipo,
-- igual que ya hace con los formatos fijos de siempre en `documentos_con_asesor`
-- (009). Esta vista es la misma idea: junta el documento con el nombre del
-- asesor y el nombre del formato usado, y el candado real está en el
-- `where` (staff para arriba, o el propio dueño).
--
-- Requiere 031_plantillas_documentos.sql.

create or replace view public.documentos_plantilla_con_asesor as
select
  d.id,
  d.plantilla_id,
  d.user_id,
  d.titulo,
  d.estado,
  d.folio,
  d.created_at,
  d.updated_at,
  d.finalizado_at,
  p.nombre as asesor_nombre,
  p.apellido as asesor_apellido,
  p.email as asesor_email,
  pl.nombre as plantilla_nombre,
  pl.categoria as plantilla_categoria
from public.documentos_plantilla d
join public.profiles p on p.id = d.user_id
left join public.plantillas_documento pl on pl.id = d.plantilla_id
where auth.uid() = d.user_id or public.is_staff_or_above();

grant select on public.documentos_plantilla_con_asesor to authenticated;
