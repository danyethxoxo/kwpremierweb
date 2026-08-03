-- Fase 34: dos formularios públicos nuevos en la página de inicio.
--
--   1. Reclutamiento: quien quiere ser asesor deja sus datos desde el
--      botón "Quiero ser parte".
--   2. Reseñas: los clientes califican al Market Center desde una liga
--      aparte (resena.html), que se puede mandar por WhatsApp o correo.
--
-- Las dos son tablas públicas para escribir (cualquiera puede llenar el
-- formulario, sin sesión) y privadas para leer (solo Master/Admin/Staff).
-- Mismo patrón que `prospectos` en 026_micrositio_y_prospectos.sql.
--
-- Las reseñas NO se publican solas: nacen con aprobada = false y alguien
-- del equipo las tiene que aprobar. Así el sitio no queda expuesto a que
-- cualquiera publique lo que sea en la página principal.
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

-- ─────────────────────────────────────────────────────────────
-- 1. Prospectos de reclutamiento
-- ─────────────────────────────────────────────────────────────
create table if not exists public.prospectos_reclutamiento (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  correo text,
  telefono text,
  experiencia text,          -- 'ninguna' | 'algo' | 'mucha'
  mensaje text,
  atendido boolean not null default false,
  created_at timestamptz not null default now(),

  -- El formulario es público: que la base rechace de entrada cualquier
  -- cosa desproporcionada.
  constraint recl_nombre_largo check (char_length(nombre) between 2 and 120),
  constraint recl_correo_largo check (correo is null or char_length(correo) <= 160),
  constraint recl_telefono_largo check (telefono is null or char_length(telefono) <= 40),
  constraint recl_mensaje_largo check (mensaje is null or char_length(mensaje) <= 1000),
  constraint recl_experiencia_valida check (
    experiencia is null or experiencia in ('ninguna', 'algo', 'mucha')
  ),
  -- Sirve de poco guardar a alguien sin forma de contactarlo.
  constraint recl_algun_contacto check (
    coalesce(correo, '') <> '' or coalesce(telefono, '') <> ''
  )
);

create index if not exists idx_recl_created
  on public.prospectos_reclutamiento(created_at desc);

alter table public.prospectos_reclutamiento enable row level security;

drop policy if exists "insert_publico" on public.prospectos_reclutamiento;
create policy "insert_publico" on public.prospectos_reclutamiento
  for insert to anon, authenticated
  with check (atendido = false);

drop policy if exists "select_equipo" on public.prospectos_reclutamiento;
create policy "select_equipo" on public.prospectos_reclutamiento
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('master', 'admin', 'staff')
    )
  );

drop policy if exists "update_equipo" on public.prospectos_reclutamiento;
create policy "update_equipo" on public.prospectos_reclutamiento
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('master', 'admin', 'staff')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 2. Reseñas
-- ─────────────────────────────────────────────────────────────
create table if not exists public.resenas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  texto text not null,
  estrellas smallint not null,
  rol text,                  -- ej. "Compró en Del Valle" (opcional)
  aprobada boolean not null default false,
  created_at timestamptz not null default now(),

  constraint resenas_nombre_largo check (char_length(nombre) between 2 and 120),
  constraint resenas_texto_largo check (char_length(texto) between 3 and 600),
  constraint resenas_rol_largo check (rol is null or char_length(rol) <= 120),
  constraint resenas_estrellas_rango check (estrellas between 1 and 5)
);

create index if not exists idx_resenas_aprobadas
  on public.resenas(aprobada, created_at desc);

alter table public.resenas enable row level security;

-- Cualquiera puede dejar una, pero siempre apagada: publicarla es
-- decisión del equipo, no de quien la escribe.
drop policy if exists "insert_publico" on public.resenas;
create policy "insert_publico" on public.resenas
  for insert to anon, authenticated
  with check (aprobada = false);

-- Lo que el sitio enseña de cara al público: solo las aprobadas.
drop policy if exists "select_aprobadas" on public.resenas;
create policy "select_aprobadas" on public.resenas
  for select to anon, authenticated
  using (aprobada = true);

-- El equipo las ve todas (incluidas las que faltan por aprobar).
drop policy if exists "select_equipo" on public.resenas;
create policy "select_equipo" on public.resenas
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('master', 'admin', 'staff')
    )
  );

drop policy if exists "update_equipo" on public.resenas;
create policy "update_equipo" on public.resenas
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('master', 'admin', 'staff')
    )
  );

drop policy if exists "delete_equipo" on public.resenas;
create policy "delete_equipo" on public.resenas
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('master', 'admin', 'staff')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3. Avisos en la campanita
-- ─────────────────────────────────────────────────────────────
-- Que no haya que estar revisando la base a ver si cayó algo.
create or replace function public.notificar_reclutamiento_nuevo()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  select p.id, 'reclutamiento', 'Quiere ser parte del equipo: ' || new.nombre,
         coalesce(nullif(new.correo, ''), new.telefono, 'Sin datos de contacto'),
         '/kwpremierweb/hub/admin.html'
  from public.profiles p
  where p.role in ('master', 'admin');
  return new;
end;
$$;

drop trigger if exists trg_notificar_reclutamiento on public.prospectos_reclutamiento;
create trigger trg_notificar_reclutamiento
  after insert on public.prospectos_reclutamiento
  for each row execute function public.notificar_reclutamiento_nuevo();

create or replace function public.notificar_resena_nueva()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  select p.id, 'resena', 'Nueva reseña de ' || new.nombre,
         new.estrellas || ' estrellas · falta aprobarla para que se publique',
         '/kwpremierweb/hub/admin.html'
  from public.profiles p
  where p.role in ('master', 'admin');
  return new;
end;
$$;

drop trigger if exists trg_notificar_resena on public.resenas;
create trigger trg_notificar_resena
  after insert on public.resenas
  for each row execute function public.notificar_resena_nueva();
