-- Las politicas de RLS usan estos helpers para evaluar el rol del usuario.
-- Se mantienen en public como wrappers controlados hacia las funciones de
-- private, pero deben poder ejecutarse durante la evaluacion de RLS.
begin;

create or replace function public.is_master()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.is_master();
$$;

create or replace function public.is_admin_or_master()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.is_admin_or_master();
$$;

create or replace function public.is_staff_or_above()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.is_staff_or_above();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.is_admin();
$$;

revoke all on function public.is_master(), public.is_admin_or_master(),
  public.is_staff_or_above(), public.is_admin()
  from public, anon, authenticated;
grant execute on function public.is_master(), public.is_admin_or_master(),
  public.is_staff_or_above(), public.is_admin()
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
