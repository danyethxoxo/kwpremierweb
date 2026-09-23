-- Las políticas internas que consultan is_admin() no necesitan evaluarse
-- para anon. La vista pública de perfiles conserva su propia política.
begin;

alter policy "frecuentes_write" on public.firmas_frecuentes to authenticated;
alter policy "firmas_limites_select" on public.firmas_limites to authenticated;
alter policy "select_own_or_admin" on public.profiles to authenticated;

revoke execute on function public.is_admin() from public, anon;

notify pgrst, 'reload schema';
commit;
