-- Fase 12: sistema de notificaciones (campanita en el header).
-- Por ahora cubre dos eventos: usuario nuevo (avisa a Master/Admin) y
-- tickets (avisa a Master/Admin/Staff cuando llega uno nuevo, y avisa
-- a quien reportó cuando le responden o le cambian el estatus).
-- Se pueden agregar más tipos de notificación más adelante siguiendo
-- el mismo patrón (un trigger que inserta en esta tabla).
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  mensaje text,
  url text,
  leido boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notificaciones_user_id on public.notificaciones(user_id, created_at desc);

alter table public.notificaciones enable row level security;

drop policy if exists "select_own" on public.notificaciones;
create policy "select_own" on public.notificaciones
  for select using (auth.uid() = user_id);

drop policy if exists "update_own" on public.notificaciones;
create policy "update_own" on public.notificaciones
  for update using (auth.uid() = user_id);

-- Sin política de insert/delete para el cliente: solo las funciones
-- SECURITY DEFINER de abajo (dueñas de la tabla) pueden crear avisos,
-- mismo patrón que handle_new_user() y finalizar_documento().

-- 1) Usuario nuevo -> avisa a Master y Admin.
create or replace function public.notificar_usuario_nuevo()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_nombre text;
begin
  v_nombre := coalesce(nullif(trim(coalesce(new.nombre, '') || ' ' || coalesce(new.apellido, '')), ''), new.email);

  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  select p.id, 'usuario_nuevo', 'Nuevo usuario agregado',
         v_nombre || ' se unió como ' || new.role,
         '/kwpremierweb/hub/admin.html'
  from public.profiles p
  where p.role in ('master', 'admin') and p.id <> new.id;
  return new;
end;
$$;

drop trigger if exists trg_notificar_usuario_nuevo on public.profiles;
create trigger trg_notificar_usuario_nuevo
  after insert on public.profiles
  for each row execute function public.notificar_usuario_nuevo();

-- 2) Ticket nuevo -> avisa a Master, Admin y Staff (menos a quien lo reportó).
create or replace function public.notificar_ticket_nuevo()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_reportante text;
begin
  select coalesce(nullif(trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), ''), email)
  into v_reportante
  from public.profiles where id = new.user_id;

  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  select p.id, 'ticket_nuevo', 'Nuevo ticket: ' || new.titulo,
         coalesce(v_reportante, 'Alguien') || ' reportó una incidencia',
         '/kwpremierweb/hub/tickets.html'
  from public.profiles p
  where p.role in ('master', 'admin', 'staff') and p.id <> new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_notificar_ticket_nuevo on public.incidencias;
create trigger trg_notificar_ticket_nuevo
  after insert on public.incidencias
  for each row execute function public.notificar_ticket_nuevo();

-- 3) Ticket respondido o cambia de estatus -> avisa a quien lo reportó.
create or replace function public.notificar_ticket_actualizado()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (new.estatus is distinct from old.estatus or new.respuesta is distinct from old.respuesta)
     and auth.uid() is distinct from new.user_id then
    insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
    values (
      new.user_id, 'ticket_actualizado', 'Actualizaron tu ticket: ' || new.titulo,
      case
        when new.respuesta is distinct from old.respuesta and coalesce(new.respuesta, '') <> ''
          then 'Te respondieron: ' || left(new.respuesta, 120)
        else 'Nuevo estatus: ' || new.estatus
      end,
      '/kwpremierweb/hub/tickets.html'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificar_ticket_actualizado on public.incidencias;
create trigger trg_notificar_ticket_actualizado
  after update on public.incidencias
  for each row execute function public.notificar_ticket_actualizado();

-- Activa Realtime en esta tabla para que la campanita se actualice sola
-- sin recargar la página (si ya estaba activado, este bloque no hace nada).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificaciones'
  ) then
    alter publication supabase_realtime add table public.notificaciones;
  end if;
end $$;
