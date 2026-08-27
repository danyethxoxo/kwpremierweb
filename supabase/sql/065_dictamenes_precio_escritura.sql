-- ═════════════════════════════════════════════════════════════
-- 065 · Dictámenes: precio, comisión y la escritura desglosada
-- ═════════════════════════════════════════════════════════════
--
-- Se corre después de 064. Como todos los de esta carpeta, se puede
-- volver a correr sin romper nada ni pisar lo que ya se haya capturado
-- desde el sitio.
--
-- Trae dos cosas:
--
--   1. Cuánto se está listando y con qué comisión. Son los dos números
--      que se preguntaban de boca y no quedaban en ningún lado.
--   2. La escritura deja de ser un párrafo escrito a mano y pasa a ser
--      cuatro casillas: número, fecha, notario y notaría.

-- ─────────────────────────────────────────────────────────────
-- 1) El precio y la comisión
-- ─────────────────────────────────────────────────────────────
-- Van como número y no como texto para que se puedan sumar y ordenar
-- después. La moneda no se guarda: todo se lista en pesos, y el día que
-- deje de ser cierto se agrega la columna, no se mete "USD" adentro del
-- número.
alter table public.dictamenes
  add column if not exists precio_listado numeric(14, 2),

  -- El porcentaje pelón: 5 es cinco por ciento. Sin el símbolo, que es
  -- de cómo se enseña y no del dato.
  add column if not exists comision_porcentaje numeric(5, 2);

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

do $$
begin
  alter table public.dictamenes validate constraint dictamenes_precio_listado_check;
  alter table public.dictamenes validate constraint dictamenes_comision_check;
exception when others then
  raise notice 'Quedaron dictámenes con un precio o una comisión fuera de rango.';
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2) La escritura, en sus cuatro partes
-- ─────────────────────────────────────────────────────────────
-- Antes era un solo párrafo ("Escritura 25,928 de fecha 01 de agosto del
-- 2000, ante el Lic. ..."). Escrito así, el número de escritura no se
-- puede buscar ni el notario contar: hay que leerlo con los ojos.
--
-- escritura_propiedad no se borra ni se intenta partir a la fuerza. Lo
-- que se capturó como párrafo se queda tal cual y se sigue enseñando; lo
-- nuevo entra ya desglosado. Adivinar dónde termina el número y empieza
-- la fecha en un texto libre es justo la clase de suposición que después
-- sale mal en el expediente de alguien.
alter table public.dictamenes
  add column if not exists escritura_numero text,
  add column if not exists escritura_fecha date,
  add column if not exists notario_nombre text,
  add column if not exists notaria_numero text;

-- ─────────────────────────────────────────────────────────────
-- 3) La vista, con lo nuevo
-- ─────────────────────────────────────────────────────────────
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
