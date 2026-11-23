-- Lectura de dictamenes por cuenta verificada y excepciones limitadas al modulo.
create table if not exists private.dictamen_lectores_globales (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table private.dictamen_lectores_globales enable row level security;
revoke all on private.dictamen_lectores_globales from public, anon, authenticated;
grant all on private.dictamen_lectores_globales to service_role;
insert into private.dictamen_lectores_globales(user_id)
select id from auth.users where lower(btrim(email))='gabriela.landa@kwmexico.mx'
on conflict(user_id) do nothing;

create or replace function private.dictamen_ver_todos() returns boolean
language sql stable security definer set search_path=''
as $fn$ select (select auth.uid()) is not null and (
 private.is_staff_or_above() or exists(
 select 1 from private.dictamen_lectores_globales l where l.user_id=(select auth.uid()))
) $fn$;
create or replace function private.dictamen_asesores_propios() returns uuid[]
language sql stable security definer set search_path=''
as $fn$ select coalesce(array_agg(a.id),array[]::uuid[])
from public.dictamen_asesores a join auth.users u
 on lower(btrim(a.correo))=lower(btrim(u.email))
where u.id=(select auth.uid()) and u.email_confirmed_at is not null $fn$;
create or replace function private.dictamen_puede_ver(p_asesor uuid) returns boolean
language sql stable security definer set search_path=''
as $fn$ select (select auth.uid()) is not null and (
 private.dictamen_ver_todos() or p_asesor=any(private.dictamen_asesores_propios())
) $fn$;
revoke all on function private.dictamen_ver_todos() from public,anon;
revoke all on function private.dictamen_asesores_propios() from public,anon;
revoke all on function private.dictamen_puede_ver(uuid) from public,anon;
grant execute on function private.dictamen_ver_todos(),private.dictamen_asesores_propios(),private.dictamen_puede_ver(uuid) to authenticated,service_role;

drop policy if exists select_liderazgo on public.dictamenes;
drop policy if exists select_propios_o_liderazgo on public.dictamenes;
create policy select_dictamenes_autorizados on public.dictamenes for select to authenticated
using ((select private.dictamen_ver_todos()) or asesor_id in (select unnest(private.dictamen_asesores_propios())));

alter policy select_liderazgo on public.dictamen_asesores
using ((select private.dictamen_ver_todos()) or id in (select unnest(private.dictamen_asesores_propios())));
alter policy select_liderazgo on public.dictamen_tipos_inmueble
using ((select auth.uid()) is not null);

alter policy select_por_dictamen on public.dictamen_puntos using (exists(select 1 from public.dictamenes d where d.id=dictamen_puntos.dictamen_id));

alter policy select_por_dictamen on public.dictamen_clientes using (exists(select 1 from public.dictamenes d where d.id=dictamen_clientes.dictamen_id));

alter policy select_liderazgo on public.dictamen_historial using (exists(select 1 from public.dictamenes d where d.id=dictamen_historial.dictamen_id));

alter policy select_liderazgo on public.dictamen_revisiones using (exists(select 1 from public.dictamenes d where d.id=dictamen_revisiones.dictamen_id));

-- Los nombres de los autores solo se consultan desde las vistas del modulo,
-- y unicamente cuando pertenecen a un expediente visible para la cuenta.
alter policy select_staff_via_dictamenes_con_asesor on public.profiles using (
 position('dictamenes_con_asesor' in coalesce((select current_setting('request.path',true)),''))>0
 and exists(select 1 from public.dictamenes d where d.dictaminado_por=profiles.id)
);
alter policy select_staff_via_dictamen_historial on public.profiles using (
 position('dictamen_historial_con_quien' in coalesce((select current_setting('request.path',true)),''))>0
 and exists(select 1 from public.dictamen_historial h where h.quien=profiles.id)
);

create or replace view public.dictamen_historial_con_quien with(security_invoker=true,security_barrier=true) as
 SELECT h.id,
    h.dictamen_id,
    h.que,
    h.detalle,
    h.created_at,
    TRIM(BOTH FROM (COALESCE(p.nombre, ''::text) || ' '::text) || COALESCE(p.apellido, ''::text)) AS quien_nombre
   FROM dictamen_historial h
     LEFT JOIN profiles p ON p.id = h.quien;
revoke all on public.dictamen_historial_con_quien from anon;
grant select on public.dictamen_historial_con_quien to authenticated;

create or replace view public.dictamenes_con_asesor with(security_invoker=true,security_barrier=true) as
 SELECT d.id,
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
    a.nombre AS asesor_nombre,
    a.correo AS asesor_correo,
    t.nombre AS tipo_inmueble,
    q.nombre AS dictaminador_nombre,
    q.apellido AS dictaminador_apellido,
    COALESCE(c.total, 0::bigint) AS puntos_total,
    COALESCE(c.pendientes, 0::bigint) AS puntos_pendientes,
    COALESCE(c.corregidas, 0::bigint) AS puntos_corregidas,
    COALESCE(cl.total, 0::bigint) AS clientes_total,
    COALESCE(cl.nombres, d.cliente) AS clientes_nombres,
    d.marketing_checklist,
    d.marketing_comentario_general,
    d.escritura_condominio_fecha,
    d.cfdi_necesario,
    d.cfdi_tiene,
    d.condominio_notario_nombre,
    d.condominio_notaria_numero,
    d.condominio_folio_real
   FROM dictamenes d
     LEFT JOIN dictamen_asesores a ON a.id = d.asesor_id
     LEFT JOIN dictamen_tipos_inmueble t ON t.id = d.tipo_inmueble_id
     LEFT JOIN profiles q ON q.id = d.dictaminado_por
     LEFT JOIN LATERAL ( SELECT count(*) AS total,
            count(*) FILTER (WHERE pt.estado = 'pendiente'::text) AS pendientes,
            count(*) FILTER (WHERE pt.estado = 'corregida'::text) AS corregidas
           FROM dictamen_puntos pt
          WHERE pt.dictamen_id = d.id) c ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS total,
            string_agg(cx.nombre, ', '::text ORDER BY cx.orden) AS nombres
           FROM dictamen_clientes cx
          WHERE cx.dictamen_id = d.id) cl ON true;
