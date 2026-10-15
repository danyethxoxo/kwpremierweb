-- Preparar los filtros una vez y generar un plan ajustado a cada búsqueda.
-- Se conserva la validación compartida, la identidad del usuario y RLS.
create or replace function public.propiedades_inventario_filtradas(p_filtros jsonb default '{}')
returns table(id uuid,updated_at timestamptz,precio numeric,m2_construccion numeric,lat numeric,lng numeric)
language plpgsql stable security invoker set search_path=pg_catalog,public set jit=off as $$
declare
 tipos text[]:=public.propiedad_filtro_valores(p_filtros,'tipo');
 estados text[]:=public.estados_filtro_equivalentes(public.propiedad_filtro_valores(p_filtros,'estado'));
 municipios text[]:=public.propiedad_filtro_valores(p_filtros,'municipio');
 colonias text[]:=public.propiedad_filtro_valores(p_filtros,'colonia');
 centros text[]:=public.propiedad_filtro_valores(p_filtros,'marketCenter');
 asesores text[]:=public.propiedad_filtro_valores(p_filtros,'asesor');
 palabras tsquery;
 trazo polygon:=public.propiedad_poligono(p_filtros->'poligono');
begin
 if (select auth.uid()) is null then return; end if;
 if nullif(btrim(p_filtros->>'texto'),'') is not null then
  palabras:=public.propiedad_palabras_consulta(p_filtros->>'texto');
 end if;
 return query execute $query$
  with candidatos as materialized (
   select p.id from public.propiedades p
   where p.fuente='kwmexico'
    and ($2 is null or p.tipo_comprador=any($2))
    and ($3 is null or p.estado=any($3))
    and ($4 is null or p.municipio=any($4))
    and ($5 is null or p.colonia=any($5))
    and ($6 is null or p.market_center=any($6))
    and ($7 is null or p.asesor_nombre=any($7))
    and ($8 is null or p.busqueda_palabras @@ $8)
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
  where public.propiedad_cumple_busqueda(p,$1)
 $query$ using p_filtros,tipos,estados,municipios,colonias,centros,asesores,palabras,trazo;
end $$;

revoke all on function public.propiedades_inventario_filtradas(jsonb) from public,anon;
grant execute on function public.propiedades_inventario_filtradas(jsonb) to authenticated,service_role;
notify pgrst,'reload schema';
