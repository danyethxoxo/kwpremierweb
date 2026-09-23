-- El helper de staff se usa como infraestructura de autorizacion. La
-- implementacion privilegiada vive en private; el nombre publico queda sin
-- EXECUTE para que no exista como RPC expuesto.
begin;

create or replace function private.is_staff_or_above()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('master', 'admin', 'staff')
  );
$$;
revoke all on function private.is_staff_or_above() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_staff_or_above() to authenticated;

-- Las politicas existentes se conservan completas; solo se cambia la
-- referencia al helper publico por la implementacion privada. El reemplazo
-- es seguro si la migracion se vuelve a ejecutar: no duplica private..
do $$
declare
  r record;
  v_qual text;
  v_check text;
begin
  for r in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and (
        coalesce(qual, '') like '%is_staff_or_above()%' or
        coalesce(with_check, '') like '%is_staff_or_above()%'
      )
  loop
    v_qual := regexp_replace(
      replace(r.qual, 'public.is_staff_or_above()', 'private.is_staff_or_above()'),
      '(^|[^.])is_staff_or_above[(][)]',
      E'\\1private.is_staff_or_above()',
      'g'
    );
    v_check := regexp_replace(
      replace(r.with_check, 'public.is_staff_or_above()', 'private.is_staff_or_above()'),
      '(^|[^.])is_staff_or_above[(][)]',
      E'\\1private.is_staff_or_above()',
      'g'
    );

    execute format(
      'drop policy %I on %I.%I',
      r.policyname, r.schemaname, r.tablename
    );
    execute format(
      'create policy %I on %I.%I as %s for %s to %s%s%s',
      r.policyname,
      r.schemaname,
      r.tablename,
      lower(r.permissive),
      lower(r.cmd),
      array_to_string(r.roles, ', '),
      case when r.qual is null then '' else format(' using (%s)', v_qual) end,
      case when r.with_check is null then '' else format(' with check (%s)', v_check) end
    );
  end loop;
end $$;

-- Las vistas security_invoker tambien deben llamar la implementacion privada;
-- de lo contrario la revocacion del wrapper publico romperia sus consultas.
create or replace view public.dictamen_historial_con_quien as
select
  h.id,
  h.dictamen_id,
  h.que,
  h.detalle,
  h.created_at,
  trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')) as quien_nombre
from public.dictamen_historial h
left join public.profiles p on p.id = h.quien
where private.is_staff_or_above();

create or replace view public.dictamenes_con_asesor as
select
  d.id,
  d.folio,
  d.revision,
  d.asesor_id,
  d.dictaminado_por,
  d.fecha_dictamen,
  d.cliente,
  d.inmueble,
  d.operacion,
  d.uso,
  d.tipo_inmueble_id,
  d.tipo_contrato,
  d.precio_listado,
  d.comision_porcentaje,
  d.escritura_propiedad,
  d.escritura_numero,
  d.escritura_fecha,
  d.notario_nombre,
  d.notaria_numero,
  d.condominio,
  d.escritura_condominio,
  d.cfdi,
  d.superficie_escritura,
  d.cuenta_predial,
  d.superficie_predial,
  d.superficie_terreno,
  d.superficie_construccion,
  d.estado_civil,
  d.folio_real,
  d.observaciones,
  d.estado,
  d.estatus_marketing,
  d.estatus_listado,
  d.archivado_at,
  d.dictaminado_at,
  d.created_at,
  d.updated_at,
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
    count(*) filter (where pt.estado = 'pendiente') as pendientes,
    count(*) filter (where pt.estado = 'corregida') as corregidas
  from public.dictamen_puntos pt
  where pt.dictamen_id = d.id
) c on true
left join lateral (
  select count(*) as total, string_agg(cx.nombre, ', ' order by cx.orden) as nombres
  from public.dictamen_clientes cx
  where cx.dictamen_id = d.id
) cl on true
where private.is_staff_or_above();

create or replace view public.documentos_con_asesor as
select
  d.id,
  d.user_id,
  d.tipo_documento,
  d.nombre_archivo,
  d.folio,
  d.estado,
  d.created_at,
  d.updated_at,
  p.nombre as asesor_nombre,
  p.apellido as asesor_apellido,
  p.email as asesor_email
from public.documentos_guardados d
join public.profiles p on p.id = d.user_id
where auth.uid() = d.user_id or private.is_staff_or_above();

create or replace view public.documentos_plantilla_con_asesor as
select
  d.id,
  d.plantilla_id,
  d.user_id,
  d.titulo,
  d.estado,
  d.folio,
  d.created_at,
  d.updated_at,
  d.finalizado_at,
  p.nombre as asesor_nombre,
  p.apellido as asesor_apellido,
  p.email as asesor_email,
  pl.nombre as plantilla_nombre,
  pl.categoria as plantilla_categoria
from public.documentos_plantilla d
join public.profiles p on p.id = d.user_id
left join public.plantillas_documento pl on pl.id = d.plantilla_id
where auth.uid() = d.user_id or private.is_staff_or_above();

create or replace view public.incidencias_con_reportante as
select
  i.id,
  i.user_id,
  i.titulo,
  i.descripcion,
  i.imagenes,
  i.estatus,
  i.created_at,
  i.updated_at,
  p.nombre as reportante_nombre,
  p.apellido as reportante_apellido,
  p.email as reportante_email,
  i.respuesta
from public.incidencias i
join public.profiles p on p.id = i.user_id
where auth.uid() = i.user_id or private.is_admin_or_master();

create or replace view public.reservas_salas_con_datos as
select
  r.id,
  r.sala_id,
  s.nombre as sala_nombre,
  r.asesor_id,
  p.nombre as asesor_nombre,
  p.apellido as asesor_apellido,
  p.whatsapp as asesor_whatsapp,
  p.email as asesor_email,
  r.fecha,
  r.hora_inicio,
  r.hora_fin,
  r.motivo,
  r.estado,
  r.nota_respuesta,
  r.respondido_por,
  rp.nombre as respondido_por_nombre,
  rp.apellido as respondido_por_apellido,
  r.respondido_en,
  r.evento_calendar_id,
  r.created_at,
  r.updated_at
from public.reservas_salas r
join public.salas_kw s on s.id = r.sala_id
join public.profiles p on p.id = r.asesor_id
left join public.profiles rp on rp.id = r.respondido_por
where auth.uid() = r.asesor_id or private.is_staff_or_above();

alter view public.dictamen_historial_con_quien set (security_invoker = true, security_barrier = true);
alter view public.dictamenes_con_asesor set (security_invoker = true, security_barrier = true);
alter view public.documentos_con_asesor set (security_invoker = true, security_barrier = true);
alter view public.documentos_plantilla_con_asesor set (security_invoker = true, security_barrier = true);
alter view public.incidencias_con_reportante set (security_invoker = true, security_barrier = true);
alter view public.reservas_salas_con_datos set (security_invoker = true, security_barrier = true);

revoke all on table public.dictamen_historial_con_quien, public.dictamenes_con_asesor,
  public.documentos_con_asesor, public.documentos_plantilla_con_asesor,
  public.incidencias_con_reportante, public.reservas_salas_con_datos
from anon;
grant select on table public.dictamen_historial_con_quien, public.dictamenes_con_asesor,
  public.documentos_con_asesor, public.documentos_plantilla_con_asesor,
  public.incidencias_con_reportante, public.reservas_salas_con_datos
to authenticated;

create or replace function public.is_staff_or_above()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_staff_or_above();
$$;
revoke all on function public.is_staff_or_above() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
