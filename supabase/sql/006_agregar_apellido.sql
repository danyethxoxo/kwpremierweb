-- Fase 6: separa nombre y apellido en profiles (antes solo había
-- "nombre"). Ejecutar en SQL Editor.

alter table public.profiles add column if not exists apellido text;
