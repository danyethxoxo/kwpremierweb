-- Fase 1: autenticación base — tabla de perfiles y roles.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Función auxiliar (SECURITY DEFINER) para evitar recursión de RLS
-- al validar el rol de administrador dentro de políticas de esta
-- misma tabla.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "select_own_or_admin" on public.profiles;
create policy "select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "update_own" on public.profiles;
create policy "update_own" on public.profiles
  for update using (auth.uid() = id);

-- Crea automáticamente el perfil de cada usuario nuevo al registrarse.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nombre, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    'user'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Después de registrar tu propia cuenta de prueba desde login.html,
-- vuelve a este editor y corre lo siguiente (con tu correo real)
-- para convertirte en administrador:
--
-- update public.profiles set role = 'admin' where email = 'tu-correo@ejemplo.com';
