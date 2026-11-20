-- Solo el servidor puede agrupar estas verificaciones; no conserva permisos en cache.
create or replace function public.security_gateway_autorizar(
 p_usuario uuid, p_sesion uuid, p_limite integer default 300, p_mfa boolean default true
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare limite jsonb; aprobado boolean;
begin
 if p_usuario is null or p_sesion is null or p_limite is null or p_limite not between 1 and 10000 or p_mfa is null then
  raise exception 'Invalid authorization parameters';
 end if;
 if not public.security_sesion_vigente(p_usuario,p_sesion) then
  return pg_catalog.jsonb_build_object('estado','revocada');
 end if;
 limite:=public.security_consume_rates(pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object('scope','user:all','subject',p_usuario::text,'limit',600),
  pg_catalog.jsonb_build_object('scope','user:data-gateway','subject',p_usuario::text,'limit',p_limite)
 ));
 if not (limite->>'allowed')::boolean then
  return pg_catalog.jsonb_build_object('estado','limite','retry_after',limite->'retry_after');
 end if;
 if p_mfa then
  -- Misma politica de mfa_sesion_autorizada, con identidad y sesion explicitas.
  select case when exists(select 1 from public.mfa_metodos m where m.user_id=p_usuario)
   then exists(select 1 from public.mfa_metodos m join public.mfa_sesiones s on s.user_id=m.user_id
    where m.user_id=p_usuario and m.activo and s.session_id=p_sesion and s.verificado_hasta>now())
   when exists(select 1 from public.profiles p where p.id=p_usuario and p.role in ('master','admin')) then false
   else true end into aprobado;
  if not aprobado then return pg_catalog.jsonb_build_object('estado','mfa'); end if;
 end if;
 return pg_catalog.jsonb_build_object('estado','ok');
end $function$;
revoke all on function public.security_gateway_autorizar(uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.security_gateway_autorizar(uuid,uuid,integer,boolean) to service_role;
