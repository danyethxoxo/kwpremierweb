-- Misma base de filtrado para listado, mapa y perfiles compradores.
create or replace function public.propiedad_cumple_busqueda(p public.propiedades,f jsonb) returns boolean
language sql stable security invoker set search_path=pg_catalog,public as $$
 select coalesce(p.fuente='kwmexico'
 and (nullif(f->>'estatus','') is null or case when f->>'estatus'='inactiva' then p.estatus<>'publicada' else p.estatus=f->>'estatus' end)
 and (public.propiedad_filtro_valores(f,'tipo') is null or p.tipo_comprador=any(public.propiedad_filtro_valores(f,'tipo')))
 and (public.propiedad_filtro_valores(f,'operacion') is null or public.propiedad_operaciones_filtro(p.operacion,p.titulo,p.descripcion) && public.propiedad_filtro_valores(f,'operacion'))
 and (public.propiedad_filtro_valores(f,'estado') is null or p.estado=any(public.estados_filtro_equivalentes(public.propiedad_filtro_valores(f,'estado'))))
 and (public.propiedad_filtro_valores(f,'municipio') is null or p.municipio=any(public.propiedad_filtro_valores(f,'municipio')))
 and (public.propiedad_filtro_valores(f,'colonia') is null or p.colonia=any(public.propiedad_filtro_valores(f,'colonia')))
 and (nullif(f->>'moneda','') is null or p.moneda=f->>'moneda')
 and (coalesce(nullif(f->>'minimo','')::numeric,0)<=0 or p.precio>=(f->>'minimo')::numeric)
 and (coalesce(nullif(f->>'maximo','')::numeric,0)<=0 or p.precio<=(f->>'maximo')::numeric)
 and (coalesce(nullif(f->>'recamaras','')::numeric,0)<=0 or p.recamaras>=(f->>'recamaras')::numeric)
 and (coalesce(nullif(f->>'recamarasMax','')::numeric,0)<=0 or p.recamaras<=(f->>'recamarasMax')::numeric)
 and (coalesce(nullif(f->>'banos','')::numeric,0)<=0 or p.banos>=(f->>'banos')::numeric)
 and (coalesce(nullif(f->>'estacionamientos','')::numeric,0)<=0 or p.estacionamientos>=(f->>'estacionamientos')::numeric)
 and (coalesce(nullif(f->>'m2Min','')::numeric,0)<=0 or case when p.tipo_comprador='Terreno' then p.m2_terreno else p.m2_construccion end>=(f->>'m2Min')::numeric)
 and (coalesce(nullif(f->>'m2Max','')::numeric,0)<=0 or case when p.tipo_comprador='Terreno' then p.m2_terreno else p.m2_construccion end<=(f->>'m2Max')::numeric),false);
$$;
revoke all on function public.propiedad_cumple_busqueda(public.propiedades,jsonb) from public,anon;
grant execute on function public.propiedad_cumple_busqueda(public.propiedades,jsonb) to authenticated,service_role;

create or replace function public.propiedades_inventario_filtradas(p_filtros jsonb default '{}')
returns table(id uuid,updated_at timestamptz,precio numeric,m2_construccion numeric,lat numeric,lng numeric)
language sql stable security invoker set search_path=pg_catalog,public set jit='off' as $$
 with area as materialized (select public.propiedad_poligono(p_filtros->'poligono') as trazo)
 select p.id,p.updated_at,p.precio,p.m2_construccion,p.lat,p.lng from public.propiedades p cross join area a
 where (select auth.uid()) is not null and p.fuente='kwmexico'
 -- Predicados indexables antes de la validación compartida de cada candidato.
 and (public.propiedad_filtro_valores(p_filtros,'tipo') is null or p.tipo_comprador=any(public.propiedad_filtro_valores(p_filtros,'tipo')))
 and (public.propiedad_filtro_valores(p_filtros,'estado') is null or p.estado=any(public.estados_filtro_equivalentes(public.propiedad_filtro_valores(p_filtros,'estado'))))
 and (coalesce(nullif(p_filtros->>'minimo','')::numeric,0)<=0 or p.precio>=(p_filtros->>'minimo')::numeric)
 and (coalesce(nullif(p_filtros->>'maximo','')::numeric,0)<=0 or p.precio<=(p_filtros->>'maximo')::numeric)
 and public.propiedad_cumple_busqueda(p,p_filtros)
 and (a.trazo is null or point(p.lng::double precision,p.lat::double precision) <@ a.trazo)
 and (public.propiedad_filtro_valores(p_filtros,'marketCenter') is null or p.market_center=any(public.propiedad_filtro_valores(p_filtros,'marketCenter')))
 and (public.propiedad_filtro_valores(p_filtros,'asesor') is null or p.asesor_nombre=any(public.propiedad_filtro_valores(p_filtros,'asesor')))
 and (nullif(p_filtros->>'texto','') is null or strpos(translate(lower(concat_ws(' ',p.titulo,p.asesor_nombre,p.calle,p.colonia,p.municipio,p.estado,p.tipo_comprador,p.market_center)),'áéíóúüñ','aeiouun'),translate(lower(p_filtros->>'texto'),'áéíóúüñ','aeiouun'))>0)
 and (p_filtros->'zona' is null or p_filtros->'zona'='null'::jsonb or (
  jsonb_array_length(p_filtros->'zona')=4 and p.lat between (p_filtros->'zona'->>0)::numeric and (p_filtros->'zona'->>2)::numeric
  and p.lng between (p_filtros->'zona'->>1)::numeric and (p_filtros->'zona'->>3)::numeric));
