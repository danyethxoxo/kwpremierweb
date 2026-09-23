-- 099: la vista de documentos creados respeta RLS sin perder el panel de staff.
--
-- `documentos_plantilla` contiene valores y bloques completos del documento.
-- El panel solo necesita los campos seleccionados por la vista, por lo que el
-- acceso adicional para staff se limita a peticiones cuya ruta es esta vista.
-- Las consultas directas a las tablas base conservan sus políticas normales.

begin;

alter view public.documentos_plantilla_con_asesor
  set (security_invoker = true, security_barrier = true);

drop policy if exists "select_staff_via_documentos_plantilla" on public.documentos_plantilla;
create policy "select_staff_via_documentos_plantilla"
  on public.documentos_plantilla
  for select
  to authenticated
  using (
    public.is_staff_or_above()
    and position(
      'documentos_plantilla_con_asesor' in
      coalesce((select current_setting('request.path', true)), '')
    ) > 0
  );

drop policy if exists "select_staff_via_documentos_plantilla" on public.profiles;
create policy "select_staff_via_documentos_plantilla"
  on public.profiles
  for select
  to authenticated
  using (
    public.is_staff_or_above()
    and position(
      'documentos_plantilla_con_asesor' in
      coalesce((select current_setting('request.path', true)), '')
    ) > 0
  );

grant select on public.documentos_plantilla_con_asesor to authenticated;

commit;

notify pgrst, 'reload schema';
