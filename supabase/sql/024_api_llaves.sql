-- Fase 22: llaves de API para que sistemas externos (Command / KW México)
-- puedan mandarnos inventario, igual que Neojaus expone su API pública.
--
-- Cómo funciona:
--   · Un Master/Admin genera una llave desde el panel. La llave completa
--     se muestra UNA sola vez; de aquí solo se guarda su hash (sha256),
--     así que ni nosotros podemos recuperarla después. Si se pierde, se
--     revoca y se genera otra.
--   · Quien consuma la API manda la llave en el header `x-api-key`
--     (mismo nombre que usa Neojaus, para que a quien la integre le
--     resulte familiar).
--   · El hash lo calcula la Edge Function con crypto.subtle, no Postgres,
--     para no depender de que pgcrypto esté en el search_path.
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

create table if not exists public.api_llaves (
  id uuid primary key default gen_random_uuid(),

  -- A quién se le entregó, para poder revocar la correcta
  nombre text not null,
  -- Primeros caracteres de la llave: sirve para identificarla en el panel
  -- sin exponerla completa (ej. "kwp_live_a1b2c3d4…")
  prefijo text not null,
  -- sha256 en hexadecimal de la llave completa
  llave_hash text not null unique,

  permisos text[] not null default array['propiedades:escribir', 'propiedades:leer'],
  activa boolean not null default true,

  creada_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  ultimo_uso timestamptz,
  usos int not null default 0
);

create index if not exists idx_api_llaves_hash on public.api_llaves(llave_hash) where activa;

alter table public.api_llaves enable row level security;

-- Solo Master/Admin ven las llaves desde el navegador, y aun así nunca
-- ven la llave completa (no está guardada). La Edge Function trabaja con
-- la llave de servicio, que se salta RLS.
drop policy if exists "select_admin" on public.api_llaves;
create policy "select_admin" on public.api_llaves
  for select using (public.is_admin_or_master());

drop policy if exists "update_admin" on public.api_llaves;
create policy "update_admin" on public.api_llaves
  for update using (public.is_admin_or_master());

-- Sin política de insert: las llaves se crean únicamente desde la Edge
-- Function, que es quien puede calcular el hash.

-- Vista para el panel: nunca expone el hash.
create or replace view public.api_llaves_visibles as
select id, nombre, prefijo, permisos, activa, created_at, ultimo_uso, usos
from public.api_llaves;

-- ═══════════════════════════════════════════════════════════════
-- Bitácora de lo que entra por la API
-- ═══════════════════════════════════════════════════════════════
-- Sirve para diagnosticar cuando el DT diga "ya lo mandé" y no aparezca
-- nada: aquí queda registrado qué llegó, cuántas propiedades traía y si
-- algo falló.

create table if not exists public.api_bitacora (
  id uuid primary key default gen_random_uuid(),
  llave_id uuid references public.api_llaves(id) on delete set null,
  endpoint text not null,
  recibidas int not null default 0,
  guardadas int not null default 0,
  errores jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_bitacora_fecha on public.api_bitacora(created_at desc);

alter table public.api_bitacora enable row level security;

drop policy if exists "select_interno" on public.api_bitacora;
create policy "select_interno" on public.api_bitacora
  for select using (public.is_staff_or_above());
