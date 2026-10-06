-- Un aviso por sesión autorizada, también visible en los demás dispositivos.
-- Los INSERT en notificaciones usan el envío de correo existente.
alter table public.mfa_sesiones add column if not exists nombre_dispositivo text;

create or replace function public.notificar_inicio_sesion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  values (
    new.user_id,
    'inicio_sesion',
    'Nuevo inicio de sesión',
    'Se inició una sesión desde ' || coalesce(nullif(new.nombre_dispositivo, ''), 'un navegador') ||
    ' el ' || to_char(now() at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') ||
    ' (hora de Ciudad de México). Si no reconoces este acceso, cambia tu contraseña y revoca tus dispositivos desde Perfil.',
    'perfil.html'
  );
  return new;
end;
$$;
revoke all on function public.notificar_inicio_sesion() from public, anon, authenticated;

drop trigger if exists trg_notificar_inicio_sesion on public.mfa_sesiones;
create trigger trg_notificar_inicio_sesion
  after insert on public.mfa_sesiones
  for each row execute function public.notificar_inicio_sesion();
