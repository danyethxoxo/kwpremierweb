-- Firmantes que se repiten en casi todos los contratos.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.
--
-- Buena parte de los contratos del Market Center los firma la misma
-- gente por parte de la empresa. Volverlos a capturar cada vez es
-- trabajo repetido y, peor, es donde se cuelan los correos mal
-- escritos: un contrato que nunca llega a firmarse porque la invitación
-- se fue a una dirección con una letra de más.
--
-- Van en una tabla y no clavados en la pantalla para que el día que
-- alguien entre o salga del puesto se arregle desde aquí, sin tocar el
-- código ni volver a publicar el sitio.

create extension if not exists pgcrypto;

create table if not exists public.firmas_frecuentes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  -- Único para que no acaben dos renglones de la misma persona con el
  -- nombre escrito distinto, que en la lista se ven como dos opciones y
  -- nadie sabe cuál escoger.
  correo text not null unique,
  puesto text,
  -- Apagar en vez de borrar: si alguien deja el puesto, los envíos que
  -- ya se hicieron con su correo siguen teniendo sentido, y borrarlo de
  -- aquí no cambia nada de lo ya firmado.
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_firmas_frecuentes_activo
  on public.firmas_frecuentes(activo, orden);

alter table public.firmas_frecuentes enable row level security;

-- Todos los ven, porque todos los van a usar al armar un envío.
drop policy if exists "frecuentes_select" on public.firmas_frecuentes;
create policy "frecuentes_select" on public.firmas_frecuentes
  for select using (auth.uid() is not null);

-- Cambiar la lista es cosa del liderazgo.
drop policy if exists "frecuentes_write" on public.firmas_frecuentes;
create policy "frecuentes_write" on public.firmas_frecuentes
  for all using (public.is_admin()) with check (public.is_admin());

-- Los dos que hoy firman la mayoría de los contratos. Van por correo en
-- el conflicto para que volver a correr esto no los duplique ni pise un
-- nombre que ya se haya corregido a mano.
insert into public.firmas_frecuentes (nombre, correo, puesto, orden) values
  ('Gustavo Solares Campos', 'gustavo.solares@kwmexico.mx', 'Broker', 1),
  ('Maria Fernanda Pacheco Banos', 'fernanda.pacheco@kwmexico.mx', 'Gerente', 2)
on conflict (correo) do nothing;
