-- Fase 23: rediseño del perfil público (micrositio) y captura de prospectos.
--
-- Trae tres cosas:
--   1. Una descripción corta para la tarjeta roja del micrositio, aparte
--      del "Acerca de mí" que ya existía (son textos distintos: uno es la
--      presentación breve y el otro la explicación larga).
--   2. El correo en la vista pública, porque ahora se muestra en el
--      micrositio para que el cliente pueda escribir.
--   3. La tabla de prospectos: el formulario del micrositio deja ahí el
--      nombre, correo y teléfono de quien quiere contacto, y le llega un
--      aviso a la campanita del asesor.
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

-- ─────────────────────────────────────────────────────────────
-- 1. Descripción corta
-- ─────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists descripcion_corta text;

-- ─────────────────────────────────────────────────────────────
-- 2. Vista pública: se agregan email y descripcion_corta.
--    Las columnas nuevas van al final: `create or replace view` no deja
--    meterlas a la mitad de una vista que ya existe.
-- ─────────────────────────────────────────────────────────────
create or replace view public.perfiles_publicos as
select id, nombre, apellido, role, foto_url, puesto,
       acerca_de, sitio_web, whatsapp, instagram, facebook, tiktok, linkedin,
       email, descripcion_corta
from public.profiles
where oculto = false;

grant select on public.perfiles_publicos to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. Prospectos
-- ─────────────────────────────────────────────────────────────
create table if not exists public.prospectos (
  id uuid primary key default gen_random_uuid(),
  asesor_id uuid not null references public.profiles(id) on delete cascade,
  nombre text not null,
  correo text,
  telefono text,
  mensaje text,
  origen text not null default 'micrositio',
  atendido boolean not null default false,
  created_at timestamptz not null default now(),

  -- Topes de tamaño: el formulario es público, así que conviene que la
  -- base rechace de entrada cualquier cosa desproporcionada.
  constraint prospectos_nombre_largo check (char_length(nombre) between 2 and 120),
  constraint prospectos_correo_largo check (correo is null or char_length(correo) <= 160),
  constraint prospectos_telefono_largo check (telefono is null or char_length(telefono) <= 40),
  constraint prospectos_mensaje_largo check (mensaje is null or char_length(mensaje) <= 1000),
  -- Sirve de poco guardar un prospecto sin forma de contactarlo
  constraint prospectos_algun_contacto check (
    coalesce(correo, '') <> '' or coalesce(telefono, '') <> ''
  )
);

create index if not exists idx_prospectos_asesor
  on public.prospectos(asesor_id, created_at desc);

alter table public.prospectos enable row level security;

-- Comprueba que el asesor exista y esté visible. Va como función
-- SECURITY DEFINER (igual que is_admin y compañía) porque `profiles`
-- tiene RLS: quien llega al micrositio sin sesión no ve ninguna fila de
-- esa tabla, así que una subconsulta directa dentro de la política
-- siempre daría falso y rechazaría todos los formularios.
create or replace function public.asesor_recibe_prospectos(p_asesor uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_asesor and oculto = false
  );
$$;

grant execute on function public.asesor_recibe_prospectos(uuid) to anon, authenticated;

-- Cualquiera puede dejar sus datos (el micrositio es público y se abre
-- sin sesión), pero solo a nombre de un asesor que exista y esté
-- visible: así no se pueden sembrar registros huérfanos.
drop policy if exists "insert_publico" on public.prospectos;
create policy "insert_publico" on public.prospectos
  for insert to anon, authenticated
  with check (
    public.asesor_recibe_prospectos(asesor_id)
    and atendido = false
    and origen in ('micrositio', 'propiedad')
  );

-- Cada quien ve los suyos; Master y Admin ven todos.
drop policy if exists "select_propios" on public.prospectos;
create policy "select_propios" on public.prospectos
  for select using (auth.uid() = asesor_id or public.is_admin_or_master());

drop policy if exists "update_propios" on public.prospectos;
create policy "update_propios" on public.prospectos
  for update using (auth.uid() = asesor_id or public.is_admin_or_master());

drop policy if exists "delete_propios" on public.prospectos;
create policy "delete_propios" on public.prospectos
  for delete using (auth.uid() = asesor_id or public.is_admin_or_master());

-- ─────────────────────────────────────────────────────────────
-- 4. Aviso en la campanita cuando llega un prospecto
--    (mismo patrón que las notificaciones de tickets, ver 013)
-- ─────────────────────────────────────────────────────────────
create or replace function public.notificar_prospecto_nuevo()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_contacto text;
begin
  v_contacto := nullif(concat_ws(' · ', nullif(new.telefono, ''), nullif(new.correo, '')), '');

  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  values (
    new.asesor_id,
    'prospecto_nuevo',
    'Nuevo prospecto: ' || new.nombre,
    coalesce(v_contacto, 'Dejó sus datos desde tu perfil'),
    '/hub/prospectos.html'
  );
  return new;
end;
$$;

drop trigger if exists trg_notificar_prospecto_nuevo on public.prospectos;
create trigger trg_notificar_prospecto_nuevo
  after insert on public.prospectos
  for each row execute function public.notificar_prospecto_nuevo();
