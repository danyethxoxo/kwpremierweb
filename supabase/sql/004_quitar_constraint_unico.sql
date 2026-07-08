-- Revierte el constraint de la 003: ahora cada usuario puede tener
-- VARIOS documentos guardados del mismo tipo (identificados por
-- nombre), no solo uno que se sobrescribe. Ejecutar en SQL Editor.

alter table public.documentos_guardados
  drop constraint if exists documentos_guardados_user_tipo_unique;