$$;

create or replace function public.comprador_filtros(c public.perfiles_comprador,con_zona boolean default true,con_caracteristicas boolean default true) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('estatus','publicada','operacion',c.operacion,'tipo',c.tipos,'estado',c.estado,'moneda',c.moneda,
 'minimo',c.precio_min,'maximo',c.precio_max,
 'municipio',case when con_zona then to_jsonb(c.municipios) else '[]'::jsonb end,
 'colonia',case when con_zona then (select coalesce(jsonb_agg(z->>'colonia'),'[]') from jsonb_array_elements(c.colonias_seleccionadas) z) else '[]'::jsonb end,
 'recamaras',case when con_caracteristicas then c.recamaras_min end,'banos',case when con_caracteristicas then c.banos_min end,
 'estacionamientos',case when con_caracteristicas then c.estacionamientos_min end,'m2Min',case when con_caracteristicas then c.superficie_min end);
$$;
create or replace function public.comprador_en_zona(c public.perfiles_comprador,p public.propiedades) returns boolean
language sql stable security invoker set search_path=pg_catalog,public as $$
 select p.estado=any(public.estados_filtro_equivalentes(array[c.estado]))
 and (cardinality(c.municipios)=0 or p.municipio=any(c.municipios))
 and (jsonb_array_length(c.colonias_seleccionadas)=0 or exists(select 1 from jsonb_array_elements(c.colonias_seleccionadas) z
 where z->>'colonia'=p.colonia and (coalesce(z->>'municipio','')='' or z->>'municipio'=p.municipio)
 and (coalesce(z->>'estado','')='' or p.estado=any(public.estados_filtro_equivalentes(array[z->>'estado'])))));
$$;
create or replace function public.comprador_requisitos_duros(c public.perfiles_comprador,p public.propiedades) returns boolean
language sql stable security invoker set search_path=pg_catalog,public as $$
 select p.precio>0 and public.propiedad_cumple_busqueda(p,public.comprador_filtros(c)) and public.comprador_en_zona(c,p);
$$;

create or replace function public.comprador_distancia_km(lat1 numeric,lng1 numeric,lat2 numeric,lng2 numeric) returns numeric
language sql immutable parallel safe security invoker set search_path=pg_catalog as $$
 select case when lat1 between -85 and 85 and lat2 between -85 and 85 and lng1 between -180 and 180 and lng2 between -180 and 180
 and (lat1<>0 or lng1<>0) and (lat2<>0 or lng2<>0) then
 (6371.0088*2*asin(sqrt(least(1.0,greatest(0.0,power(sin(radians((lat2-lat1)::double precision)/2),2)
 +cos(radians(lat1::double precision))*cos(radians(lat2::double precision))*power(sin(radians((lng2-lng1)::double precision)/2),2))))))::numeric end;
$$;
create index propiedades_comprador_geo_idx on public.propiedades(estado,lat,lng) where estatus='publicada' and fuente='kwmexico';
create or replace function public.comprador_distancia_zona(c public.perfiles_comprador,p public.propiedades) returns numeric
language sql stable security invoker set search_path=pg_catalog,public as $$
 select min(d.km) from public.propiedades r
 cross join lateral (select public.comprador_distancia_km(p.lat,p.lng,r.lat,r.lng) as km) d
 where (cardinality(c.municipios)>0 or jsonb_array_length(c.colonias_seleccionadas)>0)
 and p.lat between -85 and 85 and p.lng between -180 and 180 and (p.lat<>0 or p.lng<>0)
 and r.fuente='kwmexico' and r.estatus='publicada' and r.estado=any(public.estados_filtro_equivalentes(array[c.estado]))
 and r.lat between p.lat-.019 and p.lat+.019
 and r.lng between p.lng-(2.1/(111.0*greatest(.08,cos(radians(p.lat::double precision)))))::numeric
  and p.lng+(2.1/(111.0*greatest(.08,cos(radians(p.lat::double precision)))))::numeric
 and public.comprador_en_zona(c,r) and d.km<=2;
$$;
revoke all on function public.comprador_filtros(public.perfiles_comprador,boolean,boolean),public.comprador_distancia_km(numeric,numeric,numeric,numeric),public.comprador_distancia_zona(public.perfiles_comprador,public.propiedades) from public,anon;
grant execute on function public.comprador_filtros(public.perfiles_comprador,boolean,boolean),public.comprador_distancia_km(numeric,numeric,numeric,numeric),public.comprador_distancia_zona(public.perfiles_comprador,public.propiedades) to authenticated,service_role;

