-- 098: la vista pública de perfiles obedece RLS sin abrir la tabla base.
--
-- `profiles` contiene columnas internas (por ejemplo puede_dictaminar y
-- oculto). La política adicional solo permite sus filas visibles cuando la
-- consulta entra por la ruta de la vista pública; una consulta directa a
-- `profiles` conserva las políticas existentes.

begin;

alter view public.perfiles_publicos
  set (security_invoker = true, security_barrier = true);

drop policy if exists "select_publicos_via_vista" on public.profiles;
create policy "select_publicos_via_vista"
  on public.profiles
  for select
  to anon, authenticated
  using (
    oculto = false
    and position(
      'perfiles_publicos' in coalesce((select current_setting('request.path', true)), '')
    ) > 0
  );

grant select on public.perfiles_publicos to anon, authenticated;

commit;

notify pgrst, 'reload schema';
