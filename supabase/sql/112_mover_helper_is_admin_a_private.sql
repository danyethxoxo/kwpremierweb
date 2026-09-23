-- is_admin() solo se usa en políticas y funciones internas. El cálculo
-- privilegiado vive en private; el nombre público queda sin EXECUTE.
begin;

create or replace function private.is_admin()
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
revoke all on function private.is_admin() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

drop policy "frecuentes_write" on public.firmas_frecuentes;
create policy "frecuentes_write" on public.firmas_frecuentes
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

drop policy "firmas_limites_select" on public.firmas_limites;
create policy "firmas_limites_select" on public.firmas_limites
  for select to authenticated
  using ((auth.uid() = user_id) or private.is_admin());

drop policy "select_own_or_admin" on public.profiles;
create policy "select_own_or_admin" on public.profiles
  for select to authenticated
  using ((auth.uid() = id) or private.is_admin());

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_admin();
$$;
revoke all on function public.is_admin() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
