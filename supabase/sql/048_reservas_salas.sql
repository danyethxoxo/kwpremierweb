-- Fase 48: reservas de salas, con solicitud y aprobación.
--
-- Cualquiera con sesión pide una sala (queda "pendiente"); Master,
-- Admin o Staff (la recepción) la acepta o la rechaza desde el sitio.
-- Al aceptarla, una función de Supabase crea el evento en el Google
-- Calendar de salas - por eso "aceptar" no es un simple update: pasa
-- por la función `calendar-events` (acción `aceptar_reserva`), que es
-- quien tiene el token de Google. "Rechazar" sí es un update directo,
-- porque no toca Google.
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

-- ─────────────────────────────────────────────────────────────
-- 1) Catálogo de salas.
--    Mismo patrón que roles_kw: agregar una sala nueva es un insert
--    aquí, no tocar código.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.salas_kw (
  id      text primary key,
  nombre  text not null,
  orden   smallint not null default 0,
  activo  boolean not null default true
);

comment on table public.salas_kw is
  'Salas que se pueden reservar. Agregar una es un insert aquí; no requiere tocar el código del sitio.';

insert into public.salas_kw (id, nombre, orden) values
  ('juntas',        'Sala de juntas',        1),
  ('onboarding',    'Sala de onboarding',    2),
  ('entrenamientos','Sala de entrenamientos',3),
  ('petit',         'Sala Petit',            4)
on conflict (id) do update
  set nombre = excluded.nombre,
      orden  = excluded.orden;

-- ─────────────────────────────────────────────────────────────
-- 2) Reservas.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.reservas_salas (
  id                uuid primary key default gen_random_uuid(),
  sala_id           text not null references public.salas_kw(id),
  asesor_id         uuid not null references auth.users(id) on delete cascade,
  fecha             date not null,
  hora_inicio       time not null,
  hora_fin          time not null,
  motivo            text,
  estado            text not null default 'pendiente'
                       check (estado in ('pendiente', 'aceptada', 'rechazada')),
  nota_respuesta    text,
  respondido_por    uuid references auth.users(id) on delete set null,
  respondido_en     timestamptz,
  evento_calendar_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (hora_fin > hora_inicio)
);

comment on column public.reservas_salas.evento_calendar_id is
  'Id del evento en Google Calendar, solo se llena al aceptar. Sirve para poder borrar/editar el evento si algún día se cancela una reserva ya aceptada.';

create index if not exists reservas_salas_asesor_idx on public.reservas_salas (asesor_id);
create index if not exists reservas_salas_estado_idx  on public.reservas_salas (estado);
-- Para el choque de horarios al aceptar: todas las reservas de una
-- sala en un día, de un jalón.
create index if not exists reservas_salas_sala_fecha_idx on public.reservas_salas (sala_id, fecha);

drop trigger if exists reservas_salas_touch on public.reservas_salas;
create trigger reservas_salas_touch
  before update on public.reservas_salas
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3) Permisos.
--    Cualquiera con sesión pide (inserta lo suyo) y ve lo suyo.
--    Master/Admin/Staff (recepción) ven todas y las resuelven.
--    Sin política de delete: el historial de reservas se queda.
-- ─────────────────────────────────────────────────────────────
alter table public.salas_kw      enable row level security;
alter table public.reservas_salas enable row level security;

drop policy if exists "salas_kw_select" on public.salas_kw;
create policy "salas_kw_select" on public.salas_kw
  for select using (auth.role() = 'authenticated');

drop policy if exists "salas_kw_write" on public.salas_kw;
create policy "salas_kw_write" on public.salas_kw
  for all using (public.is_admin_or_master()) with check (public.is_admin_or_master());

drop policy if exists "reservas_salas_select" on public.reservas_salas;
create policy "reservas_salas_select" on public.reservas_salas
  for select using (auth.uid() = asesor_id or public.is_staff_or_above());

drop policy if exists "reservas_salas_insert" on public.reservas_salas;
create policy "reservas_salas_insert" on public.reservas_salas
  for insert with check (auth.uid() = asesor_id);

