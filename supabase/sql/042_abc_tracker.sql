-- Fase 42: ABC de la Tecnología - seguimiento de adopción por asesor.
--
-- Reemplaza el libro de Sheets "ABC AHORA SI EL BUENO", donde el avance
-- vivía en una cuadrícula de casillas y el orden de las filas era lo
-- único que amarraba un palomeo con su asesor. Ese es justo el problema
-- que este esquema elimina: aquí un palomeo es una fila
-- (kwid, tema_id) - está pegado al KW ID, no a una posición. Dar de baja
-- a alguien no puede recorrerle los checks a otro, porque no hay orden
-- que romper.
--
-- Por lo mismo, una baja NUNCA se borra: se marca activo = false y se
-- deja de listar. Su historial se queda intacto por si regresa o hay que
-- consultarlo. El borrado en cascada de abc_avance solo aplica si
-- alguien elimina a mano un asesor a propósito; la sincronización con la
-- hoja jamás borra.
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

-- ─────────────────────────────────────────────────────────────
-- 1) Catálogo de temas (el temario del ABC)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.abc_temas (
  id          smallint primary key,
  orden       smallint not null,
  sesion      text     not null,
  nombre      text     not null,
  activo      boolean  not null default true
);

comment on table public.abc_temas is
  'Temario del ABC de la Tecnología. Desactivar un tema (activo=false) lo saca del cálculo de porcentaje sin perder los palomeos ya registrados.';

-- ─────────────────────────────────────────────────────────────
-- 2) Padrón de asesores
-- ─────────────────────────────────────────────────────────────
create table if not exists public.abc_asesores (
  kwid            text primary key,
  nombre          text not null,
  fecha_ingreso   date,
  dt_asignado     text,
  activo          boolean not null default true,
  sincronizado_en timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.abc_asesores.kwid is
  'KW ID. Es la llave real del asesor: los palomeos cuelgan de aquí, no de la posición en una lista.';
comment on column public.abc_asesores.activo is
  'Una baja se marca false, nunca se borra. Así el historial de avance se conserva.';
comment on column public.abc_asesores.dt_asignado is
  'Se administra a mano desde el sitio. La sincronización con la hoja de asesores nunca lo toca (nombre, kwid y fecha_ingreso sí vienen de ahí).';

create index if not exists abc_asesores_activo_idx on public.abc_asesores (activo);
create index if not exists abc_asesores_dt_idx     on public.abc_asesores (dt_asignado);

-- ─────────────────────────────────────────────────────────────
-- 3) Avance: un renglón por (asesor, tema)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.abc_avance (
  kwid        text     not null references public.abc_asesores(kwid) on delete cascade,
  tema_id     smallint not null references public.abc_temas(id)      on delete cascade,
  completado  boolean  not null default false,
  marcado_por uuid              references auth.users(id) on delete set null,
  marcado_en  timestamptz not null default now(),
  primary key (kwid, tema_id)
);

create index if not exists abc_avance_kwid_idx on public.abc_avance (kwid);

-- ─────────────────────────────────────────────────────────────
-- 4) updated_at automático en el padrón
-- ─────────────────────────────────────────────────────────────
create or replace function public.abc_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists abc_asesores_touch on public.abc_asesores;
create trigger abc_asesores_touch
  before update on public.abc_asesores
  for each row execute function public.abc_touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5) Permisos (RLS)
--
-- El ABC es material de liderazgo: lo consulta y lo palomea Master,
-- Admin y Staff - los mismos que ya pueden entrar a Documentos
-- Internos. Asociado no entra (igual que hoy en internos/index.html).
-- ─────────────────────────────────────────────────────────────
alter table public.abc_temas    enable row level security;
alter table public.abc_asesores enable row level security;
alter table public.abc_avance   enable row level security;

-- Temario: lo lee cualquiera del equipo; solo Master/Admin lo edita.
drop policy if exists "abc_temas_select" on public.abc_temas;
create policy "abc_temas_select" on public.abc_temas
  for select using (public.is_staff_or_above());

drop policy if exists "abc_temas_write" on public.abc_temas;
create policy "abc_temas_write" on public.abc_temas
  for all using (public.is_admin_or_master()) with check (public.is_admin_or_master());

-- Padrón: lo ve y lo edita el equipo de liderazgo.
drop policy if exists "abc_asesores_select" on public.abc_asesores;
create policy "abc_asesores_select" on public.abc_asesores
  for select using (public.is_staff_or_above());

drop policy if exists "abc_asesores_write" on public.abc_asesores;
create policy "abc_asesores_write" on public.abc_asesores
  for all using (public.is_staff_or_above()) with check (public.is_staff_or_above());

-- Avance: igual - quien da la sesión es quien palomea.
drop policy if exists "abc_avance_select" on public.abc_avance;
create policy "abc_avance_select" on public.abc_avance
  for select using (public.is_staff_or_above());

drop policy if exists "abc_avance_write" on public.abc_avance;
create policy "abc_avance_write" on public.abc_avance
  for all using (public.is_staff_or_above()) with check (public.is_staff_or_above());

-- ─────────────────────────────────────────────────────────────
-- 6) Temario inicial - los 25 temas tal cual están en el libro,
--    agrupados por sesión en el mismo orden.
-- ─────────────────────────────────────────────────────────────
insert into public.abc_temas (id, orden, sesion, nombre) values
  ( 1,  1, 'Onboarding', 'Google Suite'),
  ( 2,  2, 'Onboarding', 'Muro de Valor Tecnológico'),
  ( 3,  3, 'Sesión 1',   'Inicio Sesión KW en Chrome y Celular'),
  ( 4,  4, 'Sesión 1',   'Perfil de Command (marketing)'),
  ( 5,  5, 'Sesión 1',   'Perfil de Referidos'),
  ( 6,  6, 'Sesión 1',   'App Command'),
  ( 7,  7, 'Sesión 1',   'App KW: Buy & Sell'),
  ( 8,  8, 'Sesión 1',   'Website'),
  ( 9,  9, 'Sesión 2',   'Contactos y Etiquetas'),
  (10, 10, 'Sesión 2',   'Archivar, restaurar y eliminar contactos'),
  (11, 11, 'Sesión 2',   'Importación Masiva'),
  (12, 12, 'Sesión 2',   'WhatsApp Business'),
  (13, 13, 'Sesión 3',   'Oportunidades'),
  (14, 14, 'Sesión 4',   'SmartPlans'),
  (15, 15, 'Sesión 4',   'Campañas Por Correo y Redes'),
  (16, 16, 'Sesión 5',   'Diseña tu SmartPlan'),
  (17, 17, 'Sesión 6',   'Tablero Principal'),
  (18, 18, 'Sesión 6',   'Creación y Conexión con Redes'),
  (19, 19, 'Sesión 7',   'Carga de Propiedades'),
  (20, 20, 'Sesión 7',   'Creación de Contratos'),
  (21, 21, 'Sesión 8',   'Referidos'),
  (22, 22, 'Sesión 8',   'Tareas'),
  (23, 23, 'Sesión 8',   'Reportes y Metas'),
  (24, 24, 'Sesión 9',   'Canva'),
  (25, 25, 'Sesión 10',  'Capcut')
on conflict (id) do update
  set orden = excluded.orden,
      sesion = excluded.sesion,
      nombre = excluded.nombre;
