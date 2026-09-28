-- Refuerza los dispositivos confiables: se conserva únicamente una huella
-- irreversible de la IP más reciente, nunca la dirección IP en texto claro.
-- La Edge Function exige que coincidan dispositivo, huella de IP y actividad
-- dentro de la ventana de confianza antes de omitir el código.

begin;

alter table public.mfa_dispositivos
  add column if not exists ultimo_ip_hash text;

comment on column public.mfa_dispositivos.ultimo_ip_hash is
  'Huella HMAC-like de la IP más reciente; no almacena la IP en texto claro.';

commit;
