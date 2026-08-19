-- Etiquetas y corrección del asesor en los documentos de firma.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.
--
-- Dos cosas que hacen falta sobre el historial ya armado:
--
-- 1) El asesor se deduce de los firmantes, y esa deducción falla cuando
--    el asesor no firmó o firmó con un correo personal. Hacía falta
--    poder corregirlo a mano en esos casos.
--
-- 2) Etiquetas libres para marcar el documento por donde va en el
--    proceso interno del Market Center ("revisado", "todo ok", "falta
--    anexo"), que es información nuestra y no tiene nada que ver con el
--    estado de firma que reporta weetrust.

create extension if not exists pgcrypto;

-- ── El catálogo de etiquetas ──
create table if not exists public.firmas_etiquetas (
  id uuid primary key default gen_random_uuid(),
  -- Único sin distinguir mayúsculas para que no acaben "Revisado" y
  -- "revisado" como dos etiquetas distintas en la misma lista.
  nombre text not null,
  color text not null default '#6b7280',
  created_at timestamptz not null default now()
);

create unique index if not exists idx_firmas_etiquetas_nombre
  on public.firmas_etiquetas(lower(trim(nombre)));

alter table public.firmas_etiquetas enable row level security;

drop policy if exists "etiquetas_select" on public.firmas_etiquetas;
create policy "etiquetas_select" on public.firmas_etiquetas
  for select using (auth.uid() is not null);

-- ── Qué etiquetas trae cada documento ──
-- Va como arreglo de identificadores y no como tabla de unión aparte.
-- Con una tabla de unión el modelo sería más ortodoxo, pero la pantalla
-- ya carga el catálogo completo (son un puñado) y resolver los nombres
-- ahí sale gratis, mientras que la tabla de unión obligaría a un join en
-- cada carga del historial. Se paga con no tener llave foránea; a cambio
-- la función de borrar etiqueta limpia las referencias.
alter table public.firmas_documentos
  add column if not exists etiquetas uuid[] not null default '{}';

create index if not exists idx_firmas_documentos_etiquetas
  on public.firmas_documentos using gin (etiquetas);

-- ── Crear una etiqueta ──
-- Si ya existe una con ese nombre se devuelve la que hay, en vez de
-- fallar: quien la está creando quiere etiquetar su documento, y que le
-- truene porque alguien más ya la creó no le sirve de nada.
create or replace function public.firmas_crear_etiqueta(p_nombre text, p_color text default null)
returns public.firmas_etiquetas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := trim(p_nombre);
  v_fila public.firmas_etiquetas;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesión';
  end if;
  if v_nombre = '' then
    raise exception 'La etiqueta necesita un nombre';
  end if;
  if length(v_nombre) > 40 then
    raise exception 'El nombre de la etiqueta es demasiado largo';
  end if;

  select * into v_fila from public.firmas_etiquetas
  where lower(trim(nombre)) = lower(v_nombre);
  if found then return v_fila; end if;

  insert into public.firmas_etiquetas (nombre, color)
  values (v_nombre, coalesce(nullif(trim(p_color), ''), '#6b7280'))
  returning * into v_fila;
  return v_fila;
end;
$$;

grant execute on function public.firmas_crear_etiqueta(text, text) to authenticated;

-- ── Ponerle etiquetas a un documento ──
-- La tabla de documentos está cerrada a escritura desde el navegador a
-- propósito (si no, cualquiera marcaría un contrato como firmado). Por
-- eso esto va por una función y no por un update directo: así se puede
-- dejar pasar exactamente este cambio y nada más.
create or replace function public.firmas_etiquetar(p_documento uuid, p_etiquetas uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dueño uuid;
begin
  select user_id into v_dueño from public.firmas_documentos where id = p_documento;
  if not found then
    raise exception 'Ese documento no existe';
  end if;

  -- Etiquetar es organizar, no decidir: lo puede hacer quien mandó el
  -- documento y cualquiera del liderazgo.
  if not (v_dueño = auth.uid() or public.is_staff_or_above()) then
    raise exception 'No puedes etiquetar este documento';
  end if;

  -- Se descarta lo que no corresponda a una etiqueta real, para que un
  -- identificador inventado no se quede guardado en el arreglo.
  update public.firmas_documentos
  set etiquetas = coalesce((
    select array_agg(distinct e.id)
    from public.firmas_etiquetas e
    where e.id = any(p_etiquetas)
  ), '{}')
  where id = p_documento;

  return (select etiquetas from public.firmas_documentos where id = p_documento);
end;
$$;

grant execute on function public.firmas_etiquetar(uuid, uuid[]) to authenticated;

-- ── Corregir de quién es el documento ──
create or replace function public.firmas_asignar_asesor(p_documento uuid, p_asesor uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cambiar el dueño cambia quién puede ver el documento, así que se
  -- queda en el liderazgo y no en quien lo tiene ahora.
  if not public.is_staff_or_above() then
    raise exception 'Solo el equipo de liderazgo puede cambiar el asesor';
  end if;

  if p_asesor is not null and not exists (select 1 from public.profiles where id = p_asesor) then
    raise exception 'Esa persona no existe';
  end if;

  update public.firmas_documentos set user_id = p_asesor where id = p_documento;
  if not found then
    raise exception 'Ese documento no existe';
  end if;

  return p_asesor;
end;
$$;

grant execute on function public.firmas_asignar_asesor(uuid, uuid) to authenticated;

-- ── Borrar una etiqueta del catálogo ──
-- Se quita también de los documentos que la traían: como no hay llave
-- foránea, sin esto quedarían apuntando a algo que ya no existe y en la
-- pantalla se verían como huecos.
create or replace function public.firmas_borrar_etiqueta(p_etiqueta uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff_or_above() then
    raise exception 'Solo el equipo de liderazgo puede borrar etiquetas';
  end if;

  update public.firmas_documentos
  set etiquetas = array_remove(etiquetas, p_etiqueta)
  where etiquetas @> array[p_etiqueta];

  delete from public.firmas_etiquetas where id = p_etiqueta;
end;
$$;

grant execute on function public.firmas_borrar_etiqueta(uuid) to authenticated;

-- Unas cuantas para arrancar, de las que se usan en el Market Center.
insert into public.firmas_etiquetas (nombre, color) values
  ('Revisado', '#16a34a'),
  ('Falta anexo', '#e0a218'),
  ('Todo OK', '#2563eb')
on conflict do nothing;
