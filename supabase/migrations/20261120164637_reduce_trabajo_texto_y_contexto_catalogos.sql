do $migration$
declare definition text;
begin
select pg_get_functiondef('public.propiedad_cumple_negaciones(text,jsonb)'::regprocedure) into definition;
if position('normal text:=public.propiedad_palabras_normalizar(coalesce(texto,''''));' in definition)=0 then raise exception 'Definicion no coincide'; end if;
definition:=replace(definition,'normal text:=public.propiedad_palabras_normalizar(coalesce(texto,''''));','normal text;');
definition:=replace(definition,'if negativos is not null and not exists','if negativos is not null and normal is null then normal:=public.propiedad_palabras_normalizar(coalesce(texto,'''')); end if; if negativos is not null and not exists');
execute definition;
select pg_get_functiondef('public.propiedades_inventario_catalogo(text,text,text,text)'::regprocedure) into definition;
definition:=replace(definition,'clave:=pg_catalog.md5','p_mc:=case when p_campo=''asesor_nombre'' then p_mc else null end; p_estado:=case when p_campo in (''colonia'',''municipio'') then p_estado else null end; p_municipio:=case when p_campo in (''colonia'',''estado'') then p_municipio else null end; clave:=pg_catalog.md5');
execute definition;
end $migration$;
