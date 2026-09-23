-- La vista de reservas conserva el filtro por dueño/staff, pero ya no
-- puede saltarse el RLS de sus tablas base ni el de los perfiles unidos.
begin;

alter view public.reservas_salas_con_datos
  set (security_invoker = true, security_barrier = true);

drop policy if exists "select_staff_via_reservas_salas" on public.profiles;
create policy "select_staff_via_reservas_salas"
  on public.profiles
  for select
  to authenticated
  using (
    public.is_staff_or_above()
    and position(
      'reservas_salas_con_datos' in
      coalesce((select current_setting('request.path', true)), '')
    ) > 0
  );

revoke all on public.reservas_salas_con_datos from anon;
grant select on public.reservas_salas_con_datos to authenticated;

notify pgrst, 'reload schema';
commit;
