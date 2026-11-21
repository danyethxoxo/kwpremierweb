begin;
do $test$
declare uid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); ip text:='qa-'||gen_random_uuid()::text; outcome jsonb;
begin
 insert into auth.users(id,email,raw_app_meta_data) values(uid,'qa-'||uid||'@pruebas.kweb.invalid','{"confort4_editor_only":true}');
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,uid,now(),now());
 outcome:=public.security_gateway_autorizar_red(uid,sid,ip,300,true);
 if outcome->>'estado'<>'ok' then raise exception 'Fallo red autorizada'; end if;
 if not exists(select 1 from private.security_rate_limits where scope='ip:authenticated:data-gateway' and hits=1
 and subject_hash=(select encode(extensions.hmac(ip,gateway_secret,'sha256'),'hex') from private.security_config where id)) then raise exception 'No aplico contador IP';end if;
 update private.security_rate_limits set hits=6000 where scope='ip:authenticated:data-gateway' and subject_hash=(select encode(extensions.hmac(ip,gateway_secret,'sha256'),'hex') from private.security_config where id);
 outcome:=public.security_gateway_autorizar_red(uid,sid,ip,300,true);
 if outcome->>'estado'<>'limite' or (outcome->>'retry_after')::integer<1 then raise exception 'Fallo limite de red';end if;
 if public.security_gateway_autorizar_red(uid,gen_random_uuid(),ip,300,true)->>'estado'<>'revocada' then raise exception 'Fallo sesion';end if;
 if has_function_privilege('anon','public.security_gateway_autorizar_red(uuid,uuid,text,integer,boolean)','execute')
 or has_function_privilege('authenticated','public.security_gateway_autorizar_red(uuid,uuid,text,integer,boolean)','execute') then raise exception 'Permisos indebidos';end if;
end $test$;
rollback;
