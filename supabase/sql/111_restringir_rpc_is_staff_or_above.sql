-- Las tablas internas no deben evaluar el helper para anon. La tabla de
-- propiedades conserva una política anon separada para mostrar únicamente
-- publicaciones.
begin;

alter policy "abc_asesores_select" on public.abc_asesores to authenticated;
alter policy "abc_asesores_write" on public.abc_asesores to authenticated;
alter policy "abc_avance_select" on public.abc_avance to authenticated;
alter policy "abc_avance_write" on public.abc_avance to authenticated;
alter policy "abc_temas_select" on public.abc_temas to authenticated;
alter policy "select_interno" on public.api_bitacora to authenticated;
alter policy "select_own_or_admin" on public.documentos_guardados to authenticated;
alter policy "documentos_internos_select" on public.documentos_internos to authenticated;
alter policy "documentos_internos_write" on public.documentos_internos to authenticated;
alter policy "firmas_select" on public.firmas_documentos to authenticated;
alter policy "insert_liderazgo" on public.gps_documentos to authenticated;
alter policy "select_liderazgo" on public.gps_documentos to authenticated;
alter policy "select_interno" on public.propiedades_sync to authenticated;
alter policy "reservas_salas_select" on public.reservas_salas to authenticated;
alter policy "reservas_salas_update_staff" on public.reservas_salas to authenticated;
alter policy "roles_kw_select" on public.roles_kw to authenticated;

alter policy "select_publicadas" on public.propiedades to authenticated;
drop policy if exists "select_publicadas_anon" on public.propiedades;
create policy "select_publicadas_anon"
  on public.propiedades
  for select
  to anon
  using (estatus = 'publicada');

revoke execute on function public.is_staff_or_above() from public, anon;

notify pgrst, 'reload schema';
commit;
