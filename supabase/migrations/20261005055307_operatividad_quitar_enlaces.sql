create or replace function public.operatividad_desenlazar(p_id uuid,p_tipo text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.operatividad; bandera text:=coalesce(current_setting('kw.operatividad_sync',true),'');
begin
  if not coalesce(private.is_staff_or_above(),false) or not coalesce(public.mfa_sesion_autorizada(),false) then raise exception 'Sin permiso'; end if;
  if p_tipo is null or p_tipo not in ('contrato','dictamen','propiedad') then raise exception 'Tipo de enlace no valido'; end if;
  perform pg_advisory_xact_lock(hashtextextended('operatividad_enlazar',0));
  select * into o from public.operatividad where id=p_id for update;
  if not found then raise exception 'Captacion no encontrada'; end if;
  perform set_config('kw.operatividad_sync','si',true);
  if p_tipo in ('contrato','dictamen') and o.documento_id is not null and o.dictamen_id is not null then
    update public.documentos_guardados set dictamen_id=null where id=o.documento_id and dictamen_id=o.dictamen_id;
  end if;
  if p_tipo='contrato' then
    update public.operatividad set documento_id=null,documento_tipo=null,
      campos_manuales=array(select distinct x from unnest(campos_manuales || array['documento_id']) x) where id=p_id;
  elsif p_tipo='dictamen' then
    update public.operatividad set dictamen_id=null,
      campos_manuales=array(select distinct x from unnest(campos_manuales || array['dictamen_id']) x) where id=p_id;
  else
    update public.operatividad set propiedad_id=null where id=p_id;
  end if;
  perform set_config('kw.operatividad_sync',bandera,true);
end;
$$;
revoke all on function public.operatividad_desenlazar(uuid,text) from public,anon;
grant execute on function public.operatividad_desenlazar(uuid,text) to authenticated;
