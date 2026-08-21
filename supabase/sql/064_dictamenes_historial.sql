-- ═════════════════════════════════════════════════════════════
-- 064 · Dictámenes: historial de movimientos y estatus de listado
-- ═════════════════════════════════════════════════════════════
--
-- Se corre después de 063. Como todos los de esta carpeta, se puede
-- volver a correr sin romper nada ni pisar lo capturado.

-- ─────────────────────────────────────────────────────────────
-- 1) El estatus del listado
-- ─────────────────────────────────────────────────────────────
-- Es otra cosa que el dictamen del expediente: un expediente puede estar
-- autorizado y el listado seguir sin cargarse. Por eso va en su propia
-- columna y no como un estado más del dictamen.
alter table public.dictamenes
  add column if not exists estatus_listado text not null default 'pendiente';

alter table public.dictamenes drop constraint if exists dictamenes_estatus_listado_check;
alter table public.dictamenes
  add constraint dictamenes_estatus_listado_check
  check (estatus_listado in ('pendiente', 'sin_listado', 'aprobado'))
  not valid;

do $$
begin
  alter table public.dictamenes validate constraint dictamenes_estatus_listado_check;
exception when others then
  raise notice 'Quedaron dictámenes con un estatus de listado fuera de la lista.';
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2) El historial
-- ─────────────────────────────────────────────────────────────
create table if not exists public.dictamen_historial (
  id uuid primary key default gen_random_uuid(),
  dictamen_id uuid not null references public.dictamenes(id) on delete cascade,

  -- Quién lo movió. Se conserva aunque esa persona salga de la oficina.
  quien uuid references public.profiles(id) on delete set null,

  -- Qué pasó, en clave, para poder pintarlo con su color.
  que text not null,

  -- El detalle ya escrito. Se guarda redactado y no se recalcula al
  -- leerlo, a propósito: el historial tiene que seguir diciendo lo mismo
  -- dentro de un año, aunque para entonces la observación de la que
  -- habla ya se haya borrado o el asesor se haya ido.
  detalle text,

  created_at timestamptz not null default now()
);

create index if not exists idx_dictamen_historial_dictamen
  on public.dictamen_historial(dictamen_id, created_at desc);

alter table public.dictamen_historial enable row level security;

-- Se lee igual que el dictamen al que pertenece. No hay políticas de
-- insert, update ni delete a propósito: el historial lo escriben los
-- triggers de aquí abajo, que son security definer y por eso pasan por
-- encima de RLS. Desde el navegador no se puede tocar, que es justo lo
-- que se le pide a un historial.
drop policy if exists "select_liderazgo" on public.dictamen_historial;
create policy "select_liderazgo" on public.dictamen_historial
  for select to authenticated using (public.is_staff_or_above());

-- Cómo se llama cada estado cuando se cuenta en el historial. Vive aquí
-- y no en la pantalla porque lo que se guarda es la frase ya redactada.
create or replace function public.dictamen_nombre_estado(p_estado text)
returns text
language sql immutable
as $$
  select case p_estado
    when 'borrador'     then 'Borrador'
    when 'devuelta'     then 'Devuelto'
    when 'condicionada' then 'Autorizado condicionado'
    when 'autorizada'   then 'Autorizado para promoción'
    when 'pendiente'    then 'Pendiente'
    when 'sin_listado'  then 'No tiene cargado el listado'
    when 'aprobado'     then 'Aprobado'
    else p_estado
  end;
$$;

create or replace function public.dictamen_anotar(
  p_dictamen uuid, p_que text, p_detalle text default null)
returns void
language sql security definer set search_path = public
as $$
  insert into public.dictamen_historial (dictamen_id, quien, que, detalle)
  values (p_dictamen, auth.uid(), p_que, p_detalle);
$$;

