-- Fase 32: correo por cada notificación, sin pasar por la pantalla de
-- Database Webhooks del dashboard (esa pantalla a veces manda a
-- "Integrations" en vez de abrir el formulario, según el proyecto).
--
-- Mismo mecanismo que ya usa 029_correo_prospecto.sql: un trigger llama
-- directo a la Edge Function con pg_net, sin bloquear el insert. Si el
-- correo falla o tarda, la notificación ya quedó guardada de todos modos
-- y la campanita sigue funcionando igual.
--
-- ANTES DE CORRER ESTO:
--   1. Ya debiste haber creado y desplegado la Edge Function
--      `notificar-email` (Edge Functions > notificar-email).
--   2. Ya debiste haber puesto el secreto WEBHOOK_SECRET en esa función
--      (Project Settings > Edge Functions > Secrets).
--   3. Abajo, sustituir PON_AQUI_TU_WEBHOOK_SECRET por ese mismo valor
--      exacto — si no coinciden, la función responde "No autorizado".
--
-- Requiere 013_notificaciones.sql.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

create extension if not exists pg_net with schema extensions;

create or replace function public.notificar_email_nueva_notificacion()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_url text := 'https://iloetojomzqtadkithtv.supabase.co/functions/v1/notificar-email';
  v_secreto text := 'PON_AQUI_TU_WEBHOOK_SECRET';
begin
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secreto
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
  -- Que no se pueda mandar el correo no debe tumbar la notificación: la
  -- campanita ya la guardó y eso es lo que no puede fallar.
  when others then
    return new;
end;
$$;

drop trigger if exists trg_notificar_email on public.notificaciones;
create trigger trg_notificar_email
  after insert on public.notificaciones
  for each row execute function public.notificar_email_nueva_notificacion();
