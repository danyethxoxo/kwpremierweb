-- Fase 13b: ajusta el nombre que recibe la copia de un documento.
-- Si el original ya tenía folio (era un finalizado), el nombre queda
-- "(Copia) Folio: <folio> <nombre>". Si era un borrador (sin folio),
-- queda solo "(Copia) <nombre>", sin la parte del folio.
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
  v_folio text;
  v_owner uuid;
  v_nuevo_id uuid;
  v_nombre_nuevo text;
begin
  select tipo_documento, datos, nombre_archivo, folio, user_id
  into v_tipo, v_datos, v_nombre, v_folio, v_owner
  from public.documentos_guardados
  where id = p_id;

  if v_owner is null then
    raise exception 'Documento no encontrado';
  end if;

  if auth.uid() <> v_owner and not public.is_staff_or_above() then
    raise exception 'No tienes permiso para copiar este documento';
  end if;

  if v_folio is not null then
    v_nombre_nuevo := '(Copia) Folio: ' || v_folio || ' ' || coalesce(v_nombre, 'Documento');
  else
    v_nombre_nuevo := '(Copia) ' || coalesce(v_nombre, 'Documento');
  end if;

  insert into public.documentos_guardados (user_id, tipo_documento, nombre_archivo, datos)
  values (v_owner, v_tipo, v_nombre_nuevo, v_datos)
  returning id into v_nuevo_id;

  return v_nuevo_id;
end;
$$;

grant execute on function public.duplicar_documento_como_borrador(uuid) to authenticated;
