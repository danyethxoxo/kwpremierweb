begin;

-- Conservar el disparador existente y corregir el destino para futuros avisos.
create or replace function public.notificar_resena_nueva()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.notificaciones (user_id, tipo, titulo, mensaje, url)
  select p.id, 'resena', 'Nueva reseña de ' || new.nombre,
         new.estrellas || ' estrellas · falta aprobarla para que se publique',
         '/hub/resenas.html'
  from public.profiles p
  where p.role in ('master', 'admin');
  return new;
end;
$$;

-- Es una función de disparador, no un endpoint para clientes.
revoke execute on function public.notificar_resena_nueva() from public, anon, authenticated;

-- Los avisos existentes conservan su estado leído y su contenido.
update public.notificaciones
set url = '/hub/resenas.html'
where tipo = 'resena' and url is distinct from '/hub/resenas.html';

commit;
