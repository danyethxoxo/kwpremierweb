-- Una sola clasificación para los candidatos, las tarjetas y los avisos.
create or replace function public.comprador_tipo_canonico(valor text) returns text
language sql immutable parallel safe security invoker set search_path=pg_catalog as $$
 select case
 when valor ~ '^(casa|residencia|townhouse)' then 'Casa'
 when valor ~ '^(departamento|departameto|depto|dpto|depa|ph$|penthouse|penhouse)' then 'Departamento'
 when valor ~ '^(terreno|lote)' then 'Terreno'
 when valor ~ '^(oficina|consultorio|coworking)' then 'Oficina'
 when valor ~ '^local' then 'Local comercial' when valor ~ '^bodega' then 'Bodega'
 when valor ~ '^duplex' then 'Duplex' when valor ~ '^nave' then 'Nave industrial'
 when valor ~ '^edificio' then 'Edificio' when valor ~ '^rancho' then 'Rancho'
 when valor ~ '^estacionamiento' then 'Estacionamiento' else '' end;
$$;
create or replace function public.comprador_tipo_validado(tipo text,titulo text) returns text
language plpgsql immutable parallel safe security invoker set search_path=pg_catalog as $$
declare texto text:=public.comprador_normalizar(titulo); palabra text; antes text;
begin
 if texto ~ '\m(casa|residencia)\M.{0,60}\m(adaptada|habilitada|acondicionada|uso)\M.{0,25}\m(oficinas?|comercial)\M' then return 'Oficina'; end if;
 palabra:=substring(texto from '\m(casas?|residencias?|townhouses?|departamentos?|departametos?|deptos?|dptos?|depas?|ph|penthouses?|penhouses?|terrenos?|lotes?|oficinas?|consultorios?|coworking|local(?:es)?|bodegas?|duplex|naves?|edificios?|ranchos?|estacionamientos?)\M');
 if palabra is not null then
  antes:=left(texto,strpos(texto,palabra)-1);
  if antes !~ '\m(calle|colonia|avenida|cerca de|frente a|junto a)\M' then return public.comprador_tipo_canonico(palabra); end if;
 end if;
 return public.comprador_tipo_canonico(public.comprador_normalizar(tipo));
end; $$;
revoke all on function public.comprador_tipo_canonico(text),public.comprador_tipo_validado(text,text) from public,anon;
grant execute on function public.comprador_tipo_canonico(text),public.comprador_tipo_validado(text,text) to authenticated,service_role;
alter table public.propiedades add column tipo_comprador text generated always as (public.comprador_tipo_validado(tipo,titulo)) stored;
create index propiedades_comprador_tipo_validado_idx on public.propiedades(estado,operacion,tipo_comprador,moneda,precio,id) where fuente='kwmexico' and estatus='publicada';

create or replace function public.comprador_en_zona(c public.perfiles_comprador,p public.propiedades) returns boolean
language sql stable security invoker set search_path=pg_catalog as $$
 select public.comprador_normalizar(p.estado)=public.comprador_normalizar(c.estado)
 and (cardinality(c.municipios)=0 or exists(select 1 from unnest(c.municipios) m where public.comprador_normalizar(m)=public.comprador_normalizar(p.municipio)))
 and (jsonb_array_length(c.colonias_seleccionadas)=0 or exists(
  select 1 from jsonb_array_elements(c.colonias_seleccionadas) z
  where public.comprador_normalizar(z->>'colonia')=public.comprador_normalizar(p.colonia)
   and (coalesce(z->>'municipio','')='' or public.comprador_normalizar(z->>'municipio')=public.comprador_normalizar(p.municipio))
   and (coalesce(z->>'estado','')='' or public.comprador_normalizar(z->>'estado')=public.comprador_normalizar(p.estado))));
$$;
create or replace function public.comprador_cumple_caracteristicas(c public.perfiles_comprador,p public.propiedades) returns boolean
language sql stable security invoker set search_path=pg_catalog as $$
 select coalesce(
 (coalesce(c.recamaras_min,0)=0 or p.recamaras>=c.recamaras_min)
 and (coalesce(c.banos_min,0)=0 or p.banos>=c.banos_min)
 and (coalesce(c.estacionamientos_min,0)=0 or p.estacionamientos>=c.estacionamientos_min)
 and (coalesce(c.superficie_min,0)=0 or case when p.tipo_comprador='Terreno' then p.m2_terreno else p.m2_construccion end>=c.superficie_min),false);
