-- Las políticas públicas necesitan ejecutar estos helpers para devolver false
-- de forma segura a visitantes sin sesión.
begin;

grant execute on function public.is_admin() to anon;
grant execute on function public.is_master() to anon;
grant execute on function public.is_admin_or_master() to anon;
grant execute on function public.is_staff_or_above() to anon;

commit;

notify pgrst, 'reload schema';