-- Cubre tanto "rechazar" (update directo desde el sitio) como el que
-- hace la función `calendar-events` al aceptar (usa la llave de
-- servicio, que no pasa por RLS, pero se deja la política completa
-- para que un update de prueba desde el SQL Editor con un usuario
-- normal también respete la misma regla).
drop policy if exists "reservas_salas_update_staff" on public.reservas_salas;
create policy "reservas_salas_update_staff" on public.reservas_salas
  for update using (public.is_staff_or_above());

-- ─────────────────────────────────────────────────────────────
-- 4) Vista con los datos ya unidos (quién pidió, quién respondió, el
--    nombre de la sala) - mismo patrón que incidencias_con_reportante:
--    el filtro de quién puede ver qué va en el WHERE de la vista, no
--    en RLS de profiles (que es más restrictiva).
-- ─────────────────────────────────────────────────────────────
create or replace view public.reservas_salas_con_datos as
select
  r.id, r.sala_id, s.nombre as sala_nombre,
  r.asesor_id,
  p.nombre as asesor_nombre, p.apellido as asesor_apellido,
  p.whatsapp as asesor_whatsapp, p.email as asesor_email,
  r.fecha, r.hora_inicio, r.hora_fin, r.motivo,
  r.estado, r.nota_respuesta,
  r.respondido_por,
  rp.nombre as respondido_por_nombre, rp.apellido as respondido_por_apellido,
  r.respondido_en, r.evento_calendar_id,
  r.created_at, r.updated_at
from public.reservas_salas r
join public.salas_kw s on s.id = r.sala_id
join public.profiles p on p.id = r.asesor_id
left join public.profiles rp on rp.id = r.respondido_por
where auth.uid() = r.asesor_id or public.is_staff_or_above();

grant select on public.reservas_salas_con_datos to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5) Notificaciones (campanita), mismo patrón que los tickets.
-- ─────────────────────────────────────────────────────────────
create or replace function public.notificar_reserva_sala_nueva()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_solicitante text;
  v_sala text;
begin
  select coalesce(nullif(trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), ''), email)
    into v_solicitante from public.profiles where id = new.asesor_id;
  select nombre into v_sala from public.salas_kw where id = new.sala_id;

  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  select p.id, 'reserva_sala_nueva', 'Nueva solicitud de sala',
         coalesce(v_solicitante, 'Alguien') || ' pidió ' || coalesce(v_sala, new.sala_id) ||
           ' para el ' || to_char(new.fecha, 'DD/MM/YYYY'),
         '/kwpremierweb/hub/calendario.html?tab=salas'
  from public.profiles p
  where p.role in ('master', 'admin', 'staff') and p.id <> new.asesor_id;
  return new;
end;
$$;

drop trigger if exists trg_notificar_reserva_sala_nueva on public.reservas_salas;
create trigger trg_notificar_reserva_sala_nueva
  after insert on public.reservas_salas
  for each row execute function public.notificar_reserva_sala_nueva();

create or replace function public.notificar_reserva_sala_actualizada()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_sala text;
begin
  if new.estado is distinct from old.estado and new.estado in ('aceptada', 'rechazada') then
    select nombre into v_sala from public.salas_kw where id = new.sala_id;
    insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
    values (
      new.asesor_id,
      'reserva_sala_actualizada',
      case when new.estado = 'aceptada' then 'Te aceptaron la sala' else 'Te rechazaron la sala' end,
      coalesce(v_sala, new.sala_id) || ' - ' || to_char(new.fecha, 'DD/MM/YYYY') ||
        case when new.nota_respuesta is not null and new.nota_respuesta <> ''
             then ': ' || new.nota_respuesta else '' end,
      '/kwpremierweb/hub/calendario.html?tab=salas'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificar_reserva_sala_actualizada on public.reservas_salas;
create trigger trg_notificar_reserva_sala_actualizada
  after update on public.reservas_salas
  for each row execute function public.notificar_reserva_sala_actualizada();

-- Realtime, para que el tablero de solicitudes se actualice solo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservas_salas'
  ) then
    alter publication supabase_realtime add table public.reservas_salas;
  end if;
end $$;
