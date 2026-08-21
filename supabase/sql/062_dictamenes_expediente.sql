-- ═════════════════════════════════════════════════════════════
-- 062 · Dictaminación de expedientes: clientes, contrato y superficies
-- ═════════════════════════════════════════════════════════════
--
-- Se corre después de 061. Como todos los de esta carpeta, se puede
-- volver a correr las veces que haga falta sin romper nada ni pisar lo
-- que ya se haya capturado desde el sitio.
--
-- Trae cuatro cosas que pidió la oficina:
--
--   1. Un expediente puede tener varios clientes (una sucesión con tres
--      herederos, un matrimonio que vende, dos socios). Cada uno con su
--      nombre y su estado civil.
--   2. El tipo de contrato: exclusiva o abierto.
--   3. Condominio deja de ser texto libre y pasa a ser sí o no.
--   4. La superficie del predial se parte en dos, terreno y
--      construcción, que es como vienen en la boleta.

-- ─────────────────────────────────────────────────────────────
-- 1) Los clientes del expediente
-- ─────────────────────────────────────────────────────────────
-- Va como tabla aparte y no como columnas numeradas en el dictamen
-- porque no se sabe cuántos son: un expediente trae uno y el de junto
-- cuatro. Con columnas habría que adivinar el tope y dejar huecos.
--
-- El nombre y el estado civil viven aquí, juntos, porque el estado civil
-- es de la persona y no del expediente: en una sucesión bien puede haber
-- un heredero casado y otro soltero, y una sola casilla para los dos no
-- podría decirlo.
create table if not exists public.dictamen_clientes (
  id uuid primary key default gen_random_uuid(),
  dictamen_id uuid not null references public.dictamenes(id) on delete cascade,

  -- El orden en que se capturaron, que es el que se respeta al
  -- enseñarlos y al imprimirlos.
  orden int not null default 1,

  nombre text not null,

  -- Opcional a propósito: un expediente a medio revisar puede tener el
  -- nombre y todavía no el acta que diga el estado civil.
  estado_civil text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint dictamen_clientes_nombre_largo
    check (char_length(trim(nombre)) between 2 and 200)
);

create index if not exists idx_dictamen_clientes_dictamen
  on public.dictamen_clientes(dictamen_id, orden);

alter table public.dictamen_clientes enable row level security;

-- Se ve un cliente si se ve su dictamen. La regla de acceso vive en la
-- tabla de dictámenes, para que no haya dos criterios que mantener al día.
drop policy if exists "select_por_dictamen" on public.dictamen_clientes;
create policy "select_por_dictamen" on public.dictamen_clientes
  for select to authenticated using (public.is_staff_or_above());

drop policy if exists "escribe_dictaminador" on public.dictamen_clientes;
create policy "escribe_dictaminador" on public.dictamen_clientes
  for all to authenticated
  using (public.puede_dictaminar()) with check (public.puede_dictaminar());

drop trigger if exists set_dictamen_clientes_updated_at on public.dictamen_clientes;
create trigger set_dictamen_clientes_updated_at
  before update on public.dictamen_clientes
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2) Lo nuevo del inmueble
-- ─────────────────────────────────────────────────────────────
alter table public.dictamenes
  -- Con qué contrato se trae la propiedad. Sin default: que nadie
  -- suponga exclusiva por omisión, es justo el dato que se quiere ver.
  add column if not exists tipo_contrato text,

  -- Sí o no, no la escritura. La escritura del condominio sigue en
  -- escritura_condominio, que es otra cosa: una dice si el inmueble está
  -- en régimen de condominio y la otra con qué documento se acredita.
  add column if not exists condominio boolean,

  -- La boleta predial trae las dos por separado y hasta ahora se estaban
  -- capturando revueltas en una sola casilla.
  add column if not exists superficie_terreno text,
  add column if not exists superficie_construccion text;

alter table public.dictamenes drop constraint if exists dictamenes_tipo_contrato_check;
alter table public.dictamenes
  add constraint dictamenes_tipo_contrato_check
  check (tipo_contrato is null or tipo_contrato in ('exclusiva', 'abierto'))
  not valid;

do $$
begin
  alter table public.dictamenes validate constraint dictamenes_tipo_contrato_check;
exception when others then
  raise notice 'Quedaron dictámenes con un tipo de contrato que no está en la lista.';
end $$;

-- Lo que se haya capturado en la casilla vieja de superficie predial se
-- pasa a terreno, que es lo que se venía anotando ahí. No se borra la
-- columna vieja: si algo se leyó mal, el dato original sigue estando.
update public.dictamenes
  set superficie_terreno = superficie_predial
  where superficie_terreno is null
    and superficie_predial is not null
    and trim(superficie_predial) <> '';

-- ─────────────────────────────────────────────────────────────
-- 3) La vista, con los clientes ya contados
-- ─────────────────────────────────────────────────────────────
-- La pantalla pide la lista completa y necesita saber de cada dictamen
-- cuántos clientes trae y cómo se llaman, sin tener que ir tabla por
-- tabla. El nombre concatenado es para la búsqueda y para el renglón de
-- la lista; el detalle completo se lee aparte al abrir el expediente.
drop view if exists public.dictamenes_con_asesor;

create or replace view public.dictamenes_con_asesor as
select
  d.id, d.folio, d.asesor_id, d.dictaminado_por,
  d.fecha_dictamen, d.cliente, d.inmueble,
  d.operacion, d.uso, d.tipo_inmueble_id, d.tipo_contrato,
  d.escritura_propiedad, d.condominio, d.escritura_condominio, d.cfdi,
  d.superficie_escritura, d.cuenta_predial, d.superficie_predial,
  d.superficie_terreno, d.superficie_construccion,
  d.estado_civil, d.folio_real, d.observaciones,
  d.estado, d.archivado_at, d.dictaminado_at,
  d.created_at, d.updated_at,
  a.nombre          as asesor_nombre,
  a.correo          as asesor_correo,
  t.nombre          as tipo_inmueble,
  q.nombre          as dictaminador_nombre,
  q.apellido        as dictaminador_apellido,
  coalesce(c.total, 0)       as puntos_total,
  coalesce(c.pendientes, 0)  as puntos_pendientes,
  coalesce(c.corregidas, 0)  as puntos_corregidas,
  coalesce(cl.total, 0)      as clientes_total,
  -- Si todavía no tiene clientes capturados se cae al texto de la casilla
  -- vieja, para que un expediente de antes siga diciendo de quién es.
  coalesce(cl.nombres, d.cliente) as clientes_nombres
from public.dictamenes d
join public.dictamen_asesores a on a.id = d.asesor_id
left join public.dictamen_tipos_inmueble t on t.id = d.tipo_inmueble_id
left join public.profiles q on q.id = d.dictaminado_por
left join lateral (
  select
    count(*)                                    as total,
    count(*) filter (where estado = 'pendiente') as pendientes,
    count(*) filter (where estado = 'corregida') as corregidas
  from public.dictamen_puntos pt
  where pt.dictamen_id = d.id
) c on true
left join lateral (
  select count(*) as total, string_agg(cx.nombre, ', ' order by cx.orden) as nombres
  from public.dictamen_clientes cx
  where cx.dictamen_id = d.id
) cl on true
where public.is_staff_or_above();

grant select on public.dictamenes_con_asesor to authenticated;
