-- Permite reutilizar un contrato finalizado como origen de varios dictámenes.
-- El primer vínculo guardado en documentos_guardados.dictamen_id se conserva:
-- los usos posteriores sirven para precargar el nuevo expediente y quedan
-- registrados en su historial, sin alterar el contrato ni su operatividad.

create or replace function public.listar_contratos_para_nuevo_dictamen()
returns table (
  documento_id uuid,
  creador_id uuid,
  dictamen_asesor_id uuid,
  asesor_nombre text,
  asesor_correo text,
  tipo_documento text,
  nombre_archivo text,
  folio text,
  revision integer,
  updated_at timestamptz,
  datos jsonb
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.puede_dictaminar() then
    raise exception 'No tienes permiso para consultar contratos para dictamen.';
  end if;

  return query
  select
    d.id,
    d.user_id,
    a.id,
    coalesce(
      nullif(trim(a.nombre), ''),
      nullif(trim(concat_ws(' ', p.nombre, p.apellido)), ''),
      p.email,
      'Asesor sin nombre'
    ),
    coalesce(a.correo, p.email),
    d.tipo_documento,
    d.nombre_archivo,
    d.folio,
    coalesce(d.revision, 0),
    d.updated_at,
    d.datos
  from public.documentos_guardados d
  join public.profiles p on p.id = d.user_id
  left join public.dictamen_asesores a
    on lower(coalesce(a.correo, '')) = lower(coalesce(p.email, ''))
  where d.estado = 'finalizado'
    and d.tipo_documento in (
      'acuerdo_renta',
      'contrato_profeco',
      'contrato_comercial'
    )
  order by
    coalesce(nullif(trim(a.nombre), ''), nullif(trim(concat_ws(' ', p.nombre, p.apellido)), ''), p.email),
    d.tipo_documento,
    d.updated_at desc;
end;
$$;

revoke all on function public.listar_contratos_para_nuevo_dictamen() from public;
grant execute on function public.listar_contratos_para_nuevo_dictamen() to authenticated;

create or replace function public.enlazar_contrato_a_nuevo_dictamen(
  p_documento_id uuid,
  p_dictamen_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documentos_guardados%rowtype;
begin
  if not public.puede_dictaminar() then
    raise exception 'No tienes permiso para enlazar contratos con dictámenes.';
  end if;

  select * into v_doc
  from public.documentos_guardados
  where id = p_documento_id
  for update;

  if not found then raise exception 'Contrato no encontrado.'; end if;
  if v_doc.estado <> 'finalizado' then
    raise exception 'Solo se pueden enlazar contratos finalizados.';
  end if;
  if v_doc.tipo_documento not in ('acuerdo_renta', 'contrato_profeco', 'contrato_comercial') then
    raise exception 'El documento seleccionado no es un contrato compatible.';
  end if;
  if not exists (
    select 1 from public.dictamenes d
    where d.id = p_dictamen_id and d.archivado_at is null
  ) then
    raise exception 'El dictamen no existe o está archivado.';
  end if;

  -- El campo heredado solo admite un dictamen. Se asigna la primera vez y
  -- nunca se reemplaza, para no desaparecer el contrato del expediente
  -- original cuando vuelva a usarse como fuente de datos.
  if v_doc.dictamen_id is null then
    update public.documentos_guardados
       set dictamen_id = p_dictamen_id
     where id = p_documento_id;

    update public.operatividad o
       set dictamen_id = p_dictamen_id,
           campos_manuales = case
             when 'dictamen_id' = any(o.campos_manuales) then o.campos_manuales
             else array_append(o.campos_manuales, 'dictamen_id')
           end,
           fecha_dictamen = case
             when 'fecha_dictamen' = any(o.campos_manuales) then o.fecha_dictamen
             else (select d.fecha_dictamen from public.dictamenes d where d.id = p_dictamen_id)
           end,
           estatus_dictamen = case
             when 'estatus_dictamen' = any(o.campos_manuales) then o.estatus_dictamen
             else (select public.operatividad_estatus_dictamen(d.estado)
                   from public.dictamenes d where d.id = p_dictamen_id)
           end,
           sincronizado_at = now()
     where o.documento_id = p_documento_id;
  end if;

  perform public.dictamen_anotar(
    p_dictamen_id,
    'contrato_enlazado',
    'Contrato ' || coalesce(v_doc.folio, v_doc.nombre_archivo, 'sin folio') ||
      ' usado para precargar el expediente'
  );
end;
$$;

revoke all on function public.enlazar_contrato_a_nuevo_dictamen(uuid, uuid) from public;
grant execute on function public.enlazar_contrato_a_nuevo_dictamen(uuid, uuid) to authenticated;
