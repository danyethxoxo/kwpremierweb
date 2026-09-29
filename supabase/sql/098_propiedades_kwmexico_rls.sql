-- Evita que el inventario importado quede disponible por consulta directa
-- a la tabla. Los usuarios autenticados pueden usar la vista interna;
-- el publico anonimo conserva solamente el catalogo no importado.

drop policy if exists "select_publicadas" on public.propiedades;
drop policy if exists "select_publicadas_anon" on public.propiedades;
create policy "select_publicadas" on public.propiedades
  for select to anon, authenticated
  using (
    public.is_staff_or_above()
    or (
      estatus = 'publicada'
      and (auth.uid() is not null or fuente <> 'kwmexico')
    )
  );
