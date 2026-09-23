-- Las operaciones de borrado/edición de documentos son para sesiones;
-- una petición anónima nunca debe evaluar is_master().
begin;

alter policy "delete_own" on public.documentos_guardados to authenticated;
alter policy "update_own" on public.documentos_guardados to authenticated;

revoke execute on function public.is_master() from public, anon;

notify pgrst, 'reload schema';
commit;
