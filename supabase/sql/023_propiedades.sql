-- Fase 21: catálogo de propiedades (base para la integración con Command).
--
-- Esta fase deja SOLO la base de datos lista: la tabla del catálogo, los
-- permisos y el mecanismo para compartir con atribución. Todavía no hay
-- páginas visibles ni panel de carga - eso viene cuando tengamos el feed
-- de Command (el XML/JSON que Command manda a los portales).
--
-- Cómo está pensado el catálogo:
--   · Entra inventario de TODO KW, no solo de KW Premier. La columna
--     `market_center` distingue de qué oficina viene cada propiedad, para
--     poder mostrar "todo KW" o filtrar "solo KW Premier".
--   · `asesor_id` apunta al perfil de KW Premier dueño de la propiedad
--     (para el micrositio de cada asesor). Queda en null cuando la
--     propiedad es de un asesor de otra oficina, que no tiene perfil
--     aquí; en ese caso el nombre se guarda en `asesor_nombre`.
--   · Cualquier usuario puede compartir cualquier propiedad y que salgan
--     SUS datos de contacto - ver la tabla `propiedades_compartidas` y la
--     función `resolver_propiedad_compartida()` más abajo.
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

-- ═══════════════════════════════════════════════════════════════
-- 1) Catálogo
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.propiedades (
  id uuid primary key default gen_random_uuid(),

  -- Origen: de dónde vino y con qué id la conoce el sistema de origen.
  -- El par (fuente, fuente_id) es único para que resincronizar actualice
  -- la propiedad en vez de duplicarla.
  fuente text not null default 'command',
  fuente_id text,

  -- Pertenencia
  asesor_id uuid references public.profiles(id) on delete set null,
  asesor_nombre text,
  market_center text,

  -- Datos del inmueble
  titulo text not null,
  descripcion text,
  operacion text,
  estatus text not null default 'no_publicada',
  tipo text,

  precio numeric,
  moneda text not null default 'MXN',

  recamaras int,
  banos numeric,
  estacionamientos int,
  m2_construccion numeric,
  m2_terreno numeric,

  calle text,
  colonia text,
  municipio text,
  estado text,
  cp text,
  pais text not null default 'MX',
  lat numeric,
  lng numeric,

  -- Arreglos de texto/objetos tal cual los entrega el origen
  imagenes jsonb not null default '[]'::jsonb,
  caracteristicas jsonb not null default '[]'::jsonb,

  -- Copia cruda de lo que mandó el origen. Sirve para no perder campos
  -- que hoy no mapeamos y poder re-mapear después sin volver a bajar todo.
  datos_origen jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sincronizado_at timestamptz
);

alter table public.propiedades drop constraint if exists propiedades_operacion_check;
alter table public.propiedades add constraint propiedades_operacion_check
  check (operacion is null or operacion in ('venta', 'renta'));

alter table public.propiedades drop constraint if exists propiedades_estatus_check;
alter table public.propiedades add constraint propiedades_estatus_check
  check (estatus in ('publicada', 'no_publicada', 'reservada', 'vendida', 'rentada', 'suspendida'));

-- Índice único COMPLETO (sin `where`) a propósito: la sincronización usa
-- `on conflict (fuente, fuente_id)` para actualizar en vez de duplicar, y
-- Postgres no acepta un índice parcial como árbitro de on conflict. No
-- hace falta el `where fuente_id is not null` porque Postgres ya trata
-- los NULL como distintos entre sí, así que varias propiedades cargadas
-- a mano (sin fuente_id) siguen conviviendo sin chocar.
create unique index if not exists idx_propiedades_fuente
  on public.propiedades(fuente, fuente_id);

create index if not exists idx_propiedades_publicas
  on public.propiedades(estatus, updated_at desc);
create index if not exists idx_propiedades_asesor on public.propiedades(asesor_id);
create index if not exists idx_propiedades_mc on public.propiedades(market_center);
create index if not exists idx_propiedades_filtros
  on public.propiedades(operacion, tipo, precio);

-- updated_at se mantiene solo
create or replace function public.touch_propiedad()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_propiedad on public.propiedades;
create trigger trg_touch_propiedad
  before update on public.propiedades
  for each row execute function public.touch_propiedad();

-- ── Permisos ──
-- El catálogo es público: cualquiera (con sesión o sin ella) puede leer
-- las propiedades publicadas. El equipo interno ve además las que no
-- están publicadas. Nadie escribe desde el navegador: las altas y
-- actualizaciones las hace la Edge Function de sincronización con la
-- llave de servicio, igual que finalizar_documento() o las funciones de
-- gestión de usuarios.
alter table public.propiedades enable row level security;

drop policy if exists "select_publicadas" on public.propiedades;
create policy "select_publicadas" on public.propiedades
  for select using (estatus = 'publicada' or public.is_staff_or_above());

-- Vista pública: expone solo lo publicado y deja fuera columnas internas
-- (datos_origen, estatus, sincronizado_at). Es la que debe consumir el
-- sitio público.
create or replace view public.propiedades_publicas as
select
  p.id, p.fuente_id,
  p.titulo, p.descripcion, p.operacion, p.tipo,
  p.precio, p.moneda,
  p.recamaras, p.banos, p.estacionamientos,
  p.m2_construccion, p.m2_terreno,
  p.colonia, p.municipio, p.estado, p.cp, p.pais, p.lat, p.lng,
  p.imagenes, p.caracteristicas,
  p.asesor_id, p.asesor_nombre, p.market_center,
  p.created_at, p.updated_at
