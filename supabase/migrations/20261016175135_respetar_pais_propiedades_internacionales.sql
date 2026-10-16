-- Restaurar el pais y las coordenadas originales de anuncios internacionales.
-- No inferir paises a partir del titulo: Carretera Colombia tambien existe en Mexico.
with origen as (
  select id,
    upper(btrim(coalesce(nullif(datos_origen#>>'{listado,Country}',''),
      nullif(datos_origen#>>'{detalle,data,Property_Data,0,Country}','')))) as pais_fuente,
    coalesce(nullif(datos_origen#>>'{listado,Latitude}',''),
      datos_origen#>>'{detalle,data,Property_Data,0,Latitude}') as lat_fuente,
    coalesce(nullif(datos_origen#>>'{listado,Longitude}',''),
      datos_origen#>>'{detalle,data,Property_Data,0,Longitude}') as lng_fuente
  from public.propiedades where fuente='kwmexico'
), coordenadas as (
  select id,
    case when pais_fuente in ('CO','COL','COLOMBIA') then 'CO'
         when pais_fuente in ('US','USA','UNITED STATES','ESTADOS UNIDOS') then 'US'
         when pais_fuente in ('CA','CAN','CANADA') then 'CA'
         else pais_fuente end as pais,
    case when lat_fuente ~ '^[+-]?[0-9]+([.][0-9]+)?$' then lat_fuente::numeric end as lat,
    case when lng_fuente ~ '^[+-]?[0-9]+([.][0-9]+)?$' then lng_fuente::numeric end as lng
  from origen where pais_fuente is not null and pais_fuente<>''
    and pais_fuente not in ('MX','MEX','MEXICO',U&'M\00C9XICO')
)
update public.propiedades p set pais=c.pais,
  lat=case when c.lat between -90 and 90 and c.lng between -180 and 180
    and (c.lat<>0 or c.lng<>0) then c.lat end,
  lng=case when c.lat between -90 and 90 and c.lng between -180 and 180
    and (c.lat<>0 or c.lng<>0) then c.lng end
from coordenadas c where p.id=c.id and p.pais is distinct from c.pais;