-- ─────────────────────────────────────────────────────────────
-- 3) Lo que se anota solo
-- ─────────────────────────────────────────────────────────────
create or replace function public.dictamen_historia()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.dictamen_anotar(new.id, 'creado', 'Se levantó el expediente');
    return new;
  end if;

  if new.estado is distinct from old.estado then
    perform public.dictamen_anotar(new.id, 'estado',
      public.dictamen_nombre_estado(new.estado) ||
      case when new.folio is distinct from old.folio and new.folio is not null
        then '. Folio ' || new.folio else '' end);
  end if;

  if new.estatus_listado is distinct from old.estatus_listado then
    perform public.dictamen_anotar(new.id, 'listado',
      'Listado: ' || public.dictamen_nombre_estado(new.estatus_listado));
  end if;

  if new.archivado_at is distinct from old.archivado_at then
    perform public.dictamen_anotar(new.id,
      case when new.archivado_at is null then 'restaurado' else 'archivado' end,
      case when new.archivado_at is null
        then 'Se regresó del archivo' else 'Se archivó' end);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_dictamen_historia on public.dictamenes;
create trigger trg_dictamen_historia
  after insert or update on public.dictamenes
  for each row execute function public.dictamen_historia();

create or replace function public.dictamen_punto_historia()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.dictamen_anotar(new.dictamen_id, 'punto_nuevo',
      'Se pidió: ' || new.texto);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.dictamen_anotar(old.dictamen_id, 'punto_quitado',
      'Se quitó: ' || old.texto);
    return old;
  end if;

  if new.estado is distinct from old.estado then
    perform public.dictamen_anotar(new.dictamen_id,
      case when new.estado = 'corregida' then 'punto_corregida' else 'punto_pendiente' end,
      case when new.estado = 'corregida' then 'Corregida: ' else 'De vuelta a pendiente: ' end
        || new.texto);
  end if;

  if new.nota is distinct from old.nota and new.nota is not null then
    perform public.dictamen_anotar(new.dictamen_id, 'punto_nota',
      'Nota en "' || new.texto || '": ' || new.nota);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_dictamen_punto_historia on public.dictamen_puntos;
create trigger trg_dictamen_punto_historia
  after insert or update or delete on public.dictamen_puntos
  for each row execute function public.dictamen_punto_historia();

-- ─────────────────────────────────────────────────────────────
-- 4) El folio del dictamen, con el formato de 063
-- ─────────────────────────────────────────────────────────────
-- Ya no lleva las iniciales del asesor: el folio ahora dice de qué
-- documento es y de qué mes, que es lo que se quiere poder contar. De
-- quién es el expediente lo dice el propio expediente.
create or replace function public.dictaminar(p_id uuid, p_estado text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_dic public.dictamenes%rowtype;
  v_folio text;
begin
  if not public.puede_dictaminar() then
    raise exception 'No tienes permiso para dictaminar';
  end if;
  if p_estado not in ('devuelta', 'condicionada', 'autorizada') then
    raise exception 'Estado de dictamen no reconocido: %', p_estado;
  end if;

  select * into v_dic from public.dictamenes where id = p_id;
  if not found then raise exception 'Ese dictamen no existe'; end if;

  -- El folio se pone una sola vez. Si ya lo tiene, cambiar de estado no
  -- se lo cambia: el folio es el nombre del documento, y uno que ya
  -- circuló no puede cambiar de nombre.
  if v_dic.folio is null then
    v_folio := public.folio_del_mes('dictamen');
  else
    v_folio := v_dic.folio;
  end if;

  update public.dictamenes
  set estado = p_estado,
      folio = v_folio,
      dictaminado_at = coalesce(dictaminado_at, now()),
      updated_at = now()
  where id = p_id;

  return v_folio;
end;
$$;

grant execute on function public.dictaminar(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5) La vista, con el estatus del listado
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- 6) El historial con el nombre de quien movió
-- ─────────────────────────────────────────────────────────────
create or replace view public.dictamen_historial_con_quien as
select
  h.id, h.dictamen_id, h.que, h.detalle, h.created_at,
  trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')) as quien_nombre
from public.dictamen_historial h
left join public.profiles p on p.id = h.quien
where public.is_staff_or_above();

grant select on public.dictamen_historial_con_quien to authenticated;
