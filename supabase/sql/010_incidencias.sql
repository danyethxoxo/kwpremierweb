-- Fase 11: botón "Reporta una Incidencia" — tickets de soporte.
-- Cualquier rol puede reportar; solo Master/Admin ven todas y cambian
-- su estatus. Ejecutar completo en Supabase Dashboard > SQL Editor.

create table if not exists public.incidencias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  descripcion text not null,
  imagenes text[] not null default '{}',
  estatus text not null default 'abierto' check (estatus in ('abierto', 'en_revision', 'resuelto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_incidencias_user_id on public.incidencias(user_id);

alter table public.incidencias enable row level security;

drop policy if exists "select_own_or_staff" on public.incidencias;
create policy "select_own_or_staff" on public.incidencias
  for select using (auth.uid() = user_id or public.is_admin_or_master());

drop policy if exists "insert_own" on public.incidencias;
create policy "insert_own" on public.incidencias
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_admin_or_master" on public.incidencias;
create policy "update_admin_or_master" on public.incidencias
  for update using (public.is_admin_or_master());

drop policy if exists "delete_admin_or_master" on public.incidencias;
create policy "delete_admin_or_master" on public.incidencias
  for delete using (public.is_admin_or_master());

-- Reutiliza la misma función de la Fase 3 para mantener updated_at.
drop trigger if exists set_incidencias_updated_at on public.incidencias;
create trigger set_incidencias_updated_at
  before update on public.incidencias
  for each row execute function public.set_updated_at();

-- Vista con los datos de quién reportó, mismo patrón que
-- documentos_con_asesor (control de acceso en el WHERE).
create or replace view public.incidencias_con_reportante as
select
  i.id,
  i.user_id,
  i.titulo,
  i.descripcion,
  i.imagenes,
  i.estatus,
  i.created_at,
  i.updated_at,
  p.nombre as reportante_nombre,
  p.apellido as reportante_apellido,
  p.email as reportante_email
from public.incidencias i
join public.profiles p on p.id = i.user_id
where auth.uid() = i.user_id or public.is_admin_or_master();

grant select on public.incidencias_con_reportante to authenticated;

-- Bucket de Storage para las capturas de pantalla adjuntas. Público
-- para lectura (son solo capturas de soporte, no datos sensibles);
-- solo el propio usuario puede subir dentro de su propia carpeta
-- (nombre de archivo con prefijo "<su user id>/...").
insert into storage.buckets (id, name, public)
values ('incidencias', 'incidencias', true)
on conflict (id) do nothing;

drop policy if exists "incidencias_storage_insert_own" on storage.objects;
create policy "incidencias_storage_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'incidencias'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "incidencias_storage_select_public" on storage.objects;
create policy "incidencias_storage_select_public" on storage.objects
  for select using (bucket_id = 'incidencias');
