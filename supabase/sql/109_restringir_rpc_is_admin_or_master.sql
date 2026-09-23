-- Las políticas que requieren administración son internas: no deben
-- invocar el helper desde el rol anónimo. El formulario público de
-- prospectos conserva su política independiente.
begin;

alter policy "abc_temas_write" on public.abc_temas to authenticated;
alter policy "select_admin" on public.api_llaves to authenticated;
alter policy "update_admin" on public.api_llaves to authenticated;
alter policy "delete_propio_o_admin" on public.gps_documentos to authenticated;
alter policy "select_liderazgo" on public.gps_documentos to authenticated;
alter policy "update_propio_o_admin" on public.gps_documentos to authenticated;
alter policy "delete_admin_or_master" on public.incidencias to authenticated;
alter policy "select_own_or_staff" on public.incidencias to authenticated;
alter policy "update_admin_or_master" on public.incidencias to authenticated;
alter policy "delete_propios" on public.prospectos to authenticated;
alter policy "select_propios" on public.prospectos to authenticated;
alter policy "update_propios" on public.prospectos to authenticated;
alter policy "roles_kw_write" on public.roles_kw to authenticated;
alter policy "salas_kw_write" on public.salas_kw to authenticated;

revoke execute on function public.is_admin_or_master() from public, anon;

notify pgrst, 'reload schema';
commit;
