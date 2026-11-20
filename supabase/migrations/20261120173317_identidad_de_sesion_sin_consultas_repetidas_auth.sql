create or replace function public.security_identidad_sesion(p_usuario uuid,p_sesion uuid) returns jsonb language sql stable security definer set search_path='' as $function$
select pg_catalog.jsonb_build_object('id',u.id,'aud',u.aud,'email',u.email,'phone',u.phone,'created_at',u.created_at,'updated_at',u.updated_at,'last_sign_in_at',u.last_sign_in_at,'email_confirmed_at',u.email_confirmed_at,'phone_confirmed_at',u.phone_confirmed_at,'app_metadata',u.raw_app_meta_data,'user_metadata',u.raw_user_meta_data,'is_anonymous',u.is_anonymous)
from auth.sessions s join auth.users u on u.id=s.user_id
where s.id=p_sesion and s.user_id=p_usuario and (s.not_after is null or s.not_after>now()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
$function$;
revoke all on function public.security_identidad_sesion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.security_identidad_sesion(uuid,uuid) to service_role;
