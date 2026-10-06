-- Los casos históricos pueden conservar su formato al cambiar de estado.
-- La validación aplica al crear un reporte o modificar su contenido.
alter table public.incidencias drop constraint if exists incidencias_demo_datos;
create or replace function public.incidencias_validar_contenido()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if tg_op='UPDATE' and row(new.titulo,new.descripcion,new.tipo,new.pagina,new.imagenes)
    is not distinct from row(old.titulo,old.descripcion,old.tipo,old.pagina,old.imagenes) then
    return new;
  end if;
  if new.tipo is null or new.tipo not in ('problema','mejora','duda')
    or new.titulo is null or length(trim(new.titulo)) not between 3 and 160
    or new.descripcion is null or length(trim(new.descripcion)) not between 10 and 6000
    or cardinality(new.imagenes)>5
    or (new.pagina is not null and (length(new.pagina)>300 or new.pagina !~ '^/[^[:cntrl:]]*$' or new.pagina ~ '^//')) then
    raise exception 'El contenido del reporte es inválido' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.incidencias_validar_contenido() from public,anon,authenticated;
drop trigger if exists incidencias_validar_contenido on public.incidencias;
create trigger incidencias_validar_contenido before insert or update on public.incidencias
for each row execute function public.incidencias_validar_contenido();
