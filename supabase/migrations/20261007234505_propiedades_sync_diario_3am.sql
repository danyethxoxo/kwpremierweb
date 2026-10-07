-- 09:00 UTC corresponde a las 03:00 en America/Mexico_City.
-- Los reintentos evitan perder el dia si la fuente tiene una falla temporal.
create or replace function private.propiedades_inventario_diario() returns bigint
language plpgsql security definer set search_path=pg_catalog as $$
declare secreto text; solicitud bigint;
begin
  select decrypted_secret into secreto from vault.decrypted_secrets where name='kw_webhook_secret' limit 1;
  if secreto is null then raise exception 'Falta configurar el secreto de cron'; end if;
  select net.http_post(
    url:='https://iloetojomzqtadkithtv.supabase.co/functions/v1/inventario-diario',
    headers:=jsonb_build_object('Content-Type','application/json','x-webhook-secret',secreto,
      'x-ultimo-intento',case when extract(minute from now()) >= 50 then 'true' else 'false' end),
    body:='{}'::jsonb,timeout_milliseconds:=180000
  ) into solicitud;
  return solicitud;
end; $$;
revoke all on function private.propiedades_inventario_diario() from public,anon,authenticated;
select cron.schedule('kw-inventario-diario-3am','0,10,20,30,40,50 9 * * *','select private.propiedades_inventario_diario()');
