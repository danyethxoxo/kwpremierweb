import {readFileSync,writeFileSync} from 'node:fs';
const root = new URL('../',import.meta.url);
const datos=JSON.parse(readFileSync(new URL('assets/data/limites-mx/estados.geojson',root),'utf8'));
const normalizar=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const filas=datos.features.map(f=>{
  const puntos=f.geometry.coordinates.flat(3);
  const lng=puntos.filter((_,i)=>i%2===0),lat=puntos.filter((_,i)=>i%2===1);
  return `    ('${normalizar(f.properties.nomgeo)}',${Math.min(...lat)},${Math.max(...lat)},${Math.min(...lng)},${Math.max(...lng)})`;
});
const sql=`-- Envolventes del Marco Geoestadistico INEGI diciembre 2025, assets/data/limites-mx.
-- Margen de 0.05 grados para no descartar ubicaciones cercanas a una frontera.
create or replace function private.coordenadas_en_estado(p_estado text, p_lat numeric, p_lng numeric)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select p_lat between sur-0.05 and norte+0.05 and p_lng between oeste-0.05 and este+0.05
  from (values
${filas.join(',\n')}
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
`;
writeFileSync(new URL('supabase/migrations/20261015161800_validar_coordenadas_por_estado.sql',root),sql,'utf8');
