do $migration$ declare definition text;begin
 select pg_get_functiondef('public.propiedades_inventario_mapa(jsonb)'::regprocedure) into definition;
 if definition not like '%mapa:%' then raise exception 'Cache no instalada';end if;
 execute replace(definition,'pg_catalog.md5((p_filtros-''orden'')::text)','pg_catalog.md5(pg_catalog.jsonb_build_array(p_filtros)::text)');
end $migration$;
