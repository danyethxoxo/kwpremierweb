-- ═════════════════════════════════════════════════════════════
-- 073 · Dictaminación: precio del listado, comisión y la escritura
--       desglosada
-- ═════════════════════════════════════════════════════════════
--
-- Se corre después de 064. Como todos los de esta carpeta, se puede
-- volver a correr las veces que haga falta sin romper nada ni pisar lo
-- que ya se haya capturado desde el sitio.
--
-- Trae dos cosas que pidió la oficina:
--
--   1. El precio del listado y el porcentaje de comisión. Son los dos
--      números que hoy se andan buscando en el contrato cada vez que
--      alguien pregunta en cuánto quedó una propiedad.
--
--   2. La escritura deja de ser un párrafo escrito a mano y se parte en
--      sus cuatro datos: número, fecha, notario y notaría. Como párrafo
--      no se podía ordenar por fecha, ni buscar por notaría, ni saber si
--      un expediente traía el dato completo o a medias.

-- ─────────────────────────────────────────────────────────────
-- 1) Precio del listado y comisión
-- ─────────────────────────────────────────────────────────────
-- Van como número y no como texto: son para sumar y comparar, y en
-- texto acabarían capturados como "3,500,000", "3.5 mdp" y "$3500000"
-- queriendo decir lo mismo. Sin default, porque un expediente a medio
-- revisar bien puede no traerlos todavía; cero no es lo mismo que "aún
-- no se sabe".
alter table public.dictamenes
  add column if not exists precio_listado numeric(14,2),
  add column if not exists comision_porcentaje numeric(5,2);

comment on column public.dictamenes.precio_listado is
  'Precio en que se lista la propiedad, en pesos.';
comment on column public.dictamenes.comision_porcentaje is
  'Porcentaje de comisión pactado con el cliente.';

alter table public.dictamenes drop constraint if exists dictamenes_precio_listado_check;
alter table public.dictamenes
  add constraint dictamenes_precio_listado_check
  check (precio_listado is null or precio_listado >= 0)
  not valid;

alter table public.dictamenes drop constraint if exists dictamenes_comision_check;
alter table public.dictamenes
  add constraint dictamenes_comision_check
  check (comision_porcentaje is null or comision_porcentaje between 0 and 100)
  not valid;

-- Se validan aparte y sin tumbar la corrida: si algún renglón viejo
-- quedara fuera de rango, el resto del archivo tiene que poder seguir.
do $$
begin
  alter table public.dictamenes validate constraint dictamenes_precio_listado_check;
exception when others then
  raise notice 'Quedaron dictámenes con un precio de listado negativo.';
end $$;

do $$
begin
  alter table public.dictamenes validate constraint dictamenes_comision_check;
exception when others then
  raise notice 'Quedaron dictámenes con un porcentaje de comisión fuera de 0 a 100.';
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2) La escritura, en sus cuatro datos
-- ─────────────────────────────────────────────────────────────
-- La columna vieja (escritura_propiedad) NO se borra ni se intenta
-- partir automáticamente: son párrafos escritos a mano, cada uno a su
-- manera, y adivinar dónde acaba el número y empieza el notario le
-- cambiaría el dato a expedientes ya dictaminados. Se queda como estaba
-- y el sitio la sigue enseñando cuando un expediente viejo no tiene los
-- campos nuevos; conforme se vayan editando, se van desglosando solos.
alter table public.dictamenes
  add column if not exists escritura_numero text,
  add column if not exists escritura_fecha date,
  add column if not exists notario_nombre text,
  add column if not exists notaria_numero text;

comment on column public.dictamenes.escritura_numero is
  'Número de la escritura de propiedad.';
comment on column public.dictamenes.escritura_fecha is
  'Fecha de escrituración.';
comment on column public.dictamenes.notario_nombre is
  'Nombre del notario ante quien se otorgó la escritura.';
comment on column public.dictamenes.notaria_numero is
  'Número de la notaría.';
comment on column public.dictamenes.escritura_propiedad is
  'Texto libre de la escritura, como se capturaba antes de partirla en '
  'número, fecha, notario y notaría. Se conserva para los expedientes '
  'que se levantaron con ese formato.';

-- ─────────────────────────────────────────────────────────────
-- 3) La vista, con lo nuevo
-- ─────────────────────────────────────────────────────────────
-- Se vuelve a escribir completa (y no con un "create or replace" a
-- secas) porque agregarle columnas a una vista existente no se puede sin
-- tirarla primero.
drop view if exists public.dictamenes_con_asesor;

create or replace view public.dictamenes_con_asesor as
select
  d.id, d.folio, d.asesor_id, d.dictaminado_por,
  d.fecha_dictamen, d.cliente, d.inmueble,
  d.operacion, d.uso, d.tipo_inmueble_id, d.tipo_contrato,
  d.precio_listado, d.comision_porcentaje,
  d.escritura_propiedad,
  d.escritura_numero, d.escritura_fecha, d.notario_nombre, d.notaria_numero,
  d.condominio, d.escritura_condominio, d.cfdi,
  d.superficie_escritura, d.cuenta_predial, d.superficie_predial,
  d.superficie_terreno, d.superficie_construccion,
  d.estado_civil, d.folio_real, d.observaciones,
  d.estado, d.estatus_listado, d.archivado_at, d.dictaminado_at,
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
  coalesce(cl.nombres, d.cliente) as clientes_nombres
from public.dictamenes d
join public.dictamen_asesores a on a.id = d.asesor_id
left join public.dictamen_tipos_inmueble t on t.id = d.tipo_inmueble_id
left join public.profiles q on q.id = d.dictaminado_por
left join lateral (
  select
    count(*)                                     as total,
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
