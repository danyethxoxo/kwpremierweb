-- La vista interna conserva el inventario completo para usuarios con sesión,
-- pero solo cuando la consulta entra por esta vista. La tabla base y la vista
-- pública siguen exponiendo únicamente lo que corresponde a cada contexto.
begin;

alter view public.propiedades_inventario
  set (security_invoker = true, security_barrier = true);

drop policy if exists "select_authenticated_via_propiedades_inventario" on public.propiedades;
create policy "select_authenticated_via_propiedades_inventario"
  on public.propiedades
  for select
  to authenticated
  using (
    position(
      'propiedades_inventario' in
      coalesce((select current_setting('request.path', true)), '')
    ) > 0
  );

revoke all on public.propiedades_inventario from anon;
grant select on public.propiedades_inventario to authenticated;

notify pgrst, 'reload schema';
commit;
