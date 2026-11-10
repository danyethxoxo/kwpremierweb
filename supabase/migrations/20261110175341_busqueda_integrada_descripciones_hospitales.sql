
-- Search all listing text without rewriting the existing generated column.
create or replace function public.propiedad_texto_busqueda(t text,d text,a text,c text,co text,m text,e text,mc text,f text,cp text)
returns tsvector language sql immutable set search_path=pg_catalog,public as $$
 select to_tsvector('pg_catalog.spanish',public.propiedad_palabras_normalizar(concat_ws(' ',t,d,a,c,co,m,e,mc,f,cp)));
$$;
create index if not exists propiedades_texto_completo_idx on public.propiedades using gin
(public.propiedad_texto_busqueda(titulo,descripcion,asesor_nombre,calle,colonia,municipio,estado,market_center,fuente_id,cp));

create table if not exists public.propiedades_puntos_interes (
 id text primary key, nombre text not null, lat double precision not null check(lat between -90 and 90),
 lng double precision not null check(lng between -180 and 180), fuente text not null,
 consultado_at timestamptz not null, categoria text not null check(categoria='hospital'),
 punto point generated always as (point(lng,lat)) stored
);
create index if not exists propiedades_poi_punto_idx on public.propiedades_puntos_interes using gist(punto);
alter table public.propiedades_puntos_interes enable row level security;
revoke all on public.propiedades_puntos_interes from public,anon,authenticated;
grant select on public.propiedades_puntos_interes to authenticated;
grant all on public.propiedades_puntos_interes to service_role;
create policy hospitales_lectura_autenticada on public.propiedades_puntos_interes for select to authenticated using(true);

create or replace function public.propiedad_consulta_conceptos(grupos jsonb,texto text)
returns tsquery language plpgsql immutable set search_path=pg_catalog,public as $$
declare g jsonb; termino text; q tsquery; alternas tsquery; resultado tsquery;
begin
 if grupos is null or grupos='[]'::jsonb then
  return case when nullif(btrim(texto),'') is not null then public.propiedad_palabras_consulta(texto) end;
 end if;
 if jsonb_typeof(grupos)<>'array' or jsonb_array_length(grupos)>6 then raise exception 'Conceptos inválidos'; end if;
 for g in select value from jsonb_array_elements(grupos) loop
  if jsonb_typeof(g)<>'array' or jsonb_array_length(g) not between 1 and 6 then raise exception 'Concepto inválido'; end if;
  alternas:=null;
  for termino in select value from jsonb_array_elements_text(g) loop
   if length(termino) not between 1 and 80 then raise exception 'Término inválido'; end if;
   q:=plainto_tsquery('pg_catalog.spanish',public.propiedad_palabras_normalizar(termino));
   if numnode(q)>0 then alternas:=case when alternas is null then q else alternas || q end; end if;
  end loop;
  if alternas is not null then resultado:=case when resultado is null then alternas else resultado && alternas end; end if;
 end loop;
 return resultado;
end $$;

