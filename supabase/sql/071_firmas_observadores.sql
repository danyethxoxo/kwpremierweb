-- Observadores en firmas_documentos.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.
--
-- weetrust deja invitar, aparte de a quien firma, a gente que solo ve el
-- flujo de firmas sin firmar nada (su parámetro 'sharedWith'). Aquí se
-- guarda una copia igual que 'firmantes': [{ correo }].

alter table public.firmas_documentos
  add column if not exists observadores jsonb not null default '[]'::jsonb;
