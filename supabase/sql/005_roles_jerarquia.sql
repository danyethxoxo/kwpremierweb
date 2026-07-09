-- Fase 5: jerarquía de 4 roles (master, admin, staff, asociado) en
-- vez de los 2 que había (user, admin). Ejecutar en SQL Editor.

-- 1) Quitar la regla vieja de roles y poner la nueva.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('master', 'admin', 'staff', 'asociado'));

-- 2) Migrar los valores existentes: 'user' -> 'asociado'.
update public.profiles set role = 'asociado' where role = 'user';

-- 3) Tu cuenta pasa a ser la única 'master' (ajusta el correo si es
-- necesario). El resto de cuentas que ya fueran 'admin' quedan como
-- 'admin' normal (ya no son master).
update public.profiles set role = 'master' where email = 'scareardway1@gmail.com';

-- 4) Nuevas cuentas (por invitación) entran como 'asociado' por
-- default, no como 'admin'.
alter table public.profiles alter column role set default 'asociado';

-- 5) Funciones auxiliares de rol (SECURITY DEFINER, evitan recursión
-- de RLS igual que is_admin() de la Fase 1).
create or replace function public.is_master()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'master'
  );
$$;

create or replace function public.is_admin_or_master()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('master','admin')
  );
$$;

create or replace function public.is_staff_or_above()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('master','admin','staff')
  );
$$;

-- 6) is_admin() de la Fase 1 se redefine para significar "admin o
-- master" (ya no hay un rol 'admin' distinto sin master por debajo).
create or replace function public.is_admin()
returns boolean
language sql security definer set search_path = public stable
as $$
  select public.is_admin_or_master();
$$;

-- 7) Documentos guardados: Master/Admin/Staff ven TODO; Asociado
-- solo lo suyo (se reemplaza la política de select de la Fase 3).
drop policy if exists "select_own_or_admin" on public.documentos_guardados;
create policy "select_own_or_admin" on public.documentos_guardados
  for select using (auth.uid() = user_id or public.is_staff_or_above());