create or replace function public.propiedad_hospital_evidencia(plat numeric,plng numeric,descripcion text,radio integer default 1500)
returns jsonb language plpgsql stable set search_path=pg_catalog,public as $$
declare encontrado jsonb; texto text:=public.propiedad_palabras_normalizar(coalesce(descripcion,'')); r integer:=least(greatest(radio,100),10000);
begin
 if plat between -90 and 90 and plng between -180 and 180 then
  select jsonb_build_object('tipo','coordenadas','nombre',h.nombre,'distancia_m',round(h.distancia)::integer,'fuente',h.fuente)
  into encontrado from (
   select p.*,6371000*2*asin(sqrt(least(1.0,
    power(sin(radians(p.lat-plat::float8)/2),2)+cos(radians(plat::float8))*cos(radians(p.lat))*power(sin(radians(p.lng-plng::float8)/2),2)))) as distancia
   from public.propiedades_puntos_interes p where p.categoria='hospital'
    and p.punto <@ box(point(plng::float8-r/(111000.0*greatest(abs(cos(radians(plat::float8))),0.01)),plat::float8-r/110000.0),
                        point(plng::float8+r/(111000.0*greatest(abs(cos(radians(plat::float8))),0.01)),plat::float8+r/110000.0))
  ) h where h.distancia<=r order by h.distancia,h.id limit 1;
  if encontrado is not null then return encontrado; end if;
 end if;
 if texto !~ '(sin|lejos|alejad[oa]|no hay|no esta cerca).{0,55}(hospital|clinica|imss|issste|centro medico)'
 and (texto ~ '(cerca|cercan|proxim|frente|a pasos|a unos pasos|a [0-9]+ (minutos|min|metros|mts)).{0,65}(hospital|clinica|imss|issste|centro medico)'
 or texto ~ '(hospital|clinica|imss|issste|centro medico).{0,45}(cerca|proxim|a pasos|a [0-9]+ (minutos|min|metros|mts))')
 then return jsonb_build_object('tipo','descripcion'); end if;
 return null;
end $$;

