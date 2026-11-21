-- Evitar que una oficina completa comparta el limite de un visitante anonimo.
-- Solo service_role puede invocar este control, despues de verificar la firma JWT.
create or replace function public.security_gateway_autorizar_red(
 p_usuario uuid, p_sesion uuid, p_ip text, p_limite integer default 300, p_mfa boolean default true
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare autorizacion jsonb; red jsonb;
begin
 if p_ip is null or length(p_ip) not between 1 and 200 then raise exception 'Invalid network'; end if;
 autorizacion:=public.security_gateway_autorizar(p_usuario,p_sesion,p_limite,p_mfa);
 if autorizacion->>'estado'<>'ok' then return autorizacion; end if;
 red:=public.security_consume_rates(pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object('scope','ip:authenticated:all','subject',p_ip,'limit',12000),
  pg_catalog.jsonb_build_object('scope','ip:authenticated:data-gateway','subject',p_ip,'limit',6000)
 ));
 if not (red->>'allowed')::boolean then
  return pg_catalog.jsonb_build_object('estado','limite','retry_after',red->'retry_after');
 end if;
 return autorizacion;
end $function$;
revoke all on function public.security_gateway_autorizar_red(uuid,uuid,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.security_gateway_autorizar_red(uuid,uuid,text,integer,boolean) to service_role;
