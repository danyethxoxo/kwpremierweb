-- Complemento a la Fase 3: permite que "Guardar" sobrescriba el
-- mismo registro (un documento guardado por usuario y tipo de
-- acuerdo, no uno nuevo cada vez). Ejecutar en SQL Editor.

alter table public.documentos_guardados
  drop constraint if exists documentos_guardados_user_tipo_unique;

alter table public.documentos_guardados
  add constraint documentos_guardados_user_tipo_unique
  unique (user_id, tipo_documento);
