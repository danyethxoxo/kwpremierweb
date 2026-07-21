-- Fase 18: foto de perfil — se pide en Mi Perfil y se muestra ahí mismo
-- y en las tarjetas de Asesores/Staff. Se guarda solo la URL pública en
-- profiles.foto_url; el archivo en sí vive en un bucket de Storage
-- público para lectura (mismo patrón que el bucket "incidencias" de la
-- Fase 11) donde cada usuario solo puede escribir dentro de su propia
-- carpeta (prefijo "<su user id>/...").
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

alter table public.profiles add column if not exists foto_url text;

-- La vista pública debe reflejar la columna nueva. Se agrega al final
-- del SELECT (no se puede insertar una columna a la mitad de una vista
-- ya creada).
create or replace view public.perfiles_publicos as
select id, nombre, apellido, role, foto_url
from public.profiles
where oculto = false;

insert into storage.buckets (id, name, public)
values ('perfiles', 'perfiles', true)
on conflict (id) do nothing;

drop policy if exists "perfiles_storage_insert_own" on storage.objects;
create policy "perfiles_storage_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'perfiles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "perfiles_storage_update_own" on storage.objects;
create policy "perfiles_storage_update_own" on storage.objects
  for update
  using (
    bucket_id = 'perfiles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "perfiles_storage_delete_own" on storage.objects;
create policy "perfiles_storage_delete_own" on storage.objects
  for delete
  using (
    bucket_id = 'perfiles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "perfiles_storage_select_public" on storage.objects;
create policy "perfiles_storage_select_public" on storage.objects
  for select using (bucket_id = 'perfiles');
