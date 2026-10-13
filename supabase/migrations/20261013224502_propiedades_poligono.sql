-- Poligono nativo de PostgreSQL: consultas de puntos sin incorporar PostGIS.
create or replace function public.propiedad_poligono(p_vertices jsonb)
returns polygon language plpgsql immutable security invoker
set search_path=pg_catalog,public as $$
declare v jsonb; puntos text[] := '{}'; x numeric; y numeric; anterior_x numeric; anterior_y numeric;
 primero_x numeric; primero_y numeric; area numeric := 0;
begin
 if p_vertices is null or p_vertices='null'::jsonb then return null; end if;
 if jsonb_typeof(p_vertices)<>'array' then raise exception 'El poligono debe ser una lista de vertices' using errcode='22023'; end if;
 if jsonb_array_length(p_vertices) not between 3 and 200 then raise exception 'Usa entre 3 y 200 vertices' using errcode='22023'; end if;
 for v in select value from jsonb_array_elements(p_vertices) loop
  if jsonb_typeof(v)<>'array' then raise exception 'Vertice invalido' using errcode='22023'; end if;
  if jsonb_array_length(v)<>2 or jsonb_typeof(v->0)<>'number' or jsonb_typeof(v->1)<>'number' then raise exception 'Coordenadas invalidas' using errcode='22023'; end if;
  x := (v->>0)::numeric; y := (v->>1)::numeric;
  if x not between -180 and 180 or y not between -85.05112878 and 85.05112878 then raise exception 'Coordenadas fuera de rango' using errcode='22023'; end if;
  if primero_x is null then primero_x:=x; primero_y:=y; else area:=area+anterior_x*y-x*anterior_y; end if;
  anterior_x:=x; anterior_y:=y;
  puntos:=array_append(puntos,format('(%s,%s)',x,y));
 end loop;
 area:=area+anterior_x*primero_y-primero_x*anterior_y;
 if abs(area)<0.000000000001 then raise exception 'La zona debe tener superficie' using errcode='22023'; end if;
 return ('('||array_to_string(puntos,',')||')')::polygon;
end;
$$;
revoke all on function public.propiedad_poligono(jsonb) from public,anon;
grant execute on function public.propiedad_poligono(jsonb) to authenticated,service_role;

-- El listado y el mapa siguen usando el mismo predicado y las mismas RLS.
do $migracion$
declare definicion text; anterior text; nuevo text;
begin
 definicion:=pg_get_functiondef('public.propiedades_inventario_filtradas(jsonb)'::regprocedure);
 if strpos(definicion,'public.propiedad_poligono')>0 then return; end if;
 anterior:='select p.id,p.updated_at,p.precio,p.m2_construccion,p.lat,p.lng from public.propiedades p';
 nuevo:='with area as materialized (select public.propiedad_poligono(p_filtros->''poligono'') as trazo)
 select p.id,p.updated_at,p.precio,p.m2_construccion,p.lat,p.lng from public.propiedades p cross join area a';
 if strpos(definicion,anterior)=0 then raise exception 'Consulta compartida no reconocida'; end if;
 definicion:=replace(definicion,anterior,nuevo);
 anterior:='lower(concat_ws('' '',p.titulo,p.asesor_nombre,p.calle,p.colonia,p.municipio,p.estado,p.tipo,p.market_center)),lower(p_filtros->>''texto'')';
 nuevo:='translate(lower(concat_ws('' '',p.titulo,p.asesor_nombre,p.calle,p.colonia,p.municipio,p.estado,p.tipo,p.market_center)),''áéíóúüñ'',''aeiouun''),translate(lower(p_filtros->>''texto''),''áéíóúüñ'',''aeiouun'')';
 if strpos(definicion,anterior)=0 then raise exception 'Busqueda de texto no reconocida'; end if;
 definicion:=replace(definicion,anterior,nuevo);
 -- Insertar al principio del WHERE, dentro del cuerpo SQL de la funcion.
 definicion:=replace(definicion,'where p.fuente=', 'where (a.trazo is null or point(p.lng::double precision,p.lat::double precision) <@ a.trazo) and p.fuente=');
 execute definicion;
end;
$migracion$;
notify pgrst,'reload schema';
