-- Fase 3: documentos guardados por usuario, con permisos.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.documentos_guardados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo_documento text not null,
  nombre_archivo text,
  datos jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_documentos_guardados_user_id
  on public.documentos_guardados(user_id);

alter table public.documentos_guardados enable row level security;

-- Cada usuario ve solo lo suyo; los admins ven todo (misma función
-- is_admin() creada en la Fase 1).
drop policy if exists "select_own_or_admin" on public.documentos_guardados;
create policy "select_own_or_admin" on public.documentos_guardados
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "insert_own" on public.documentos_guardados;
create policy "insert_own" on public.documentos_guardados
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own" on public.documentos_guardados;
create policy "update_own" on public.documentos_guardados
  for update using (auth.uid() = user_id);

drop policy if exists "delete_own" on public.documentos_guardados;
create policy "delete_own" on public.documentos_guardados
  for delete using (auth.uid() = user_id);

-- Actualiza updated_at automáticamente en cada edición.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_documentos_updated_at on public.documentos_guardados;
create trigger set_documentos_updated_at
  before update on public.documentos_guardados
  for each row execute function public.set_updated_at();
