-- El aviso de guardado usa el asunto y contenido del correo, sin adjuntos.
create or replace function public.notificar_dictamen()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_asesor text;
  v_como text;
begin
  if new.estado = 'borrador' or new.estado is not distinct from old.estado then
    return new;
  end if;

  select nombre into v_asesor from public.dictamen_asesores where id = new.asesor_id;
  v_como := case new.estado
    when 'devuelta' then 'Devuelto'
    when 'condicionada' then 'Autorizado condicionado'
    else 'Autorizado'
  end;

  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  select p.id, 'dictamen', 'Dictamen de expediente: ' || v_como,
         'Hola: ' || coalesce(nullif(trim(v_asesor), ''), 'Asesor(a)') ||
           ', te compartimos el dictamen de expediente de tu listado con dirección:' || E'\n\n' ||
           coalesce(nullif(trim(new.inmueble), ''), 'sin dirección'),
         '/hub/dictamenes.html'
  from public.profiles p
  where p.role in ('master', 'admin', 'staff')
    and p.id is distinct from auth.uid();

  return new;
end;
$$;

revoke execute on function public.notificar_dictamen() from public, anon, authenticated;
