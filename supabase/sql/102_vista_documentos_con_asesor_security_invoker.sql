-- 102: la vista administrativa de documentos respeta RLS.
--
-- `documentos_guardados` ya permite al dueño y a staff leer sus filas. La
-- vista agrega el nombre del asesor; esa lectura de `profiles` se limita a
-- la ruta de esta vista y no cambia el acceso directo a perfiles.

begin;

alter view public.documentos_con_asesor
  set (security_invoker = true, security_barrier = true);

drop policy if exists "select_staff_via_documentos_con_asesor" on public.profiles;
create policy "select_staff_via_documentos_con_asesor"
  on public.profiles
  for select
  to authenticated
  using (
    public.is_staff_or_above()
    and position(
      'documentos_con_asesor' in
      coalesce((select current_setting('request.path', true)), '')
    ) > 0
  );

grant select on public.documentos_con_asesor to authenticated;

commit;

notify pgrst, 'reload schema';
