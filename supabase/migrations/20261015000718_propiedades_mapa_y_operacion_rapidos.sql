-- Clasificar la operación al guardar el inmueble, no al dibujar miles de pines.
alter table public.propiedades add column operaciones_busqueda text[] generated always as
 (public.propiedad_operaciones_filtro(operacion,titulo,descripcion)) stored;
create index propiedades_operaciones_busqueda_idx on public.propiedades using gin(operaciones_busqueda);

do $$
declare definicion text; nueva text;
begin
 definicion:=pg_get_viewdef('public.propiedades_inventario'::regclass,true);
 nueva:=regexp_replace(definicion,'(public\.)?propiedad_operaciones_filtro\((p\.)?operacion, (p\.)?titulo, (p\.)?descripcion\)','p.operaciones_busqueda','g');
 if nueva<>definicion then
  execute 'create or replace view public.propiedades_inventario with(security_invoker=true) as '||nueva;
 end if;

 definicion:=pg_get_functiondef('public.propiedades_inventario_filtradas(jsonb)'::regprocedure);
 nueva:=replace(definicion,'palabras tsquery;', $decl$
 palabras tsquery;
 operaciones text[];
 validar boolean;
 $decl$);
 if nueva=definicion then raise exception 'No se encontro la preparacion de filtros'; end if;
 definicion:=nueva;
 nueva:=replace(definicion,'return query execute', $prep$
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
 $prep$);
 nueva:=replace(nueva,'and ($8 is null or p.busqueda_palabras @@ $8)',
  'and ($8 is null or p.busqueda_palabras @@ $8)
   and ($10 is null or p.operaciones_busqueda && $10)
   and (nullif($1->>''moneda'','''') is null or p.moneda=$1->>''moneda'')');
 nueva:=replace(nueva,'where public.propiedad_cumple_busqueda(p,$1)','where (not $11 or public.propiedad_cumple_busqueda(p,$1))');
 nueva:=replace(nueva,'asesores,palabras,trazo;','asesores,palabras,trazo,operaciones,validar;');
 if strpos(nueva,'not $11')=0 or strpos(nueva,'trazo,operaciones,validar;')=0 then raise exception 'No se encontro la validacion residual'; end if;
 execute nueva;
end $$;

notify pgrst,'reload schema';