CREATE OR REPLACE FUNCTION public.propiedades_inventario_filtradas(p_filtros jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone, precio numeric, m2_construccion numeric, lat numeric, lng numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
 SET jit TO 'off'
AS $function$
declare
 tipos text[]:=public.propiedad_filtro_valores(p_filtros,'tipo');
 estados text[]:=public.estados_filtro_equivalentes(public.propiedad_filtro_valores(p_filtros,'estado'));
 municipios text[]:=public.propiedad_filtro_valores(p_filtros,'municipio');
 colonias text[]:=public.propiedad_filtro_valores(p_filtros,'colonia');
 centros text[]:=public.propiedad_filtro_valores(p_filtros,'marketCenter');
 asesores text[]:=public.propiedad_filtro_valores(p_filtros,'asesor');
 
 palabras tsquery;
 operaciones text[];
 validar boolean;
 
 trazo polygon:=public.propiedad_poligono(p_filtros->'poligono');
begin
 if (select auth.uid()) is null then return; end if;
 palabras:=public.propiedad_consulta_conceptos(p_filtros->'conceptos',p_filtros->>'texto');
 if coalesce((p_filtros->>'sin_coincidencias')::boolean,false) then return; end if;
 
 if p_filtros->'operacion' is not null and p_filtros->'operacion' not in ('null'::jsonb,'[]'::jsonb,'""'::jsonb) then
  operaciones:=array(select o from unnest(public.propiedad_filtro_valores(p_filtros,'operacion')) o where o in ('venta','renta'));
 end if;
 validar:=exists(select 1 from unnest(array['recamaras','recamarasMax','banos','estacionamientos','m2Min','m2Max']) campo
  where coalesce(nullif(p_filtros->>campo,'')::numeric,0)>0);
 -- Valores no seleccionables desde la interfaz también conservan la validación original.
 validar:=validar or exists(select 1 from unnest(array['tipo','estado','municipio','colonia']) campo
  where p_filtros->campo is not null and p_filtros->campo not in ('null'::jsonb,'[]'::jsonb,'""'::jsonb)
   and public.propiedad_filtro_valores(p_filtros,campo) is null);
 return query execute
  $query$
  with candidatos as materialized (
   select p.id from public.propiedades p
   where p.fuente='kwmexico'
    and ($2 is null or p.tipo_comprador=any($2))
    and ($3 is null or p.estado=any($3))
    and ($4 is null or p.municipio=any($4))
    and ($5 is null or p.colonia=any($5))
    and ($6 is null or p.market_center=any($6))
    and ($7 is null or p.asesor_nombre=any($7))
    and ($8 is null or public.propiedad_texto_busqueda(p.titulo,p.descripcion,p.asesor_nombre,p.calle,p.colonia,p.municipio,p.estado,p.market_center,p.fuente_id,p.cp) @@ $8)
   and ($10 is null or p.operaciones_busqueda && $10)
   and (nullif($1->>'moneda','') is null or p.moneda=$1->>'moneda')
    and (nullif($1->>'estatus','') is null or
     case when $1->>'estatus'='inactiva' then p.estatus<>'publicada' else p.estatus=$1->>'estatus' end)
    and (coalesce(nullif($1->>'minimo','')::numeric,0)<=0 or p.precio>=($1->>'minimo')::numeric)
    and (coalesce(nullif($1->>'maximo','')::numeric,0)<=0 or p.precio<=($1->>'maximo')::numeric)
    and ($9 is null or point(p.lng::double precision,p.lat::double precision) <@ $9)
    and ($1->'zona' is null or $1->'zona'='null'::jsonb or (
     jsonb_array_length($1->'zona')=4 and p.lat between ($1->'zona'->>0)::numeric and ($1->'zona'->>2)::numeric
     and p.lng between ($1->'zona'->>1)::numeric and ($1->'zona'->>3)::numeric))
  )
  select p.id,p.updated_at,p.precio,p.m2_construccion,p.lat,p.lng
  from candidatos c join public.propiedades p on p.id=c.id
  where (not $11 or public.propiedad_cumple_busqueda(p,$1))
 and (nullif($1->>'cerca_hospital_m','') is null or public.propiedad_hospital_evidencia(p.lat,p.lng,p.descripcion,($1->>'cerca_hospital_m')::integer) is not null)
 $query$ using p_filtros,tipos,estados,municipios,colonias,centros,asesores,palabras,trazo,operaciones,validar;
end $function$
;
CREATE OR REPLACE FUNCTION public.propiedades_inventario_pagina(p_filtros jsonb DEFAULT '{}'::jsonb, p_pagina integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
 SET jit TO 'off'
AS $function$
 with candidatos as materialized (
  select p.id,alta.created_at,p.updated_at,p.precio,p.m2_construccion from public.propiedades_inventario_filtradas(p_filtros) p join public.propiedades alta on alta.id=p.id ), pagina as materialized (
  select * from candidatos order by
   case when p_filtros->>'orden'='precio-asc' then precio end asc nulls last,
   case when p_filtros->>'orden'='precio-desc' then precio end desc nulls first,
   case when p_filtros->>'orden'='m2-desc' then m2_construccion end desc nulls first,
   case when coalesce(p_filtros->>'orden','reciente') not in ('precio-asc','precio-desc','m2-desc') then created_at end desc nulls last,
   id asc limit 20 offset (least(greatest(p_pagina,1),100000)-1)*20
 ), tarjetas as (
  select p.id,to_jsonb(t) as tarjeta from pagina p cross join lateral (
   select v.id,v.fuente,v.fuente_id,v.titulo,v.operacion,v.operaciones_filtro,v.estatus,v.tipo,v.precio,v.moneda,
    v.recamaras,v.banos,v.estacionamientos,v.m2_construccion,v.m2_terreno,v.calle,v.colonia,
    v.municipio,v.estado,v.cp,v.pais,v.imagenes,v.miniatura_url,v.caracteristicas,
    v.asesor_id,v.asesor_nombre,v.market_center,v.created_at,v.updated_at,v.enlace_kw,v.asesor_kw_id
   from public.propiedades_inventario v where v.id=p.id limit 1
  ) t
 )
 select jsonb_build_object('total',(select count(*) from candidatos),
  'data',coalesce((select jsonb_agg(t.tarjeta order by
   case when p_filtros->>'orden'='precio-asc' then p.precio end asc nulls last,
   case when p_filtros->>'orden'='precio-desc' then p.precio end desc nulls first,
   case when p_filtros->>'orden'='m2-desc' then p.m2_construccion end desc nulls first,
   case when coalesce(p_filtros->>'orden','reciente') not in ('precio-asc','precio-desc','m2-desc') then p.created_at end desc nulls last,p.id)
   from tarjetas t join pagina p on p.id=t.id),'[]'::jsonb));
$function$
;
