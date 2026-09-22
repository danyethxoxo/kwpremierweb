-- Activate ONLY after 088, the Edge Functions and frontend are deployed.
-- DATA_GATEWAY_SECRET must match private.security_config.gateway_secret.
begin;
create or replace function public.mfa_verificar_peticion()
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
begin
  if auth.role() in ('anon', 'authenticated') then
    if not exists (select 1 from private.security_config
      where id and gateway_secret = v_headers ->> 'x-kw-gateway') then
      raise insufficient_privilege using message = 'Utiliza la API del sitio';
    end if;
    if auth.role() = 'authenticated' and not public.mfa_sesion_autorizada() then
      raise insufficient_privilege using message = 'Se requiere verificacion en dos pasos';
    end if;
  end if;
end;
$$;
revoke all on function public.mfa_verificar_peticion() from public;
grant execute on function public.mfa_verificar_peticion() to anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'public.mfa_verificar_peticion';

-- Storage does not run the PostgREST pre-request hook.
drop policy if exists security_storage_mfa on storage.objects;
create policy security_storage_mfa on storage.objects as restrictive for all to authenticated
  using ((select public.mfa_sesion_autorizada()))
  with check ((select public.mfa_sesion_autorizada()));
update storage.buckets set public = false where id = 'firmas';
update storage.buckets set public = false where id = 'incidencias';
drop policy if exists incidencias_storage_select_public on storage.objects;
drop policy if exists incidencias_storage_select_privado on storage.objects;
create policy incidencias_storage_select_privado on storage.objects for select to authenticated
  using (bucket_id = 'incidencias' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.is_staff_or_above()
  ));

-- New internal tables/functions must opt into API access.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- Ensure all existing public tables have RLS, including tables added after 085.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('drop policy if exists mfa_sesion_requerida on public.%I', t.tablename);
    execute format('create policy mfa_sesion_requerida on public.%I as restrictive for all to authenticated using ((select public.mfa_sesion_autorizada())) with check ((select public.mfa_sesion_autorizada()))', t.tablename);
  end loop;
end $$;
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
