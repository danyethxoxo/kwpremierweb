-- Conserva un aviso por sesión; abre Perfil para revisar los dispositivos.
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
    coalesce(nullif(trim(new.nombre_dispositivo), ''), 'Navegador') ||
    ' · ' || to_char(now() at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') || ' (CDMX).',
    'perfil.html'
  );
  return new;
end;
$$;
revoke all on function public.notificar_inicio_sesion() from public, anon, authenticated;
