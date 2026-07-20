-- Fase 15: registra el prefijo de folio del Acuerdo de Renta (Contratos),
-- para que se pueda finalizar por primera vez con el mismo sistema de
-- guardado/folio/finalizado que ya tienen Carta de Terminación Anticipada
-- y Aceptación de Oferta de Arrendamiento.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

insert into public.folio_contadores (tipo_documento, prefijo) values
  ('acuerdo_renta', 'AR')
on conflict (tipo_documento) do nothing;