alter table public.comprador_resultados drop constraint comprador_resultados_categoria_check;
alter table public.comprador_resultados add constraint comprador_resultados_categoria_check check(categoria in ('fuertes','otras_zonas','otras_caracteristicas','otro_presupuesto','zonas_cercanas'));
create or replace function public.comprador_categoria_valida(c public.perfiles_comprador,p public.propiedades,categoria text,porcentaje integer) returns boolean
language sql stable security invoker set search_path=pg_catalog,public as $$
 select coalesce(p.precio>0 and public.propiedad_cumple_busqueda(p,public.comprador_filtros(c,false,false)||jsonb_build_object('maximo',c.precio_max*1.10)) and
 case categoria
 when 'fuertes' then porcentaje>=greatest(80,c.umbral_match) and public.comprador_requisitos_duros(c,p)
 when 'otras_zonas' then porcentaje<80 and not public.comprador_en_zona(c,p) and p.precio<=c.precio_max
  and public.comprador_cumple_caracteristicas(c,p) and public.comprador_distancia_zona(c,p) is null
 when 'zonas_cercanas' then porcentaje<80 and not public.comprador_en_zona(c,p) and p.precio<=c.precio_max
  and public.comprador_cumple_caracteristicas(c,p) and public.comprador_distancia_zona(c,p) is not null
 when 'otras_caracteristicas' then porcentaje<80 and public.comprador_en_zona(c,p) and p.precio<=c.precio_max
 when 'otro_presupuesto' then porcentaje<80 and public.comprador_en_zona(c,p) and public.comprador_cumple_caracteristicas(c,p) and p.precio>c.precio_max
 else false end,false);
$$;

create or replace function public.comprador_candidatos_perfil(p_perfil uuid,p_offset integer default 0)
returns table(id uuid,estatus text,operacion text,tipo text,estado text,municipio text,colonia text,precio numeric,moneda text,recamaras integer,banos numeric,estacionamientos integer,m2_construccion numeric,m2_terreno numeric,titulo text,descripcion text,caracteristicas jsonb,lat numeric,lng numeric,distancia_km numeric)
language sql stable security invoker set search_path=pg_catalog,public set jit='off' as $$
 with perfil as materialized (select c.*,public.comprador_filtros(c,false,false)||jsonb_build_object('maximo',c.precio_max*1.10) filtros from public.perfiles_comprador c where c.id=p_perfil and c.activo),
 pagina as materialized (select p.id from public.propiedades p cross join perfil c
 where p.estatus='publicada' and p.fuente='kwmexico' and p.estado=any(public.estados_filtro_equivalentes(array[c.estado]))
 and p.tipo_comprador=any(c.tipos) and p.moneda=c.moneda and p.precio>0 and p.precio between coalesce(c.precio_min,0) and c.precio_max*1.10
 and public.propiedad_cumple_busqueda(p,c.filtros) order by p.id limit 1000 offset greatest(0,p_offset))
 select p.id,p.estatus,c.operacion,p.tipo_comprador,c.estado,p.municipio,p.colonia,p.precio,p.moneda,p.recamaras,p.banos,p.estacionamientos,p.m2_construccion,p.m2_terreno,p.titulo,p.descripcion,p.caracteristicas,p.lat,p.lng,
 case when public.comprador_en_zona(c,p) then null else public.comprador_distancia_zona(c,p) end
 from pagina a join public.propiedades p on p.id=a.id join public.perfiles_comprador c on c.id=p_perfil order by p.id;
$$;
revoke all on function public.comprador_candidatos_perfil(uuid,integer) from public,anon,authenticated;
grant execute on function public.comprador_candidatos_perfil(uuid,integer) to service_role;

-- Extender categorías y tarjetas sin cambiar el contrato de las páginas existentes.
do $$ declare def text; begin
 def:=pg_get_functiondef('public.comprador_guardar_resultados(uuid,uuid,jsonb)'::regprocedure);
 def:=replace(def,'when ''otras_caracteristicas'' then -2 else -3','when ''otras_caracteristicas'' then -2 when ''zonas_cercanas'' then -4 else -3');execute def;
 def:=pg_get_functiondef('public.comprador_matches_pagina(uuid,integer,integer)'::regprocedure);
 def:=replace(def,'when -3 then ''otro_presupuesto'' else','when -3 then ''otro_presupuesto'' when -4 then ''zonas_cercanas'' else');
 def:=replace(def,'to_jsonb(tarjeta)','to_jsonb(tarjeta) || jsonb_build_object(''distancia_km'',case when p_nivel=-4 then (select public.comprador_distancia_zona(c,p) from public.perfiles_comprador c,public.propiedades p where c.id=p_perfil and p.id=r.propiedad_id) end)');execute def;
end $$;
update public.comprador_resultados set vigente=false;
update public.comprador_estados set pendiente=true,revision=gen_random_uuid(),motivo='perfil',total=0,niveles='{}';
notify pgrst,'reload schema';
