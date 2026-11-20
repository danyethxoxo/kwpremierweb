begin;
do $test$
declare uid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); outcome jsonb;
begin
 insert into auth.users(id,email,raw_app_meta_data) values(uid,'qa-'||uid||'@pruebas.kweb.invalid','{"confort4_editor_only":true}');
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,uid,now(),now());
 outcome:=public.security_gateway_autorizar(uid,sid,300,true);
 if outcome->>'estado'<>'ok' then raise exception 'Fallo sesion activa'; end if;
 if public.security_gateway_autorizar(uid,gen_random_uuid(),300,true)->>'estado'<>'revocada' then raise exception 'Fallo revocacion'; end if;
 if public.security_gateway_autorizar(gen_random_uuid(),sid,300,true)->>'estado'<>'revocada' then raise exception 'Fallo pertenencia'; end if;
 insert into public.mfa_metodos(user_id,activo) values(uid,false);
 if public.security_gateway_autorizar(uid,sid,300,true)->>'estado'<>'mfa' then raise exception 'Fallo MFA pendiente'; end if;
 update public.mfa_metodos set activo=true where user_id=uid;
 insert into public.mfa_sesiones(session_id,user_id,verificado_hasta) values(sid,uid,now()+interval '1 hour');
 if public.security_gateway_autorizar(uid,sid,300,true)->>'estado'<>'ok' then raise exception 'Fallo MFA valido'; end if;
 update public.mfa_sesiones set verificado_hasta=now()-interval '1 hour' where session_id=sid;
 if public.security_gateway_autorizar(uid,sid,300,true)->>'estado'<>'mfa' then raise exception 'Fallo MFA vencido'; end if;
 update auth.users set banned_until=now()+interval '1 day' where id=uid;
 if public.security_gateway_autorizar(uid,sid,300,true)->>'estado'<>'revocada' then raise exception 'Fallo bloqueo'; end if;
 update auth.users set banned_until=null where id=uid;
 if public.security_gateway_autorizar(uid,sid,1,false)->>'estado'<>'limite' then raise exception 'Fallo limite persistido'; end if;
end $test$;
rollback;
