-- Liderazgo recibe avisos informativos, sin generar correos desde la campana.
create or replace function public.notificar_dictamen()
returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_asesor text;
  v_como text;
begin
  if new.estado = 'borrador' then return new; end if;
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then return new; end if;
  select nombre into v_asesor from public.dictamen_asesores where id = new.asesor_id;
  v_como := case new.estado
    when 'devuelta' then 'Devuelto'
    when 'condicionada' then 'Autorizado condicionado'
    else 'Autorizado'
  end;
  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  select p.id, 'dictamen', 'Dictamen de expediente: ' || v_como,
         'Dictamen de ' || coalesce(nullif(trim(v_asesor), ''), 'Asesor(a)') ||
           ' con dirección:' || E'\n\n' || coalesce(nullif(trim(new.inmueble), ''), 'sin dirección'),
         '/hub/dictamenes.html'
  from public.profiles p where p.role in ('master', 'admin', 'staff');
  return new;
end;
$$;
revoke execute on function public.notificar_dictamen() from public, anon, authenticated;

drop trigger if exists trg_notificar_dictamen on public.dictamenes;
create trigger trg_notificar_dictamen after insert or update on public.dictamenes
  for each row execute function public.notificar_dictamen();

-- Mantiene intacto el envio automatico de los otros tipos de aviso.
drop trigger if exists trg_notificar_email on public.notificaciones;
create trigger trg_notificar_email after insert on public.notificaciones
  for each row when (new.tipo is distinct from 'dictamen')
  execute function public.notificar_email_nueva_notificacion();
