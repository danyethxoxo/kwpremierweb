-- 100: el historial de dictámenes obedece RLS y conserva el nombre del autor.
--
-- `dictamen_historial` ya restringe sus filas a staff. La vista solo agrega
-- el nombre desde `profiles`; esa lectura adicional queda limitada a la ruta
-- de esta vista para no abrir la tabla de perfiles por consultas directas.

begin;

alter view public.dictamen_historial_con_quien
  set (security_invoker = true, security_barrier = true);

drop policy if exists "select_staff_via_dictamen_historial" on public.profiles;
create policy "select_staff_via_dictamen_historial"
  on public.profiles
  for select
  to authenticated
  using (
    public.is_staff_or_above()
    and position(
      'dictamen_historial_con_quien' in
      coalesce((select current_setting('request.path', true)), '')
    ) > 0
  );

grant select on public.dictamen_historial_con_quien to authenticated;

commit;

notify pgrst, 'reload schema';
