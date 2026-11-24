-- Sincronizacion incremental de correo de leads con deduplicacion por mensaje.
alter table private.prospectos_gmail_conexiones
 add column if not exists history_id text check(history_id is null or history_id ~ '^[0-9]{1,40}$');

-- Reglas iniciales tomadas de los formatos de OmniMLS, JamesEdition e Inmuebles24.
-- Conserva cualquier regla que el usuario ya haya configurado.
insert into public.prospectos_reglas(user_id,remitentes,asuntos)
select p.user_id,
 array['omnimls.com','jamesedition.com','inmuebles24.com']::text[],
 array['Nuevo lead asignado','New Lead','Vieron tu teléfono']::text[]
from private.prospectos_piloto p
where p.activo
on conflict(user_id) do nothing;

-- Solo la Edge Function con service_role puede leer reglas e insertar registros.
-- La funcion vuelve a comprobar el usuario, el piloto y su sesion vigente.
create or replace function public.prospectos_gmail_import_backend(
 p_accion text,p_usuario uuid,p_sesion uuid,p_datos jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $f$
declare
 v_history text;
 v_count integer := 0;
 v_rows jsonb;
begin
 if not exists(select 1 from private.prospectos_piloto p where p.user_id=p_usuario and p.activo)
  or not public.security_sesion_vigente(p_usuario,p_sesion)
 then raise exception using errcode='42501',message='No autorizado'; end if;

 if p_accion='reglas' then
  return coalesce((select jsonb_build_object('remitentes',r.remitentes,'asuntos',r.asuntos)
   from public.prospectos_reglas r where r.user_id=p_usuario),
   jsonb_build_object('remitentes','[]'::jsonb,'asuntos','[]'::jsonb));
 elsif p_accion='checkpoint' then
  v_history := p_datos->>'history_id';
  if coalesce(v_history,'') !~ '^[0-9]{1,40}$' then
   raise exception using errcode='22023',message='Historial inválido';
  end if;
  update private.prospectos_gmail_conexiones set history_id=v_history,comprobada_at=now()
   where user_id=p_usuario;
  if not found then raise exception using errcode='22023',message='Gmail no está vinculado'; end if;
  return jsonb_build_object('history_id',v_history);
 elsif p_accion='importar' then
  v_history := p_datos->>'history_id';
  v_rows := p_datos->'registros';
  if coalesce(v_history,'') !~ '^[0-9]{1,40}$'
   or coalesce(jsonb_typeof(v_rows),'')<>'array' or jsonb_array_length(v_rows)>500 then
   raise exception using errcode='22023',message='Importación inválida';
  end if;

  insert into public.prospectos_bandeja(
   user_id,nombre,correo,telefono,interes,inmueble_url,origen,notas,gmail_message_id,created_at,updated_at
  )
  select p_usuario,
   coalesce(nullif(left(btrim(r.nombre),160),''),'Prospecto sin nombre'),
   left(coalesce(r.correo,''),254),left(coalesce(r.telefono,''),50),left(coalesce(r.interes,''),1000),
   case when coalesce(r.inmueble_url,'') ~ '^https://' then left(r.inmueble_url,2048) else '' end,
   coalesce(nullif(left(btrim(r.origen),80),''),'Otro portal'),left(coalesce(r.notas,''),4000),
   left(btrim(r.gmail_message_id),256),coalesce(r.created_at,now()),now()
  from jsonb_to_recordset(v_rows) as r(
   gmail_message_id text,nombre text,correo text,telefono text,interes text,inmueble_url text,origen text,notas text,created_at timestamptz
  )
  where coalesce(btrim(r.gmail_message_id),'')<>'' and (coalesce(r.correo,'')<>'' or coalesce(r.telefono,'')<>'')
  on conflict(user_id,gmail_message_id) do nothing;
  get diagnostics v_count = row_count;

  update private.prospectos_gmail_conexiones set history_id=v_history,comprobada_at=now()
   where user_id=p_usuario;
  if not found then raise exception using errcode='22023',message='Gmail no está vinculado'; end if;
  return jsonb_build_object('importados',v_count,'history_id',v_history,'ultima_revision_at',now());
 else
  raise exception using errcode='22023',message='Acción inválida';
 end if;
end $f$;

revoke all on function public.prospectos_gmail_import_backend(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.prospectos_gmail_import_backend(text,uuid,uuid,jsonb) to service_role;

-- El trabajador de fondo solo ve cuentas activas del piloto con Gmail vinculado.
-- La respuesta contiene credenciales cifradas y solo esta disponible para service_role.
create or replace function public.prospectos_gmail_sync_accounts()
returns jsonb language sql security invoker set search_path=''
as $f$
 select coalesce(jsonb_agg(jsonb_build_object(
  'user_id',c.user_id,'config',jsonb_build_object('client_id',g.client_id,'secreto',g.secreto),
  'conexion',jsonb_build_object('credenciales',c.credenciales,'history_id',c.history_id,'scopes',c.scopes),
  'rules',jsonb_build_object('remitentes',coalesce(r.remitentes,array[]::text[]),'asuntos',coalesce(r.asuntos,array[]::text[]))
 ) order by c.vinculada_at),'[]'::jsonb)
 from private.prospectos_gmail_conexiones c
 join private.prospectos_piloto p on p.user_id=c.user_id and p.activo
 join private.prospectos_gmail_config g on g.user_id=c.user_id
 left join public.prospectos_reglas r on r.user_id=c.user_id
 where c.scopes like '%https://www.googleapis.com/auth/gmail.readonly%'
$f$;
revoke all on function public.prospectos_gmail_sync_accounts() from public,anon,authenticated;
grant execute on function public.prospectos_gmail_sync_accounts() to service_role;

create or replace function public.prospectos_gmail_import_job(p_usuario uuid,p_datos jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $f$
declare v_history text; v_rows jsonb; v_count integer := 0;
begin
 if not exists(select 1 from private.prospectos_piloto p where p.user_id=p_usuario and p.activo)
  or not exists(select 1 from private.prospectos_gmail_conexiones c where c.user_id=p_usuario and c.scopes like '%https://www.googleapis.com/auth/gmail.readonly%')
 then raise exception using errcode='42501',message='No autorizado'; end if;
 v_history := p_datos->>'history_id'; v_rows := p_datos->'registros';
 if coalesce(v_history,'') !~ '^[0-9]{1,40}$'
  or coalesce(jsonb_typeof(v_rows),'')<>'array' or jsonb_array_length(v_rows)>500 then
  raise exception using errcode='22023',message='Importación inválida';
 end if;
 insert into public.prospectos_bandeja(
  user_id,nombre,correo,telefono,interes,inmueble_url,origen,notas,gmail_message_id,created_at,updated_at
 )
 select p_usuario,
  coalesce(nullif(left(btrim(r.nombre),160),''),'Prospecto sin nombre'),
  left(coalesce(r.correo,''),254),left(coalesce(r.telefono,''),50),left(coalesce(r.interes,''),1000),
  case when coalesce(r.inmueble_url,'') ~ '^https://' then left(r.inmueble_url,2048) else '' end,
  coalesce(nullif(left(btrim(r.origen),80),''),'Otro portal'),left(coalesce(r.notas,''),4000),
  left(btrim(r.gmail_message_id),256),coalesce(r.created_at,now()),now()
 from jsonb_to_recordset(v_rows) as r(
  gmail_message_id text,nombre text,correo text,telefono text,interes text,inmueble_url text,origen text,notas text,created_at timestamptz
 )
 where coalesce(btrim(r.gmail_message_id),'')<>'' and (coalesce(r.correo,'')<>'' or coalesce(r.telefono,'')<>'')
 on conflict(user_id,gmail_message_id) do nothing;
 get diagnostics v_count = row_count;
 update private.prospectos_gmail_conexiones set history_id=v_history,comprobada_at=now() where user_id=p_usuario;
 return jsonb_build_object('importados',v_count,'history_id',v_history,'ultima_revision_at',now());
end $f$;
revoke all on function public.prospectos_gmail_import_job(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.prospectos_gmail_import_job(uuid,jsonb) to service_role;

-- Trigger programado. Vault y el secreto de Edge Functions deben coincidir.
create or replace function private.prospectos_gmail_schedule_sync() returns bigint
language plpgsql security definer set search_path=pg_catalog
as $f$
declare v_secret text; v_request bigint;
begin
 if not exists(select 1 from private.prospectos_gmail_conexiones c join private.prospectos_piloto p on p.user_id=c.user_id and p.activo) then return null; end if;
 select decrypted_secret into v_secret from vault.decrypted_secrets where name='kw_webhook_secret' limit 1;
 if v_secret is null then return null; end if;
 select net.http_post(
  url:='https://iloetojomzqtadkithtv.supabase.co/functions/v1/prospectos-gmail',
  headers:=jsonb_build_object('Content-Type','application/json','x-webhook-secret',v_secret),
  body:='{"accion":"sincronizar_todos"}'::jsonb,timeout_milliseconds:=120000
 ) into v_request;
 return v_request;
end $f$;
revoke all on function private.prospectos_gmail_schedule_sync() from public,anon,authenticated;
select cron.schedule('kw-prospectos-gmail-import','*/5 * * * *','select private.prospectos_gmail_schedule_sync()');

