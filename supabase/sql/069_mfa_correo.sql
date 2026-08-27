-- Fase 69: verificación en dos pasos por correo.
--
-- Reemplaza el intento anterior con app autenticadora (QR): en vez de
-- eso, se manda un código de 6 dígitos al correo personal de quien
-- entra. Aquí solo se guardan los códigos que se han mandado, con
-- hash (nunca en claro) y con vencimiento; quién tiene la
-- verificación activada y hasta cuándo vale su sesión vive en
-- app_metadata de auth.users, que solo la Edge Function mfa-correo
-- puede tocar (usa la llave de servicio).
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor. Se puede
-- volver a correr sin problema.

create table if not exists public.mfa_correo_codigos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  codigo_hash text not null,
  expira_en timestamptz not null,
  intentos int not null default 0,
  usado boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_mfa_correo_codigos_user_created
  on public.mfa_correo_codigos(user_id, created_at desc);

alter table public.mfa_correo_codigos enable row level security;

-- Sin políticas, a propósito: nadie la toca desde el navegador, ni
-- para leer. Solo la Edge Function mfa-correo, que corre con la
-- llave de servicio y se salta RLS.
