-- Fase 26: además del aviso en la campanita, el prospecto llega por correo.
--
-- Cuando entra un prospecto, la base llama a la Edge Function
-- `avisar-prospecto`, que es la que arma y manda el correo. Se hace con
-- pg_net (el mismo mecanismo de los Database Webhooks de Supabase), que
-- manda la petición sin bloquear: si el correo tarda o falla, el
-- prospecto ya quedó guardado de todos modos.
--
-- ANTES DE CORRER ESTO:
--   1. Desplegar la Edge Function `avisar-prospecto`.
--   2. Tener puesta la variable SYNC_SECRET (la misma de sincronizar-propiedades).
--   3. Abajo, sustituir PON_AQUI_TU_SYNC_SECRET por ese mismo valor.
--
-- Requiere 026_micrositio_y_prospectos.sql.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

create extension if not exists pg_net with schema extensions;

create or replace function public.correo_prospecto_nuevo()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_url text := 'https://iloetojomzqtadkithtv.supabase.co/functions/v1/avisar-prospecto';
  v_secreto text := 'PON_AQUI_TU_SYNC_SECRET';
begin
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', v_secreto
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'asesor_id', new.asesor_id,
        'nombre',    new.nombre,
        'correo',    new.correo,
        'telefono',  new.telefono,
        'mensaje',   new.mensaje
      )
    )
  );
  return new;
exception
  -- Que no se pueda mandar el correo no debe tumbar el registro del
  -- prospecto: eso sería perder al cliente por un problema de plomería.
  when others then
    return new;
end;
$$;

drop trigger if exists trg_correo_prospecto_nuevo on public.prospectos;
create trigger trg_correo_prospecto_nuevo
  after insert on public.prospectos
  for each row execute function public.correo_prospecto_nuevo();
