create or replace function public.notificar_usuario_nuevo()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_nombre text;
begin
  v_nombre := coalesce(nullif(trim(coalesce(new.nombre, '') || ' ' || coalesce(new.apellido, '')), ''), new.email);
  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  select p.id, 'usuario_nuevo', 'Nuevo usuario agregado',
         v_nombre || ' se unió como ' || new.role,
         '/kwpremierweb/hub/admin.html'
  from public.profiles p
  where lower(p.email) = 'dani.guerrero@kwmexico.mx' and p.id <> new.id;
  return new;
end;
$$;
revoke execute on function public.notificar_usuario_nuevo() from public, anon, authenticated;
