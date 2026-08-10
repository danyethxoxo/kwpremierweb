-- Fase 24: "Mis propiedades" en el perfil público.
--
-- En el micrositio, la tercera columna muestra las propiedades del
-- asesor. Por omisión salen las que vengan de Command a su nombre (las
-- que ya traen asesor_id), y además cada quien puede escoger a mano
-- otras del inventario de KW para mostrarlas en su perfil - para eso es
-- esta tabla.
--
-- Requiere 023_propiedades.sql y 026_micrositio_y_prospectos.sql.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

create table if not exists public.propiedades_destacadas (
  asesor_id uuid not null references public.profiles(id) on delete cascade,
  propiedad_id uuid not null references public.propiedades(id) on delete cascade,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (asesor_id, propiedad_id)
);

create index if not exists idx_destacadas_asesor
  on public.propiedades_destacadas(asesor_id, orden);

alter table public.propiedades_destacadas enable row level security;

-- Se leen sin sesión: el micrositio es público y ahí es donde se ven.
-- Lo que se expone es solo "este asesor eligió esta propiedad"; los
-- datos de la propiedad siguen filtrados por las políticas de
-- `propiedades` (solo salen las publicadas).
drop policy if exists "select_publico" on public.propiedades_destacadas;
create policy "select_publico" on public.propiedades_destacadas
  for select using (true);

-- Cada quien arma su propia selección.
drop policy if exists "insert_propio" on public.propiedades_destacadas;
create policy "insert_propio" on public.propiedades_destacadas
  for insert to authenticated
  with check (auth.uid() = asesor_id or public.is_admin_or_master());

drop policy if exists "update_propio" on public.propiedades_destacadas;
create policy "update_propio" on public.propiedades_destacadas
  for update to authenticated
  using (auth.uid() = asesor_id or public.is_admin_or_master());

drop policy if exists "delete_propio" on public.propiedades_destacadas;
create policy "delete_propio" on public.propiedades_destacadas
  for delete to authenticated
  using (auth.uid() = asesor_id or public.is_admin_or_master());
