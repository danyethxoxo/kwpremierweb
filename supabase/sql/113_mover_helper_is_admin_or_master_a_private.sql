-- El helper de administración es infraestructura de autorización, no un
-- RPC. Las políticas usan la implementación privada.
begin;

create or replace function private.is_admin_or_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('master', 'admin')
  );
$$;
revoke all on function private.is_admin_or_master() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin_or_master() to authenticated;

drop policy "abc_temas_write" on public.abc_temas;
create policy "abc_temas_write" on public.abc_temas
  for all to authenticated
  using (private.is_admin_or_master())
  with check (private.is_admin_or_master());

drop policy "select_admin" on public.api_llaves;
create policy "select_admin" on public.api_llaves
  for select to authenticated using (private.is_admin_or_master());

drop policy "update_admin" on public.api_llaves;
create policy "update_admin" on public.api_llaves
  for update to authenticated
  using (private.is_admin_or_master())
  with check (private.is_admin_or_master());

drop policy "delete_propio_o_admin" on public.gps_documentos;
create policy "delete_propio_o_admin" on public.gps_documentos
  for delete to authenticated
  using ((creado_por = auth.uid()) or private.is_admin_or_master());

drop policy "select_liderazgo" on public.gps_documentos;
create policy "select_liderazgo" on public.gps_documentos
  for select to authenticated
  using (
    public.is_staff_or_above()
    and ((oculto = false) or (creado_por = auth.uid()) or private.is_admin_or_master())
  );

drop policy "update_propio_o_admin" on public.gps_documentos;
create policy "update_propio_o_admin" on public.gps_documentos
  for update to authenticated
  using ((creado_por = auth.uid()) or private.is_admin_or_master())
  with check ((creado_por = auth.uid()) or private.is_admin_or_master());

drop policy "delete_admin_or_master" on public.incidencias;
create policy "delete_admin_or_master" on public.incidencias
  for delete to authenticated using (private.is_admin_or_master());

drop policy "select_own_or_staff" on public.incidencias;
create policy "select_own_or_staff" on public.incidencias
  for select to authenticated
  using ((auth.uid() = user_id) or private.is_admin_or_master());

drop policy "update_admin_or_master" on public.incidencias;
create policy "update_admin_or_master" on public.incidencias
  for update to authenticated
  using (private.is_admin_or_master())
  with check (private.is_admin_or_master());

drop policy "delete_propio" on public.propiedades_destacadas;
create policy "delete_propio" on public.propiedades_destacadas
  for delete to authenticated
  using ((auth.uid() = asesor_id) or private.is_admin_or_master());

drop policy "insert_propio" on public.propiedades_destacadas;
create policy "insert_propio" on public.propiedades_destacadas
  for insert to authenticated
  with check ((auth.uid() = asesor_id) or private.is_admin_or_master());

drop policy "update_propio" on public.propiedades_destacadas;
create policy "update_propio" on public.propiedades_destacadas
  for update to authenticated
  using ((auth.uid() = asesor_id) or private.is_admin_or_master())
  with check ((auth.uid() = asesor_id) or private.is_admin_or_master());

drop policy "delete_propios" on public.prospectos;
create policy "delete_propios" on public.prospectos
  for delete to authenticated
  using ((auth.uid() = asesor_id) or private.is_admin_or_master());

drop policy "select_propios" on public.prospectos;
create policy "select_propios" on public.prospectos
  for select to authenticated
  using ((auth.uid() = asesor_id) or private.is_admin_or_master());

drop policy "update_propios" on public.prospectos;
create policy "update_propios" on public.prospectos
  for update to authenticated
  using ((auth.uid() = asesor_id) or private.is_admin_or_master())
  with check ((auth.uid() = asesor_id) or private.is_admin_or_master());

drop policy "roles_kw_write" on public.roles_kw;
create policy "roles_kw_write" on public.roles_kw
  for all to authenticated
  using (private.is_admin_or_master())
  with check (private.is_admin_or_master());

drop policy "salas_kw_write" on public.salas_kw;
create policy "salas_kw_write" on public.salas_kw
  for all to authenticated
  using (private.is_admin_or_master())
  with check (private.is_admin_or_master());

drop policy "select_propios" on public.documentos_plantilla;
create policy "select_propios" on public.documentos_plantilla
  for select to authenticated
  using ((auth.uid() = user_id) or private.is_admin_or_master());

create or replace function public.is_admin_or_master()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_admin_or_master();
$$;
revoke all on function public.is_admin_or_master() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
