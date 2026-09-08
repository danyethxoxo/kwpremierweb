-- 080_dictamenes_revisiones_marketing.sql
-- Conserva el folio del dictamen, registra una versión por cada edición
-- y separa los estados de Expediente, Marketing y Listado.
-- Requiere 061, 062, 064 y 065_dictamenes_precio_escritura.

alter table public.dictamenes
  add column if not exists revision integer not null default 0,
  add column if not exists estatus_marketing text not null default 'pendiente';

alter table public.dictamenes drop constraint if exists dictamenes_revision_check;
alter table public.dictamenes
  add constraint dictamenes_revision_check check (revision >= 0);

alter table public.dictamenes drop constraint if exists dictamenes_estatus_marketing_check;
alter table public.dictamenes
  add constraint dictamenes_estatus_marketing_check
  check (estatus_marketing in ('pendiente', 'corregir', 'aprobado'));

create table if not exists public.dictamen_revisiones (
  id uuid primary key default gen_random_uuid(),
  dictamen_id uuid not null references public.dictamenes(id) on delete cascade,
  revision integer not null,
  datos jsonb not null,
  clientes jsonb not null default '[]'::jsonb,
  puntos jsonb not null default '[]'::jsonb,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (dictamen_id, revision)
);

create index if not exists dictamen_revisiones_dictamen_idx
  on public.dictamen_revisiones(dictamen_id, revision desc);

alter table public.dictamen_revisiones enable row level security;
drop policy if exists "select_liderazgo" on public.dictamen_revisiones;
create policy "select_liderazgo" on public.dictamen_revisiones
  for select to authenticated using (public.is_staff_or_above());

create or replace function public.registrar_revision_dictamen(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dic public.dictamenes%rowtype;
  v_revision integer;
  v_clientes jsonb;
  v_puntos jsonb;
begin
  if not public.puede_dictaminar() then
    raise exception 'No tienes permiso para crear revisiones de dictámenes.';
  end if;

  select * into v_dic from public.dictamenes where id = p_id for update;
  if not found then raise exception 'El dictamen no existe.'; end if;

  v_revision := coalesce(v_dic.revision, 0) + 1;
  update public.dictamenes
     set revision = v_revision, updated_at = now()
   where id = p_id
   returning * into v_dic;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.orden), '[]'::jsonb)
    into v_clientes
    from public.dictamen_clientes c
   where c.dictamen_id = p_id;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.orden), '[]'::jsonb)
    into v_puntos
    from public.dictamen_puntos p
   where p.dictamen_id = p_id;

  insert into public.dictamen_revisiones
    (dictamen_id, revision, datos, clientes, puntos, creado_por)
  values
    (p_id, v_revision, to_jsonb(v_dic), v_clientes, v_puntos, auth.uid());

  perform public.dictamen_anotar(
    p_id, 'revision', 'Rev ' || v_revision || ' · Se guardó una nueva versión'
  );
  return v_revision;
end;
$$;

revoke all on function public.registrar_revision_dictamen(uuid) from public;
grant execute on function public.registrar_revision_dictamen(uuid) to authenticated;

create or replace function public.dictamen_cambiar_marketing(p_id uuid, p_estado text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior text;
begin
  if not public.puede_dictaminar() then
    raise exception 'No tienes permiso para cambiar Marketing.';
  end if;
  if p_estado not in ('pendiente', 'corregir', 'aprobado') then
    raise exception 'Estado de Marketing no reconocido.';
  end if;

  select estatus_marketing into v_anterior
    from public.dictamenes where id = p_id for update;
  if not found then raise exception 'El dictamen no existe.'; end if;

  update public.dictamenes
     set estatus_marketing = p_estado, updated_at = now()
   where id = p_id;

  if v_anterior is distinct from p_estado then
    perform public.dictamen_anotar(
      p_id, 'marketing',
      'Marketing: ' || case p_estado
        when 'pendiente' then 'Pendiente'
        when 'corregir' then 'Corregir'
        when 'aprobado' then 'Aprobado para promoción'
      end
    );
  end if;
  return p_estado;
end;
$$;

revoke all on function public.dictamen_cambiar_marketing(uuid, text) from public;
grant execute on function public.dictamen_cambiar_marketing(uuid, text) to authenticated;

drop view if exists public.dictamenes_con_asesor;
create or replace view public.dictamenes_con_asesor as
select
  d.id, d.folio, d.revision, d.asesor_id, d.dictaminado_por,
  d.fecha_dictamen, d.cliente, d.inmueble,
  d.operacion, d.uso, d.tipo_inmueble_id, d.tipo_contrato,
  d.precio_listado, d.comision_porcentaje,
  d.escritura_propiedad,
  d.escritura_numero, d.escritura_fecha, d.notario_nombre, d.notaria_numero,
  d.condominio, d.escritura_condominio, d.cfdi,
  d.superficie_escritura, d.cuenta_predial, d.superficie_predial,
  d.superficie_terreno, d.superficie_construccion,
  d.estado_civil, d.folio_real, d.observaciones,
  d.estado, d.estatus_marketing, d.estatus_listado,
  d.archivado_at, d.dictaminado_at, d.created_at, d.updated_at,
  a.nombre as asesor_nombre,
  a.correo as asesor_correo,
  t.nombre as tipo_inmueble,
  q.nombre as dictaminador_nombre,
  q.apellido as dictaminador_apellido,
  coalesce(c.total, 0) as puntos_total,
  coalesce(c.pendientes, 0) as puntos_pendientes,
  coalesce(c.corregidas, 0) as puntos_corregidas,
  coalesce(cl.total, 0) as clientes_total,
  coalesce(cl.nombres, d.cliente) as clientes_nombres
from public.dictamenes d
join public.dictamen_asesores a on a.id = d.asesor_id
left join public.dictamen_tipos_inmueble t on t.id = d.tipo_inmueble_id
left join public.profiles q on q.id = d.dictaminado_por
left join lateral (
  select
    count(*) as total,
    count(*) filter (where estado = 'pendiente') as pendientes,
    count(*) filter (where estado = 'corregida') as corregidas
  from public.dictamen_puntos pt
  where pt.dictamen_id = d.id
) c on true
left join lateral (
  select count(*) as total,
         string_agg(cx.nombre, ', ' order by cx.orden) as nombres
  from public.dictamen_clientes cx
  where cx.dictamen_id = d.id
) cl on true
where public.is_staff_or_above();

grant select on public.dictamenes_con_asesor to authenticated;
