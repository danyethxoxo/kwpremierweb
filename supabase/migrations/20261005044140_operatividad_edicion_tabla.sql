alter table public.operatividad add column if not exists archivado_at timestamptz;

create or replace function public.operatividad_opciones_enlace(p_tipo text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not coalesce(private.is_staff_or_above(),false) or not coalesce(public.mfa_sesion_autorizada(),false) then raise exception 'Sin permiso'; end if;
  if p_tipo='contrato' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',id,'nombre',concat_ws(' · ',folio,nombre_archivo,tipo_documento)) order by updated_at desc) from public.documentos_guardados where tipo_documento in ('acuerdo_renta','contrato_profeco','contrato_comercial') and not exists(select 1 from private.operatividad_pruebas_retiradas b where b.datos->>'documento_id'=documentos_guardados.id::text)),'[]'::jsonb);
  elsif p_tipo='dictamen' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',id,'nombre',concat_ws(' · ',folio,inmueble,estado)) order by created_at desc) from public.dictamenes where archivado_at is null and estado in ('devuelta','condicionada','autorizada')),'[]'::jsonb);
  elsif p_tipo='propiedad' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',id,'nombre',concat_ws(' · ',titulo,asesor_nombre,municipio)) order by titulo) from public.propiedades where market_center ilike '%premier%'),'[]'::jsonb);
  end if;
  raise exception 'Tipo de enlace inválido';
end;
$$;
revoke all on function public.operatividad_opciones_enlace(text) from public,anon;
grant execute on function public.operatividad_opciones_enlace(text) to authenticated;

create or replace function public.operatividad_enlazar(p_id uuid,p_tipo text,p_origen uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.operatividad; otra public.operatividad; doc public.documentos_guardados; d public.dictamenes; campo text; datos jsonb; v_dictamen uuid;
begin
  if not coalesce(private.is_staff_or_above(),false) or not coalesce(public.mfa_sesion_autorizada(),false) then raise exception 'Sin permiso'; end if;
  if p_tipo not in ('contrato','dictamen','propiedad') or p_origen is null then raise exception 'Enlace inválido'; end if;
  perform pg_advisory_xact_lock(hashtextextended('operatividad_enlazar',0));
  select * into o from public.operatividad where id=p_id for update;
  if not found then raise exception 'Captación no encontrada'; end if;
  if p_tipo='propiedad' then
    if not exists(select 1 from public.propiedades where id=p_origen and market_center ilike '%premier%') then raise exception 'Propiedad no disponible en KW Premier'; end if;
    update public.operatividad set propiedad_id=p_origen where id=p_id; return;
  end if;
  if p_tipo='contrato' then
    select * into doc from public.documentos_guardados where id=p_origen and tipo_documento in ('acuerdo_renta','contrato_profeco','contrato_comercial');
    if not found or exists(select 1 from private.operatividad_pruebas_retiradas b where b.datos->>'documento_id'=p_origen::text) then raise exception 'Contrato no disponible'; end if;
    if o.dictamen_id is not null and doc.dictamen_id is not null and o.dictamen_id<>doc.dictamen_id then raise exception 'Este contrato está enlazado a otro dictamen'; end if;
    select * into otra from public.operatividad where documento_id=p_origen and id<>p_id for update;
    v_dictamen:=coalesce(o.dictamen_id,doc.dictamen_id,otra.dictamen_id);
  else
    select * into d from public.dictamenes where id=p_origen and archivado_at is null and estado in ('devuelta','condicionada','autorizada');
    if not found then raise exception 'Dictamen no disponible'; end if;
    if o.documento_id is not null and exists(select 1 from public.documentos_guardados where id=o.documento_id and dictamen_id is not null and dictamen_id<>p_origen) then raise exception 'El contrato está enlazado a otro dictamen'; end if;
    select * into otra from public.operatividad where dictamen_id=p_origen and id<>p_id for update;
    v_dictamen:=p_origen;
  end if;
  if otra.id is not null then
    if o.documento_id is not null and otra.documento_id is not null and o.documento_id<>otra.documento_id and p_tipo='dictamen' then raise exception 'El dictamen ya tiene otro contrato'; end if;
    if o.dictamen_id is not null and otra.dictamen_id is not null and o.dictamen_id<>otra.dictamen_id and p_tipo='contrato' then raise exception 'El contrato pertenece a otra captación'; end if;
    datos:=to_jsonb(o);
    foreach campo in array otra.campos_manuales loop
      if campo not in ('dictamen_id','documento_id') and not(campo=any(o.campos_manuales)) then datos:=jsonb_set(datos,array[campo],to_jsonb(otra)->campo);o.campos_manuales:=array_append(o.campos_manuales,campo);end if;
    end loop;
    o:=jsonb_populate_record(o,datos || jsonb_build_object('campos_manuales',o.campos_manuales));
    o.propiedad_id:=coalesce(o.propiedad_id,otra.propiedad_id);
    o.firma:=coalesce(o.firma,otra.firma);
    o.estatus_command:=coalesce(o.estatus_command,otra.estatus_command);
    o.documento_id:=case when p_tipo='dictamen' then coalesce(o.documento_id,otra.documento_id) else o.documento_id end;
    delete from public.operatividad where id=otra.id;
  end if;
  perform set_config('kw.operatividad_sync','si',true);
  if p_tipo='contrato' and o.documento_id is not null and o.documento_id<>p_origen then
    update public.documentos_guardados set dictamen_id=null where id=o.documento_id and dictamen_id=o.dictamen_id;
  end if;
  update public.operatividad set documento_id=case when p_tipo='contrato' then p_origen else o.documento_id end,
    documento_tipo=case when p_tipo='contrato' then doc.tipo_documento else coalesce(o.documento_tipo,otra.documento_tipo) end,
    dictamen_id=v_dictamen,propiedad_id=o.propiedad_id,campos_manuales=array_remove(o.campos_manuales,'dictamen_id'),
    asociado_nombre=o.asociado_nombre,folio=o.folio,fecha_dictamen=o.fecha_dictamen,estatus_dictamen=o.estatus_dictamen,
    mes_recibo=o.mes_recibo,fecha_contrato=o.fecha_contrato,tipo=o.tipo,exclusividad=o.exclusividad,division=o.division,
    precio=o.precio,porcentaje=o.porcentaje,direccion=o.direccion,colonia=o.colonia,alcaldia=o.alcaldia,entidad=o.entidad,
    codigo_postal=o.codigo_postal,cliente_nombre=o.cliente_nombre,numero_propietario=o.numero_propietario,
    firma=o.firma,estatus_command=o.estatus_command where id=p_id;
  if p_tipo='contrato' and doc.dictamen_id is distinct from v_dictamen then update public.documentos_guardados set dictamen_id=v_dictamen where id=doc.id; end if;
  if p_tipo='dictamen' and o.documento_id is not null then update public.documentos_guardados set dictamen_id=v_dictamen where id=o.documento_id; end if;
  if v_dictamen is not null then perform public.operatividad_sincronizar_dictamen(v_dictamen); end if;
  if doc.id is not null then perform public.operatividad_sincronizar_documento(doc);end if;
end;
$$;
revoke all on function public.operatividad_enlazar(uuid,text,uuid) from public,anon;
grant execute on function public.operatividad_enlazar(uuid,text,uuid) to authenticated;
