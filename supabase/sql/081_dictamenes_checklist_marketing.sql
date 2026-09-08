-- 081_dictamenes_checklist_marketing.sql
-- Checklist persistente de calidad del listado por dictamen.
-- Requiere 080_dictamenes_revisiones_marketing.sql.

alter table public.dictamenes
  add column if not exists marketing_checklist jsonb not null default '{}'::jsonb,
  add column if not exists marketing_comentario_general text not null default '';

alter table public.dictamenes drop constraint if exists dictamenes_marketing_checklist_object_check;
alter table public.dictamenes
  add constraint dictamenes_marketing_checklist_object_check
  check (jsonb_typeof(marketing_checklist) = 'object');

create or replace function public.dictamen_guardar_checklist_marketing(
  p_id uuid,
  p_checklist jsonb,
  p_comentario_general text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clave text;
  v_estado text;
  v_comentario text;
  v_limpio jsonb := '{}'::jsonb;
  v_correctos integer := 0;
  v_incorrectos integer := 0;
  v_pendientes integer := 0;
  v_estatus text;
begin
  if not public.puede_dictaminar() then
    raise exception 'No tienes permiso para revisar el checklist de Marketing.';
  end if;

  if not exists (select 1 from public.dictamenes where id = p_id) then
    raise exception 'El dictamen no existe.';
  end if;

  if p_checklist is not null and jsonb_typeof(p_checklist) <> 'object' then
    raise exception 'El checklist de Marketing no tiene un formato válido.';
  end if;

  foreach v_clave in array array[
    'titulo',
    'precio_moneda',
    'metrajes',
    'comisiones',
    'descripcion_nom247',
    'fotos'
  ]
  loop
    v_estado := coalesce(p_checklist -> v_clave ->> 'estado', 'pendiente');
    if v_estado not in ('pendiente', 'correcto', 'incorrecto') then
      v_estado := 'pendiente';
    end if;

    v_comentario := left(trim(coalesce(p_checklist -> v_clave ->> 'comentario', '')), 1500);
    v_limpio := v_limpio || jsonb_build_object(
      v_clave,
      jsonb_build_object('estado', v_estado, 'comentario', v_comentario)
    );

    if v_estado = 'correcto' then
      v_correctos := v_correctos + 1;
    elsif v_estado = 'incorrecto' then
      v_incorrectos := v_incorrectos + 1;
    else
      v_pendientes := v_pendientes + 1;
    end if;
  end loop;

  v_estatus := case
    when v_correctos = 6 then 'aprobado'
    when v_incorrectos > 0 then 'corregir'
    else 'pendiente'
  end;

  update public.dictamenes
     set marketing_checklist = v_limpio,
         marketing_comentario_general = left(trim(coalesce(p_comentario_general, '')), 4000),
         estatus_marketing = v_estatus,
         updated_at = now()
   where id = p_id;

  perform public.dictamen_anotar(
    p_id,
    'marketing_checklist',
    'Checklist de Marketing: ' || v_correctos || ' correctos, ' ||
      v_incorrectos || ' por corregir, ' || v_pendientes || ' pendientes'
  );

  return jsonb_build_object(
    'estatus_marketing', v_estatus,
    'correctos', v_correctos,
    'incorrectos', v_incorrectos,
    'pendientes', v_pendientes
  );
end;
$$;

revoke all on function public.dictamen_guardar_checklist_marketing(uuid, jsonb, text) from public;
grant execute on function public.dictamen_guardar_checklist_marketing(uuid, jsonb, text) to authenticated;

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
  coalesce(cl.nombres, d.cliente) as clientes_nombres,
  d.marketing_checklist,
  d.marketing_comentario_general
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
