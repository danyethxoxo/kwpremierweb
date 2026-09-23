-- is_master() es una dependencia de políticas internas, no un endpoint.
begin;

create or replace function private.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'master'
  );
$$;
revoke all on function private.is_master() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_master() to authenticated;

drop policy "delete_own" on public.documentos_guardados;
create policy "delete_own" on public.documentos_guardados
  for delete to authenticated
  using (private.is_master() or (auth.uid() = user_id and estado = 'borrador' and revision = 0));

drop policy "update_own" on public.documentos_guardados;
create policy "update_own" on public.documentos_guardados
  for update to authenticated
  using (private.is_master() or (auth.uid() = user_id and estado = 'borrador'))
  with check (private.is_master() or (auth.uid() = user_id and estado = 'borrador'));

drop policy "leer_revisiones_propias" on public.documento_revisiones;
create policy "leer_revisiones_propias" on public.documento_revisiones
  for select to authenticated
  using (
    exists (
      select 1 from public.documentos_guardados d
      where d.id = documento_revisiones.documento_id
        and (d.user_id = auth.uid() or private.is_master())
    )
  );

create or replace function public.is_master()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_master();
$$;
revoke all on function public.is_master() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
