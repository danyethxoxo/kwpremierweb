create table public.asesores_sync_control (
  id boolean primary key default true check(id),
  activo boolean not null default false,
  iniciado_at timestamptz,
  terminado_at timestamptz,
  cambios_at timestamptz,
  huella text,
  ultimo_error text
);
insert into public.asesores_sync_control(id) values(true);
alter table public.asesores_sync_control enable row level security;
revoke all on public.asesores_sync_control from anon,authenticated;
grant select on public.asesores_sync_control to authenticated;
grant all on public.asesores_sync_control to service_role;
create policy liderazgo_consulta_sync on public.asesores_sync_control for select to authenticated
  using ((select private.is_staff_or_above()) and (select public.mfa_sesion_autorizada()));

create function public.asesores_sync_iniciar() returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Servicio interno'; end if;
  update public.asesores_sync_control set activo=true,iniciado_at=now(),ultimo_error=null
  where id and (not activo or iniciado_at < now()-interval '5 minutes');
  return found;
end; $$;
revoke all on function public.asesores_sync_iniciar() from public,anon,authenticated;
grant execute on function public.asesores_sync_iniciar() to service_role;

-- Se conserva la importación actual, incluidas las reglas de grupos fijados
-- y valores vacíos. El servidor puede ejecutarla sin suplantar a un usuario.
do $$ declare v_def text; begin
  select pg_get_functiondef('public.asesores_sincronizar(jsonb)'::regprocedure) into v_def;
  if position('if not public.is_staff_or_above() then' in v_def)=0 then raise exception 'Revisar autorización de la importación existente'; end if;
  v_def=replace(v_def,'if not public.is_staff_or_above() then',
    'if auth.role() is distinct from ''service_role'' and not coalesce(private.is_staff_or_above(),false) then');
  execute v_def;
end; $$;
grant execute on function public.asesores_sincronizar(jsonb) to service_role;

alter publication supabase_realtime add table public.asesores_sync_control;

create function private.asesores_programar_sync() returns bigint language plpgsql security definer set search_path=pg_catalog as $$
declare v_secret text; v_request bigint;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='kw_webhook_secret' limit 1;
  if v_secret is null then raise exception 'Falta secreto del servicio'; end if;
  select net.http_post(
    url:='https://iloetojomzqtadkithtv.supabase.co/functions/v1/hyper-processor',
    headers:=jsonb_build_object('Content-Type','application/json','x-webhook-secret',v_secret),
    body:='{"accion":"sincronizar_asesores"}'::jsonb,timeout_milliseconds:=120000
  ) into v_request;
  return v_request;
end; $$;
revoke all on function private.asesores_programar_sync() from public,anon,authenticated;
select cron.schedule('asesores-libro-cada-2-minutos','*/2 * * * *','select private.asesores_programar_sync();');
