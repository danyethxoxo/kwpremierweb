do $migration$
declare definition text; original text := 'and public.propiedad_cumple_negaciones(concat_ws('' '',p.titulo,p.descripcion),$1->''conceptos'')';
begin
select pg_get_functiondef('public.propiedades_inventario_filtradas(jsonb)'::regprocedure) into definition;
if position(original in definition)=0 then raise exception 'Definicion no coincide'; end if;
definition := replace(definition,original,'and case when $1->''conceptos'' is null or jsonb_typeof($1->''conceptos'') <> ''array'' or $1->''conceptos'' = ''[]''::jsonb then true else public.propiedad_cumple_negaciones(concat_ws('' '',p.titulo,p.descripcion),$1->''conceptos'') end');
execute definition;
end $migration$;