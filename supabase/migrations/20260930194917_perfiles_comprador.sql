-- Primera etapa: perfiles privados; aún no genera matches ni notificaciones.
create table public.perfiles_comprador (
  id uuid primary key default gen_random_uuid(),
  asesor_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 120),
  telefono text not null default '' check (char_length(telefono) <= 40),
  correo text not null default '' check (char_length(correo) <= 160 and (correo = '' or correo ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  operacion text not null check (operacion in ('venta','renta')),
  tipos text[] not null check (cardinality(tipos) between 1 and 10 and tipos <@ array['Casa','Departamento','Terreno','Oficina','Local comercial','Bodega','Duplex','Nave industrial','Edificio','Rancho']::text[]),
  moneda text not null default 'MXN' check (moneda in ('MXN','USD')),
  precio_min numeric check (precio_min >= 0 and precio_min <= 100000000000),
  precio_max numeric not null check (precio_max > 0 and precio_max <= 100000000000),
  estado text not null check (char_length(btrim(estado)) between 2 and 100),
  municipio text not null default '' check (char_length(municipio) <= 120),
  colonias text not null default '' check (char_length(colonias) <= 1000),
  recamaras_min integer check (recamaras_min between 0 and 100),
  banos_min numeric check (banos_min between 0 and 100),
  estacionamientos_min integer check (estacionamientos_min between 0 and 100),
  superficie_min numeric check (superficie_min between 0 and 10000000),
  notas text not null default '' check (char_length(notas) <= 2000),
  umbral_match integer not null default 70 check (umbral_match between 1 and 100),
  avisos_campana boolean not null default true,
  avisos_correo boolean not null default true,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  check (btrim(telefono) <> '' or btrim(correo) <> ''),
  check (precio_min is null or precio_min <= precio_max)
);
create index perfiles_comprador_asesor_fecha_idx on public.perfiles_comprador (asesor_id, created_at desc);
alter table public.perfiles_comprador enable row level security;
revoke all on public.perfiles_comprador from public, anon, authenticated;
grant select, insert, update on public.perfiles_comprador to authenticated;
grant all on public.perfiles_comprador to service_role;
create policy comprador_select on public.perfiles_comprador for select to authenticated using ((select auth.uid()) = asesor_id);
create policy comprador_insert on public.perfiles_comprador for insert to authenticated with check ((select auth.uid()) = asesor_id);
create policy comprador_update on public.perfiles_comprador for update to authenticated using ((select auth.uid()) = asesor_id) with check ((select auth.uid()) = asesor_id);
comment on table public.perfiles_comprador is 'Búsquedas privadas del asesor. Etapa de captura; preferencias de avisos reservadas para el futuro motor de matches.';
