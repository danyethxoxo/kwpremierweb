-- 101: la vista de dictámenes aplica las políticas RLS de sus tablas base.
--
-- Las tablas de expedientes, puntos, clientes, asesores y catálogos ya
-- restringen la lectura a staff. La vista solo necesita una política
-- adicional para el nombre del dictaminador en `profiles`, limitada a la
-- ruta de esta vista.

begin;

alter view public.dictamenes_con_asesor
  set (security_invoker = true, security_barrier = true);

drop policy if exists "select_staff_via_dictamenes_con_asesor" on public.profiles;
create policy "select_staff_via_dictamenes_con_asesor"
  on public.profiles
  for select
  to authenticated
  using (
    public.is_staff_or_above()
    and position(
      'dictamenes_con_asesor' in
      coalesce((select current_setting('request.path', true)), '')
    ) > 0
  );

grant select on public.dictamenes_con_asesor to authenticated;

commit;

notify pgrst, 'reload schema';