from public.propiedades p
where p.estatus = 'publicada';

-- ═══════════════════════════════════════════════════════════════
-- 2) Compartir con atribución
-- ═══════════════════════════════════════════════════════════════
-- Cualquier usuario con cuenta puede generar un enlace de cualquier
-- propiedad del catálogo. Al abrirlo, la ficha muestra los datos de
-- contacto de QUIEN compartió, no los del asesor que la tiene listada.

create table if not exists public.propiedades_compartidas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  propiedad_id uuid not null references public.propiedades(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  visitas int not null default 0,
  created_at timestamptz not null default now(),
  unique (propiedad_id, user_id)
);

create index if not exists idx_compartidas_user on public.propiedades_compartidas(user_id, created_at desc);

alter table public.propiedades_compartidas enable row level security;

-- El enlace tiene que abrir sin sesión, así que la lectura es pública.
-- El código es aleatorio, no adivinable, y no expone nada sensible.
drop policy if exists "select_publico" on public.propiedades_compartidas;
create policy "select_publico" on public.propiedades_compartidas
  for select using (true);

drop policy if exists "delete_propio" on public.propiedades_compartidas;
create policy "delete_propio" on public.propiedades_compartidas
  for delete using (auth.uid() = user_id);

-- Genera (o reutiliza) el enlace de una propiedad para quien llama.
-- Reutilizar evita llenar la tabla de códigos si alguien comparte la
-- misma propiedad varias veces, y mantiene el contador de visitas.
create or replace function public.crear_enlace_compartido(p_propiedad_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_codigo text;
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión para compartir una propiedad.';
  end if;

  if not exists (select 1 from public.propiedades where id = p_propiedad_id) then
    raise exception 'La propiedad no existe.';
  end if;

  select codigo into v_codigo
  from public.propiedades_compartidas
  where propiedad_id = p_propiedad_id and user_id = auth.uid();

  if v_codigo is not null then
    return v_codigo;
  end if;

  -- Código corto derivado de un uuid (gen_random_uuid es nativo de
  -- Postgres; no depende de que pgcrypto esté en el search_path).
  -- Se reintenta por si hubiera colisión con el índice único.
  for i in 1..5 loop
    v_codigo := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    begin
      insert into public.propiedades_compartidas (codigo, propiedad_id, user_id)
      values (v_codigo, p_propiedad_id, auth.uid());
      return v_codigo;
    exception when unique_violation then
      -- Si el choque fue por (propiedad_id, user_id), alguien más creó
      -- el enlace entre nuestro select y este insert: devolvemos ese.
      select codigo into v_codigo
      from public.propiedades_compartidas
      where propiedad_id = p_propiedad_id and user_id = auth.uid();
      if v_codigo is not null then
        return v_codigo;
      end if;
      -- Si no, fue choque de código: se reintenta con otro.
    end;
  end loop;

  raise exception 'No se pudo generar el enlace para compartir. Inténtalo de nuevo.';
end;
$$;

-- Resuelve un enlace compartido: devuelve la propiedad junto con los
-- datos de contacto de quien la compartió. Suma una visita al abrirla.
-- Es SECURITY DEFINER porque tiene que funcionar sin sesión.
create or replace function public.resolver_propiedad_compartida(p_codigo text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.propiedades_compartidas;
  v_propiedad jsonb;
  v_quien_comparte jsonb;
begin
  select * into v_row
  from public.propiedades_compartidas
  where codigo = p_codigo;

  if v_row.id is null then
    return null;
  end if;

  select to_jsonb(pp) into v_propiedad
  from public.propiedades_publicas pp
  where pp.id = v_row.propiedad_id;

  if v_propiedad is null then
    -- El enlace existe pero la propiedad ya no está publicada: no se
    -- cuenta la visita porque no se va a mostrar nada.
    return null;
  end if;

  update public.propiedades_compartidas
  set visitas = visitas + 1
  where id = v_row.id;

  select jsonb_build_object(
    'id', pr.id,
    'nombre', pr.nombre,
    'apellido', pr.apellido,
    'email', pr.email,
    'foto_url', pr.foto_url,
    'puesto', pr.puesto,
    'whatsapp', pr.whatsapp,
    'sitio_web', pr.sitio_web,
    'instagram', pr.instagram,
    'facebook', pr.facebook,
    'tiktok', pr.tiktok,
    'linkedin', pr.linkedin
  ) into v_quien_comparte
  from public.profiles pr
  where pr.id = v_row.user_id;

  return jsonb_build_object(
    'propiedad', v_propiedad,
    'compartido_por', v_quien_comparte
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 3) Estado de la sincronización
-- ═══════════════════════════════════════════════════════════════
-- Guarda hasta dónde llegó la última corrida de cada origen, para poder
-- pedir solo lo que cambió (updated_after) en vez de bajar el catálogo
-- completo cada vez.

create table if not exists public.propiedades_sync (
  fuente text primary key,
  ultimo_cursor timestamptz,
  ultima_corrida timestamptz,
  ultimo_error text,
  propiedades_afectadas int not null default 0
);

alter table public.propiedades_sync enable row level security;

drop policy if exists "select_interno" on public.propiedades_sync;
create policy "select_interno" on public.propiedades_sync
  for select using (public.is_staff_or_above());

-- Sin políticas de escritura: solo la Edge Function (llave de servicio)
-- actualiza el estado de la sincronización.
