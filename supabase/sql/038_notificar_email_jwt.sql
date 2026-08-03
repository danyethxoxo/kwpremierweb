-- Fase 33: el 401 "UNAUTHORIZED_NO_AUTH_HEADER" no lo manda nuestra
-- función (esa contesta "No autorizado" en español, distinto) — lo
-- manda la puerta de entrada de Supabase, que por defecto exige un
-- token de sesión (JWT) en TODAS las Edge Functions antes de dejar que
-- corra el código de adentro. pg_net no manda eso, así que nunca
-- llegaba a ejecutarse la función.
--
-- Esto agrega ese encabezado (con la llave pública del proyecto, la
-- misma que usa el sitio) para pasar esa puerta. El candado real sigue
-- siendo x-webhook-secret, que ya trae desde 036.
--
-- Requiere 036_notificar_email_trigger.sql ya corrido (con tu
-- WEBHOOK_SECRET real puesto en vez de PON_AQUI_TU_WEBHOOK_SECRET).
--
-- IMPORTANTE: si después de correr esto el diagnóstico (037) sigue
-- marcando 401 UNAUTHORIZED_NO_AUTH_HEADER, hay que apagar a mano la
-- verificación de JWT de esta función:
--   Edge Functions > notificar-email > Details (o el ícono de ajustes) >
--   "Enforce JWT Verification" -> apagarlo y guardar.
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

create or replace function public.notificar_email_nueva_notificacion()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_url text := 'https://iloetojomzqtadkithtv.supabase.co/functions/v1/notificar-email';
  v_secreto text := 'xAN9_aVWejpijYWQiEUOZSmTwixcZErCYj0S8CBIrsI';
  v_anon_key text := 'sb_publishable_ZvaIC0_lkd6OQ0VMihOvjA_BIgpbClq';
begin
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secreto,
      'Authorization', 'Bearer ' || v_anon_key,
      'apikey', v_anon_key
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'user_id', new.user_id,
        'titulo',  new.titulo,
        'mensaje', new.mensaje,
        'url',     new.url
      )
    )
  );
  return new;
exception
  when others then
    return new;
end;
$$;
