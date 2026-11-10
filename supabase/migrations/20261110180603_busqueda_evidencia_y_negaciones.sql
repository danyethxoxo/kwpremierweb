
create or replace function public.propiedad_cumple_negaciones(texto text,grupos jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog,public as $$
declare g jsonb; negativos text[]; normal text:=public.propiedad_palabras_normalizar(coalesce(texto,''));
begin
 if grupos is null or jsonb_typeof(grupos)<>'array' then return true; end if;
 for g in select value from jsonb_array_elements(grupos) loop
  if jsonb_typeof(g)<>'array' then return false; end if;
  select array_agg(public.propiedad_palabras_normalizar(value)) into negativos
  from jsonb_array_elements_text(g) where public.propiedad_palabras_normalizar(value) ~ '^(sin|no) ';
  if negativos is not null and not exists(select 1 from unnest(negativos) n where position(n in normal)>0) then return false; end if;
 end loop;
 return true;
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
 and public.propiedad_cumple_negaciones(concat_ws(' ',p.titulo,p.descripcion),$1->'conceptos')
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
    v.asesor_id,v.asesor_nombre,v.market_center,v.created_at,v.updated_at,v.enlace_kw,v.asesor_kw_id,
    case when p_filtros->>'cerca_hospital_m' is not null then (select public.propiedad_hospital_evidencia(base.lat,base.lng,base.descripcion,(p_filtros->>'cerca_hospital_m')::integer) from public.propiedades base where base.id=v.id) end as evidencia_busqueda
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
