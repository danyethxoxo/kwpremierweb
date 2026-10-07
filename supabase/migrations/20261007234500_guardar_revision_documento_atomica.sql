-- Guardar una revision es una sola transaccion y nunca modifica el original.
create or replace function private.guardar_revision_documento(p_id uuid,p_datos jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare original public.documentos_guardados%rowtype; numero integer; nuevo uuid;
begin
  if auth.uid() is null or public.mfa_sesion_autorizada() is not true then raise exception 'Sesion no autorizada'; end if;
  select * into original from public.documentos_guardados where id=p_id for update;
  if not found then raise exception 'Documento no encontrado'; end if;
  if original.user_id <> auth.uid() and private.is_staff_or_above() is not true then raise exception 'No tienes permiso para editar este documento'; end if;
  if original.estado <> 'finalizado' or original.folio is null then raise exception 'Solo se revisan documentos finalizados'; end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then raise exception 'Datos invalidos'; end if;
  perform pg_advisory_xact_lock(hashtextextended(original.tipo_documento || ':' || original.folio,0));
  select coalesce(max(revision),0)+1 into numero from public.documentos_guardados
    where tipo_documento=original.tipo_documento and folio=original.folio;
  insert into public.documentos_guardados(user_id,tipo_documento,nombre_archivo,datos,folio,estado,revision)
    values(original.user_id,original.tipo_documento,original.nombre_archivo || ' · Revisión ' || numero,p_datos,original.folio,'borrador',numero)
    returning id into nuevo;
  return jsonb_build_object('id',nuevo,'revision',numero);
end; $$;
revoke all on function private.guardar_revision_documento(uuid,jsonb) from public,anon;
grant execute on function private.guardar_revision_documento(uuid,jsonb) to authenticated;
create or replace function public.guardar_revision_documento(p_id uuid,p_datos jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
  select private.guardar_revision_documento(p_id,p_datos);
$$;
revoke all on function public.guardar_revision_documento(uuid,jsonb) from public,anon;
grant execute on function public.guardar_revision_documento(uuid,jsonb) to authenticated;
