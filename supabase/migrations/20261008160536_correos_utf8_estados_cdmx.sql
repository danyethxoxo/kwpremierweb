create or replace function public.estado_filtro_canonico(valor text)
returns text language sql immutable parallel safe set search_path=pg_catalog
as $$ select case when lower(trim(valor)) in ('cdmx','ciudad de méxico','ciudad de mexico') then 'Ciudad de México' else valor end $$;
create or replace function public.estados_filtro_equivalentes(valores text[])
returns text[] language sql immutable parallel safe set search_path=pg_catalog,public
as $$ select array_agg(distinct alias) from unnest(valores) v cross join lateral unnest(
case when public.estado_filtro_canonico(v)='Ciudad de México' then array['CDMX','Ciudad de México','Ciudad de Mexico','cdmx','CIUDAD DE MÉXICO','CIUDAD DE MEXICO'] else array[v] end
) alias $$;
do $$
declare definicion text;
begin
 select pg_get_functiondef('public.propiedades_inventario_pagina(jsonb,integer)'::regprocedure) into definicion;
 definicion := replace(definicion, 'p.estado=any(public.propiedad_filtro_valores(p_filtros,''estado''))', 'p.estado=any(public.estados_filtro_equivalentes(public.propiedad_filtro_valores(p_filtros,''estado'')))');
 execute definicion;
 select pg_get_functiondef('public.propiedades_inventario_catalogo(text,text,text,text)'::regprocedure) into definicion;
 definicion := replace(definicion,'p.estado = p_estado','public.estado_filtro_canonico(p.estado) = public.estado_filtro_canonico(p_estado)');
 definicion := replace(definicion,'when ''estado'' then p.estado','when ''estado'' then public.estado_filtro_canonico(p.estado)');
 definicion := replace(definicion,'coalesce(p.estado,'''') as estado','coalesce(public.estado_filtro_canonico(p.estado),'''') as estado');
 execute definicion;
 select pg_get_functiondef('public.notificar_inicio_sesion()'::regprocedure) into definicion;
 definicion := replace(replace(replace(replace(definicion,'sesiÃ³n','sesión'),'iniciÃ³','inició'),'MÃ©xico','México'),'contraseÃ±a','contraseña');
 execute definicion;
end $$;
-- Existing platform notices are repaired without sending new notifications.
update public.notificaciones
set titulo=replace(titulo,'sesiÃ³n','sesión'),
mensaje=replace(replace(replace(replace(mensaje,'sesiÃ³n','sesión'),'iniciÃ³','inició'),'MÃ©xico','México'),'contraseÃ±a','contraseña')
where tipo='inicio_sesion' and (titulo like '%Ã%' or mensaje like '%Ã%');
