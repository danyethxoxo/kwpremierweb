-- Configure Vault names kw_webhook_secret and kw_sync_secret FIRST.
-- They must match the rotated WEBHOOK_SECRET and SYNC_SECRET Edge secrets.
-- Never paste real credentials into this file, commits, logs or CI variables
-- that are published into the static frontend.
begin;
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'kw_webhook_secret' and length(decrypted_secret) >= 32)
    or not exists (select 1 from vault.decrypted_secrets where name = 'kw_sync_secret' and length(decrypted_secret) >= 32) then
    raise exception 'Configura kw_webhook_secret y kw_sync_secret en Vault antes de continuar';
  end if;
end $$;

create or replace function public.notificar_email_nueva_notificacion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_secreto text;
begin
  select decrypted_secret into strict v_secreto from vault.decrypted_secrets where name = 'kw_webhook_secret';
  perform net.http_post(
    url := 'https://iloetojomzqtadkithtv.supabase.co/functions/v1/notificar-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secreto),
    body := jsonb_build_object('record', jsonb_build_object(
      'user_id', new.user_id, 'titulo', new.titulo, 'mensaje', new.mensaje, 'url', new.url))
  );
  return new;
exception when others then
  raise warning 'No se pudo programar el correo de notificacion';
  return new;
end;
$$;
revoke all on function public.notificar_email_nueva_notificacion() from public, anon, authenticated;

create or replace function public.correo_prospecto_nuevo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_secreto text;
begin
  select decrypted_secret into strict v_secreto from vault.decrypted_secrets where name = 'kw_sync_secret';
  perform net.http_post(
    url := 'https://iloetojomzqtadkithtv.supabase.co/functions/v1/avisar-prospecto',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_secreto),
    body := jsonb_build_object('record', jsonb_build_object(
      'asesor_id', new.asesor_id, 'nombre', new.nombre, 'correo', new.correo,
      'telefono', new.telefono, 'mensaje', new.mensaje))
  );
  return new;
exception when others then
  raise warning 'No se pudo programar el correo de prospecto';
  return new;
end;
$$;
revoke all on function public.correo_prospecto_nuevo() from public, anon, authenticated;
commit;
