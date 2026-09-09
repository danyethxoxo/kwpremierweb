-- Registra las iniciales de folio para los contratos de compraventa
-- PROFECO. Es idempotente y debe ejecutarse antes de finalizar el primer
-- documento de este tipo.

insert into public.folio_contadores (tipo_documento, prefijo) values
  ('contrato_profeco', 'PF')
on conflict (tipo_documento) do nothing;
