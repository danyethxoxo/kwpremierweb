-- Envolventes del Marco Geoestadistico INEGI diciembre 2025, assets/data/limites-mx.
-- Margen de 0.05 grados para no descartar ubicaciones cercanas a una frontera.
create or replace function private.coordenadas_en_estado(p_estado text, p_lat numeric, p_lng numeric)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select p_lat between sur-0.05 and norte+0.05 and p_lng between oeste-0.05 and este+0.05
  from (values
    ('aguascalientes',21.62227,22.45959,-102.87418,-101.83529),
    ('bajacalifornia',28,32.71865,-118.36526,-112.29677),
    ('bajacaliforniasur',22.87167,28,-115.7661,-109.41311),
    ('campeche',17.81287,20.84833,-92.46879,-89.12123),
    ('coahuiladezaragoza',24.54268,29.88,-103.96,-99.84322),
    ('colima',18.33886,19.51252,-114.75939,-103.48643),
    ('chiapas',14.5321,17.98529,-94.13916,-90.37033),
    ('chihuahua',25.55884,31.78382,-109.07489,-103.30689),
    ('ciudaddemexico',19.04824,19.59276,-99.36492,-98.9403),
    ('durango',22.34516,26.84488,-107.21013,-102.4727),
    ('guanajuato',19.91275,21.83912,-102.0969,-99.6713),
    ('guerrero',16.31595,18.88712,-102.18435,-98.00728),
    ('hidalgo',19.59776,21.39838,-99.85954,-97.98507),
    ('jalisco',18.92594,22.75025,-105.69496,-101.51054),
    ('mexico',18.36702,20.28563,-100.61309,-98.59687),
    ('michoacandeocampo',17.91337,20.39447,-103.73798,-100.06303),
    ('morelos',18.33238,19.1317,-99.49441,-98.63295),
    ('nayarit',20.60342,23.08448,-106.68773,-103.72102),
    ('nuevoleon',23.16268,27.79872,-101.20676,-98.42158),
    ('oaxaca',15.65687,18.66932,-98.55263,-93.86743),
    ('puebla',17.86091,20.83991,-99.07049,-96.72468),
    ('queretaro',20.01502,21.66992,-100.59654,-99.04308),
    ('quintanaroo',17.89426,21.60542,-89.29656,-86.71041),
    ('sanluispotosi',21.16018,24.49152,-102.29604,-98.32597),
    ('sinaloa',22.46718,27.04205,-109.44385,-105.39222),
    ('sonora',26.29701,32.49391,-115.05302,-108.42427),
    ('tabasco',17.25097,18.65096,-94.13003,-90.98746),
    ('tamaulipas',22.20697,27.67913,-100.14495,-97.14436),
    ('tlaxcala',19.10507,19.72892,-98.7084,-97.62545),
    ('veracruzdeignaciodelallave',17.13696,22.47175,-98.68155,-93.60794),
    ('yucatan',19.55117,22.58573,-92.3257,-87.53315),
    ('zacatecas',21.04224,25.12519,-104.35353,-100.74232)
  ) as limites(estado,sur,norte,oeste,este)
  where estado = case regexp_replace(lower(translate(p_estado,'ÁÉÍÓÚÜáéíóúü','AEIOUUaeiouu')),'[^a-z0-9]','','g')
    when 'coahuila' then 'coahuiladezaragoza'
    when 'estadodemexico' then 'mexico'
    when 'michoacan' then 'michoacandeocampo'
    when 'veracruz' then 'veracruzdeignaciodelallave'
    when 'cdmx' then 'ciudaddemexico'
    else regexp_replace(lower(translate(p_estado,'ÁÉÍÓÚÜáéíóúü','AEIOUUaeiouu')),'[^a-z0-9]','','g') end;
$$;
revoke all on function private.coordenadas_en_estado(text,numeric,numeric) from public,anon,authenticated;
grant execute on function private.coordenadas_en_estado(text,numeric,numeric) to service_role;

create or replace function private.validar_coordenadas_estado_propiedad()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if upper(btrim(coalesce(new.pais,''))) in ('MX','MEX','MEXICO','MÉXICO')
    and private.coordenadas_en_estado(new.estado,new.lat,new.lng) = false then
    new.lat := null;
    new.lng := null;
  end if;
  return new;
end;
$$;
revoke all on function private.validar_coordenadas_estado_propiedad() from public,anon,authenticated;
-- Se ejecuta despues de normalizar estado y validar el signo de las coordenadas.
create trigger propiedades_zz_validar_estado_coordenadas
before insert or update of estado,pais,lat,lng on public.propiedades
for each row execute function private.validar_coordenadas_estado_propiedad();

update public.propiedades set lat=lat,lng=lng
where upper(btrim(coalesce(pais,''))) in ('MX','MEX','MEXICO','MÉXICO')
  and private.coordenadas_en_estado(estado,lat,lng) = false;
