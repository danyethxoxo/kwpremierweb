-- Fase 14: registra el prefijo de folio de los demás documentos de
-- Acuerdos, para poder ir llevándolos uno por uno al mismo sistema de
-- guardado/folio/finalizado que ya tiene Carta de Terminación Anticipada.
-- No hace falta migración de esquema (tipo_documento es texto libre);
-- solo se necesita registrar el prefijo aquí antes de que ese tipo de
-- documento pueda finalizarse por primera vez.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

insert into public.folio_contadores (tipo_documento, prefijo) values
  ('aceptacion_oferta', 'AO'),
  ('aviso_privacidad', 'AP'),
  ('cedula_registro', 'CR'),
  ('checklist', 'CL'),
  ('colaboracion', 'CO'),
  ('contrapropuesta', 'CP'),
  ('referido', 'RF')
on conflict (tipo_documento) do nothing;