$$;
create or replace function public.comprador_requisitos_duros(c public.perfiles_comprador,p public.propiedades) returns boolean
language sql stable security invoker set search_path=pg_catalog as $$
 select coalesce(p.estatus='publicada' and p.operacion=c.operacion and p.tipo_comprador=any(c.tipos)
 and p.moneda=c.moneda and p.precio>0 and p.precio between coalesce(c.precio_min,0) and c.precio_max
 and public.comprador_en_zona(c,p) and public.comprador_cumple_caracteristicas(c,p),false);
$$;
create or replace function public.comprador_categoria_valida(c public.perfiles_comprador,p public.propiedades,categoria text,porcentaje integer) returns boolean
language sql stable security invoker set search_path=pg_catalog as $$
 select coalesce(p.estatus='publicada' and p.operacion=c.operacion and p.tipo_comprador=any(c.tipos)
 and p.estado=c.estado and p.moneda=c.moneda and p.precio>0 and
 case categoria
 when 'fuertes' then porcentaje>=greatest(80,c.umbral_match) and public.comprador_requisitos_duros(c,p)
 when 'otras_zonas' then porcentaje<80 and not public.comprador_en_zona(c,p)
  and p.precio between coalesce(c.precio_min,0) and c.precio_max and public.comprador_cumple_caracteristicas(c,p)
 when 'otras_caracteristicas' then porcentaje<80 and public.comprador_en_zona(c,p) and p.precio between coalesce(c.precio_min,0) and c.precio_max
 when 'otro_presupuesto' then porcentaje<80 and public.comprador_en_zona(c,p) and public.comprador_cumple_caracteristicas(c,p)
  and p.precio>c.precio_max and p.precio<=c.precio_max*1.10
 else false end,false);
$$;
revoke all on function public.comprador_en_zona(public.perfiles_comprador,public.propiedades),public.comprador_cumple_caracteristicas(public.perfiles_comprador,public.propiedades),public.comprador_categoria_valida(public.perfiles_comprador,public.propiedades,text,integer) from public,anon;
grant execute on function public.comprador_en_zona(public.perfiles_comprador,public.propiedades),public.comprador_cumple_caracteristicas(public.perfiles_comprador,public.propiedades),public.comprador_categoria_valida(public.perfiles_comprador,public.propiedades,text,integer) to authenticated,service_role;

-- Filtrar por el tipo corregido conserva el índice y recupera casas mal etiquetadas.
create or replace function public.comprador_catalogo_candidatos(p_estado text,p_operacion text,p_tipos text[],p_moneda text,p_minimo numeric,p_maximo numeric,p_offset integer default 0)
returns table(id uuid,estatus text,operacion text,tipo text,estado text,municipio text,colonia text,precio numeric,moneda text,recamaras integer,banos numeric,estacionamientos integer,m2_construccion numeric,m2_terreno numeric,titulo text,descripcion text,caracteristicas jsonb)
language sql stable security invoker set search_path=pg_catalog set jit='off' as $$
 select p.id,p.estatus,p.operacion,p.tipo_comprador,p.estado,p.municipio,p.colonia,p.precio,p.moneda,p.recamaras,p.banos,p.estacionamientos,p.m2_construccion,p.m2_terreno,p.titulo,p.descripcion,p.caracteristicas
 from public.propiedades p where p.fuente='kwmexico' and p.estatus='publicada' and p.estado=p_estado and p.operacion=p_operacion
 and p.tipo_comprador=any(p_tipos) and p.moneda=p_moneda and p.precio>0 and p.precio between coalesce(p_minimo,0) and p_maximo*1.10
 order by p.id limit 1000 offset greatest(p_offset,0);
$$;