revoke all on public.dictamenes_con_asesor from anon;
grant select on public.dictamenes_con_asesor to authenticated;

CREATE OR REPLACE FUNCTION public.listar_dictamenes_para_enlazar(p_documento_id uuid)
 RETURNS TABLE(id uuid, folio text, inmueble text, cliente text, asesor_nombre text, fecha_dictamen date, estado text, enlazado boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_doc public.documentos_guardados%rowtype;
  v_correo text;
  v_rol text;
  v_liderazgo boolean;
begin
  if not public.mfa_sesion_autorizada() then raise exception 'Sesion no autorizada'; end if;
  select * into v_doc from public.documentos_guardados where documentos_guardados.id = p_documento_id;
  if not found then raise exception 'Documento no encontrado'; end if;

  select p.email, p.role into v_correo, v_rol
  from public.profiles p where p.id = auth.uid();
  v_liderazgo := v_rol in ('master', 'admin', 'staff');

  if v_doc.user_id <> auth.uid() and not v_liderazgo then
    raise exception 'No tienes permiso para enlazar este documento';
  end if;
  if v_doc.estado <> 'finalizado' then
    raise exception 'Solo se enlazan documentos finalizados';
  end if;

  return query
  select d.id, d.folio, d.inmueble, d.cliente, a.nombre,
         d.fecha_dictamen, d.estado, d.id = v_doc.dictamen_id
  from public.dictamenes d
  join public.dictamen_asesores a on a.id = d.asesor_id
  where d.archivado_at is null
    and private.dictamen_puede_ver(d.asesor_id)
  order by (d.id = v_doc.dictamen_id) desc, d.created_at desc;
end;
$function$;
