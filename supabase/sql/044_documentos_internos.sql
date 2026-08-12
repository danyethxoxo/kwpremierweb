-- Fase 44: Documentos Internos organizados por rol de liderazgo.
--
-- Antes las secciones (DT / PC / TL) estaban escritas en el HTML, así que
-- "hacer visible un documento para tal rol" hubiera sido editar código y
-- volver a desplegar. Aquí la visibilidad es un dato: cada documento
-- trae la lista de roles que lo ven, y el menú de la tarjeta la edita en
-- vivo. Por eso la pantalla lee de estas tablas y no de una lista fija.
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

-- ─────────────────────────────────────────────────────────────
-- 1) Catálogo de roles de liderazgo del Market Center
--
-- Ojo: esto NO es el rol de la cuenta (master/admin/staff/asociado, que
-- vive en profiles.role y es quien manda para los permisos). Esto es el
-- puesto dentro del MC, que solo sirve para ordenar los documentos en
-- carpetas. Agregar un puesto nuevo es un insert aquí, nada más.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.roles_kw (
  id          text primary key,
  nombre      text not null,
  descripcion text,
  color       text not null default '#4F46E5',
  orden       smallint not null default 0,
  activo      boolean not null default true
);

comment on table public.roles_kw is
  'Puestos de liderazgo del MC (DT, PC, MCA, TL). Sirven para agrupar documentos en carpetas; los permisos siguen saliendo de profiles.role.';

insert into public.roles_kw (id, nombre, descripcion, color, orden) values
  ('DT',  'Director de Tecnología',          'Adopción tecnológica y seguimiento del ABC',      '#4F46E5', 1),
  ('PC',  'Productivity Coach',              'Productividad y acompañamiento del asesor',       '#0891B2', 2),
  ('MCA', 'Market Center Administrator',     'Administración y operación del Market Center',    '#059669', 3),
  ('TL',  'Team Leader',                     'Liderazgo y crecimiento del Market Center',       '#B45309', 4)
on conflict (id) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      color = excluded.color,
      orden = excluded.orden;

-- ─────────────────────────────────────────────────────────────
-- 2) Documentos internos y a qué roles se les muestran
-- ─────────────────────────────────────────────────────────────
create table if not exists public.documentos_internos (
  id          text primary key,
  titulo      text not null,
  descripcion text,
  href        text not null,
  icono       text not null default 'documento',
  roles       text[] not null default '{}',
  orden       smallint not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.documentos_internos.roles is
  'Qué puestos ven este documento. Lo edita el menú de tres puntos de la tarjeta ("Hacer visible para"). Vacío = no aparece en ninguna carpeta.';
comment on column public.documentos_internos.href is
  'Ruta relativa a documentos/internos/ (por ejemplo "gps.html" o "dt/abc-tracker.html").';

create index if not exists documentos_internos_roles_idx
  on public.documentos_internos using gin (roles);

-- ─────────────────────────────────────────────────────────────
-- 3) Que no se cuelen roles inventados
--
-- `roles` es un arreglo de texto, así que sin esto un typo ("dt" en
-- minúscula, "MCAA") se guardaría sin quejarse y el documento
-- simplemente no aparecería en ninguna carpeta - un bug callado y
-- molesto de rastrear. Mejor que la escritura falle en el momento.
-- ─────────────────────────────────────────────────────────────
create or replace function public.validar_roles_documento()
returns trigger
language plpgsql
as $$
declare
  invalido text;
begin
  select r into invalido
  from unnest(new.roles) as r
  where not exists (select 1 from public.roles_kw k where k.id = r)
  limit 1;

  if invalido is not null then
    raise exception 'El rol "%" no existe en roles_kw.', invalido;
  end if;
  return new;
end;
$$;

drop trigger if exists documentos_internos_validar_roles on public.documentos_internos;
create trigger documentos_internos_validar_roles
  before insert or update on public.documentos_internos
  for each row execute function public.validar_roles_documento();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documentos_internos_touch on public.documentos_internos;
create trigger documentos_internos_touch
  before update on public.documentos_internos
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4) Permisos
--
-- Documentos Internos ya es material de liderazgo, así que leer y editar
-- van al mismo grupo: Master/Admin/Staff. "Hacer visible para" queda
-- cubierto por la política de escritura - un asociado ni siquiera puede
-- leer estas tablas.
-- ─────────────────────────────────────────────────────────────
alter table public.roles_kw            enable row level security;
alter table public.documentos_internos enable row level security;

drop policy if exists "roles_kw_select" on public.roles_kw;
create policy "roles_kw_select" on public.roles_kw
  for select using (public.is_staff_or_above());

drop policy if exists "roles_kw_write" on public.roles_kw;
create policy "roles_kw_write" on public.roles_kw
  for all using (public.is_admin_or_master()) with check (public.is_admin_or_master());

drop policy if exists "documentos_internos_select" on public.documentos_internos;
create policy "documentos_internos_select" on public.documentos_internos
  for select using (public.is_staff_or_above());

drop policy if exists "documentos_internos_write" on public.documentos_internos;
create policy "documentos_internos_write" on public.documentos_internos
  for all using (public.is_staff_or_above()) with check (public.is_staff_or_above());

-- ─────────────────────────────────────────────────────────────
-- 5) Los documentos que ya existen
--
-- El ABC (los dos) queda solo en DT, que es de quien es. El GPS sí lo
-- usan los cuatro puestos.
-- ─────────────────────────────────────────────────────────────
-- Los títulos de estas dos filas se renombraron en la 047 ("ABC de la
-- Tecnología" y "Constancia del ABC para 100%"); se dejan aquí ya
-- actualizados para que volver a correr este archivo no los regrese.
insert into public.documentos_internos (id, titulo, descripcion, href, icono, roles, orden) values
  ('abc-tracker', 'ABC de la Tecnología',
   'Avance de adopción tecnológica por asesor: palomea los temas de cada sesión y consulta porcentajes',
   'dt/abc-tracker.html', 'check', array['DT'], 1),
  ('abc', 'Constancia del ABC para 100%',
   'Guía de procesos, lineamientos y buenas prácticas para asesores de KW Premier',
   'abc.html', 'libro', array['DT'], 2),
  ('gps', 'GPS',
   'Programa trimestral de seguimiento: metas, logros y porcentaje de cumplimiento por trimestre',
   'gps.html', 'grafica', array['DT','PC','MCA','TL'], 3)
on conflict (id) do update
  set titulo = excluded.titulo,
      descripcion = excluded.descripcion,
      href = excluded.href,
      icono = excluded.icono,
      orden = excluded.orden;
-- Nota: `roles` NO se pisa en el update a propósito. Si alguien ya
-- cambió la visibilidad desde el sitio, volver a correr este archivo no
-- debe deshacérsela.
