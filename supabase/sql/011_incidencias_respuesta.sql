-- Fase 11b: la incidencia ahora vive en su propia página (hub/incidencias.html)
-- en vez de estar dentro de Accesos Directos ni del panel de Admin. Se agrega
-- un campo de "respuesta" para que Master/Admin puedan contestarle a quien
-- reportó. Ejecutar completo en Supabase Dashboard > SQL Editor.

alter table public.incidencias add column if not exists respuesta text;

-- "respuesta" va al final del select: Postgres no permite insertar una
-- columna nueva a la mitad de una vista existente con CREATE OR REPLACE,
-- solo agregarla al final (si no, da error "cannot change name of view column").
create or replace view public.incidencias_con_reportante as
select
  i.id,
  i.user_id,
  i.titulo,
  i.descripcion,
  i.imagenes,
  i.estatus,
  i.created_at,
  i.updated_at,
  p.nombre as reportante_nombre,
  p.apellido as reportante_apellido,
  p.email as reportante_email,
  i.respuesta
from public.incidencias i
join public.profiles p on p.id = i.user_id
where auth.uid() = i.user_id or public.is_admin_or_master();

grant select on public.incidencias_con_reportante to authenticated;
