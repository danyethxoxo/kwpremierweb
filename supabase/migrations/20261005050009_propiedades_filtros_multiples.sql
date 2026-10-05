create or replace function public.propiedad_filtro_valores(p_filtros jsonb,p_campo text)
returns text[] language sql immutable parallel safe security invoker set search_path=pg_catalog,public as $$
 select case when jsonb_typeof(p_filtros->p_campo)='array' then
   (select array_agg(v) from jsonb_array_elements_text(p_filtros->p_campo) v where v<>'')
 else case when nullif(p_filtros->>p_campo,'') is not null then array[p_filtros->>p_campo] end end
$$;
revoke all on function public.propiedad_filtro_valores(jsonb,text) from public,anon;
grant execute on function public.propiedad_filtro_valores(jsonb,text) to authenticated,service_role;
do $$ declare definicion text; campo text; columna text; anterior text; nuevo text; begin
 definicion:=pg_get_functiondef('public.propiedades_inventario_pagina(jsonb,integer)'::regprocedure);
 foreach campo in array array['operacion','marketCenter','asesor','estado','municipio','colonia'] loop
   columna:=case campo when 'marketCenter' then 'market_center' when 'asesor' then 'asesor_nombre' else campo end;
   anterior:=format('(nullif(p_filtros->>%L,%L) is null or p.%s=p_filtros->>%L)',campo,'',columna,campo);
   nuevo:=format('(public.propiedad_filtro_valores(p_filtros,%L) is null or p.%s=any(public.propiedad_filtro_valores(p_filtros,%L)))',campo,columna,campo);
   if strpos(definicion,anterior)=0 then raise exception 'No se encontró el filtro %',campo;end if;
   definicion:=replace(definicion,anterior,nuevo);
 end loop;
 anterior:='(nullif(p_filtros->>''tipo'','''') is null or public.propiedad_tipos_filtro(p.tipo,p.titulo) @> array[p_filtros->>''tipo''])';
 nuevo:='(public.propiedad_filtro_valores(p_filtros,''tipo'') is null or public.propiedad_tipos_filtro(p.tipo,p.titulo) && public.propiedad_filtro_valores(p_filtros,''tipo''))';
 if strpos(definicion,anterior)=0 then raise exception 'No se encontró el filtro tipo';end if;
 execute replace(definicion,anterior,nuevo);
end; $$;
notify pgrst,'reload schema';
