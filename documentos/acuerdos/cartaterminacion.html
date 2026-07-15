-- Fase 13: duplicar un documento finalizado como borrador nuevo (para
-- cuando un contrato se manda a firmar y regresa con correcciones: en
-- vez de editar el finalizado -inmutable-, se saca una copia editable
-- con un folio nuevo cuando se vuelva a finalizar).
--
-- La copia SIEMPRE queda a nombre del dueño original del documento
-- (no de quien la genera), para que le siga apareciendo en "Mis
-- documentos" al asesor, sin importar si fue él mismo o alguien de
-- Staff/Admin/Master quien la generó desde el panel.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

create or replace function public.duplicar_documento_como_borrador(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
  v_datos jsonb;
  v_nombre text;
  v_owner uuid;
  v_nuevo_id uuid;
begin
  select tipo_documento, datos, nombre_archivo, user_id
  into v_tipo, v_datos, v_nombre, v_owner
  from public.documentos_guardados
  where id = p_id;

  if v_owner is null then
    raise exception 'Documento no encontrado';
  end if;

  if auth.uid() <> v_owner and not public.is_staff_or_above() then
    raise exception 'No tienes permiso para copiar este documento';
  end if;

  insert into public.documentos_guardados (user_id, tipo_documento, nombre_archivo, datos)
  values (v_owner, v_tipo, coalesce(v_nombre, 'Documento') || ' (copia)', v_datos)
  returning id into v_nuevo_id;

  return v_nuevo_id;
end;
$$;

grant execute on function public.duplicar_documento_como_borrador(uuid) to authenticated;