create or replace function public.comprador_guardar_resultados(p_perfil uuid,p_revision uuid,p_resultados jsonb)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare e public.comprador_estados; c public.perfiles_comprador; niveles_nuevos jsonb; total_nuevo integer;
begin
 select * into e from public.comprador_estados where perfil_id=p_perfil for update;
 if not found or e.revision<>p_revision or not e.pendiente then return false; end if;
 select * into c from public.perfiles_comprador where id=p_perfil;
 update public.comprador_resultados set vigente=false where perfil_id=p_perfil;
 insert into public.comprador_resultados(perfil_id,propiedad_id,asesor_id,porcentaje,criterios,categoria,vigente,notificado_at)
 select c.id,r.propiedad_id,c.asesor_id,r.porcentaje,r.criterios,r.categoria,true,null
 from jsonb_to_recordset(p_resultados) as r(propiedad_id uuid,porcentaje integer,criterios jsonb,categoria text)
 join public.propiedades p on p.id=r.propiedad_id
 where c.activo and public.comprador_categoria_valida(c,p,r.categoria,r.porcentaje)
 on conflict(perfil_id,propiedad_id) do update set porcentaje=excluded.porcentaje,criterios=excluded.criterios,categoria=excluded.categoria,vigente=true,
  notificado_at=case when comprador_resultados.categoria<>'fuertes' and excluded.categoria='fuertes' then null else comprador_resultados.notificado_at end;
 select count(*) into total_nuevo from public.comprador_resultados where perfil_id=c.id and vigente;
 select coalesce(jsonb_object_agg(nivel,n),'{}') into niveles_nuevos from
 (select case categoria when 'fuertes' then 80 when 'otras_zonas' then -1 when 'otras_caracteristicas' then -2 else -3 end as nivel,count(*) as n
  from public.comprador_resultados where perfil_id=c.id and vigente group by categoria) s;
 update public.comprador_estados set total=total_nuevo,niveles=niveles_nuevos,pendiente=false,calculado_at=now(),ultimo_error=null where perfil_id=c.id;
 return true;
end; $$;

create or replace function public.comprador_matches_pagina(p_perfil uuid,p_nivel integer,p_offset integer default 0)
returns table(porcentaje integer,criterios jsonb,propiedad jsonb)
language sql stable security invoker set search_path=pg_catalog as $$
 with pagina as materialized (
  select r.propiedad_id,r.porcentaje,r.criterios from public.comprador_resultados r
  join public.comprador_estados e on e.perfil_id=r.perfil_id
  join public.perfiles_comprador c on c.id=r.perfil_id and c.activo
  join public.propiedades p on p.id=r.propiedad_id
  where r.perfil_id=p_perfil and r.vigente
   and r.categoria=case p_nivel when 80 then 'fuertes' when -1 then 'otras_zonas' when -2 then 'otras_caracteristicas' when -3 then 'otro_presupuesto' else '' end
   and public.comprador_categoria_valida(c,p,r.categoria,r.porcentaje)
   and (not e.pendiente or (e.motivo='inventario' and e.calculado_at is not null))
  order by r.porcentaje desc,r.propiedad_id limit 4 offset greatest(p_offset,0)
 )
 select r.porcentaje,r.criterios,to_jsonb(tarjeta) from pagina r cross join lateral (
  select p.id,p.fuente_id,p.fuente,p.titulo,p.operacion,p.estatus,public.comprador_tipo_validado(p.tipo,p.titulo) as tipo,p.precio,p.moneda,
   p.recamaras,p.banos,p.estacionamientos,p.m2_construccion,p.m2_terreno,p.colonia,p.municipio,p.estado,
   jsonb_build_array(p.imagenes->>0) as imagenes,p.miniatura_url,p.asesor_nombre,p.market_center,p.enlace_kw,p.asesor_kw_id,p.calle,p.cp,p.pais
  from public.propiedades_inventario p where p.id=r.propiedad_id and p.estatus='publicada' limit 1
 ) tarjeta order by r.porcentaje desc,r.propiedad_id;
$$;
update public.comprador_resultados set vigente=false;
update public.comprador_estados set pendiente=true,revision=gen_random_uuid(),motivo='perfil',total=0,niveles='{}';
notify pgrst,'reload schema';
