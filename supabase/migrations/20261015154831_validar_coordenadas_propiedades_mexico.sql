-- KW Mexico entrega algunas longitudes sin signo y coordenadas de prueba.
-- El sobre geografico es una validacion minima, no una geocodificacion.
create or replace function private.validar_coordenadas_propiedad_mexico()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if upper(btrim(coalesce(new.pais, ''))) not in ('MX', 'MEX', 'MEXICO', 'MÉXICO') then
    return new;
  end if;

  if new.lat between 14 and 33 and new.lng between 86 and 119 then
    new.lng := -new.lng;
  end if;

  if new.lat is null or new.lng is null
     or not (new.lat between 14 and 33 and new.lng between -119 and -86) then
    new.lat := null;
    new.lng := null;
  end if;
  return new;
end;
$$;
revoke all on function private.validar_coordenadas_propiedad_mexico() from public, anon, authenticated;

create trigger propiedades_validar_coordenadas_mexico
before insert or update of lat, lng, pais on public.propiedades
for each row execute function private.validar_coordenadas_propiedad_mexico();

-- Conserva datos_origen y el historial existente; no inventa ubicaciones.
update public.propiedades set lat = lat, lng = lng
where upper(btrim(coalesce(pais, ''))) in ('MX', 'MEX', 'MEXICO', 'MÉXICO')
  and (lat is not null or lng is not null)
  and (lat is null or lng is null
       or not (lat between 14 and 33 and lng between -119 and -86));
