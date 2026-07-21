-- Fase 17: página pública de inicio (portal.html reemplaza a index.html
-- como Hub). Se agrega una vista segura y de solo lectura para listar
-- Asesores y Staff sin necesidad de haber iniciado sesión — expone
-- únicamente nombre, apellido y rol; nunca email ni ningún otro dato.
--
-- "oculto" permite que Master/Admin escondan un perfil individual del
-- listado público sin tener que borrar la cuenta.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

alter table public.profiles add column if not exists oculto boolean not null default false;

create or replace view public.perfiles_publicos as
select id, nombre, apellido, role
from public.profiles
where oculto = false;

grant select on public.perfiles_publicos to anon, authenticated;
