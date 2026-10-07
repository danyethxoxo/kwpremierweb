-- Registro del nuevo Acuerdo de Referido basado en el formato Agosto 2026.
-- Script idempotente de datos: tipo_documento ya admite texto libre.
insert into public.folio_contadores (tipo_documento, prefijo)
values ('acuerdo_referido', 'REF')
on conflict (tipo_documento) do nothing;
