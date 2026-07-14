-- Fase 11c: ajuste de permisos de incidencias — faltaba Staff en el
-- seguimiento (Admin, Master y Staff ven y dan seguimiento a todas);
-- solo Master puede eliminar un ticket por completo.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

drop policy if exists "select_own_or_staff" on public.incidencias;
create policy "select_own_or_staff" on public.incidencias
  for select using (auth.uid() = user_id or public.is_staff_or_above());

drop policy if exists "update_admin_or_master" on public.incidencias;
drop policy if exists "update_staff_or_above" on public.incidencias;
create policy "update_staff_or_above" on public.incidencias
  for update using (public.is_staff_or_above());

drop policy if exists "delete_admin_or_master" on public.incidencias;
drop policy if exists "delete_master_only" on public.incidencias;
create policy "delete_master_only" on public.incidencias
  for delete using (public.is_master());

-- "respuesta" va al final del select por la misma razón que en la
-- migración anterior (Postgres no deja reordenar columnas de vista).
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
where auth.uid() = i.user_id or public.is_staff_or_above();

grant select on public.incidencias_con_reportante to authenticated;
