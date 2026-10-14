-- Zonas múltiples conservando los perfiles anteriores y sus permisos RLS.
alter table public.perfiles_comprador
 add column municipios text[] not null default '{}',
 add column colonias_seleccionadas jsonb not null default '[]';
update public.perfiles_comprador set municipios=case when municipio<>'' then array[municipio] else '{}'::text[] end,
 colonias_seleccionadas=case when colonias<>'' then jsonb_build_array(jsonb_build_object('estado',estado,'municipio',municipio,'colonia',colonias)) else '[]'::jsonb end;
alter table public.perfiles_comprador
 add constraint comprador_municipios_limite check(cardinality(municipios)<=50 and array_position(municipios,null) is null),
 add constraint comprador_colonias_limite check(jsonb_typeof(colonias_seleccionadas)='array' and jsonb_array_length(colonias_seleccionadas)<=200),
 alter column umbral_match set default 80;
update public.perfiles_comprador set umbral_match=greatest(80,umbral_match);
alter table public.perfiles_comprador add constraint comprador_umbral_fuerte check(umbral_match>=80);

alter table public.comprador_resultados add column categoria text not null default 'fuertes'
 check(categoria in ('fuertes','otras_zonas','otras_caracteristicas','otro_presupuesto'));
create index comprador_resultados_categoria_idx on public.comprador_resultados(perfil_id,categoria,porcentaje desc,propiedad_id) where vigente;

create or replace function public.comprador_normalizar(valor text) returns text
language sql immutable parallel safe security invoker set search_path=pg_catalog as $$
 select trim(regexp_replace(lower(translate(coalesce(valor,''),'ÁÉÍÓÚÜáéíóúü','AEIOUUaeiouu')),'[^a-z0-9]+',' ','g'));
$$;
revoke all on function public.comprador_normalizar(text) from public,anon;
grant execute on function public.comprador_normalizar(text) to authenticated,service_role;

-- Validación compartida de los requisitos duros antes de mostrar o avisar.
create or replace function public.comprador_requisitos_duros(c public.perfiles_comprador,p public.propiedades) returns boolean
language sql stable security invoker set search_path=pg_catalog as $$
 select p.estatus='publicada' and p.operacion=c.operacion and p.tipo=any(c.tipos)
 and public.comprador_normalizar(p.estado)=public.comprador_normalizar(c.estado)
 and p.moneda=c.moneda and p.precio>0 and p.precio between coalesce(c.precio_min,0) and c.precio_max
 and (coalesce(c.recamaras_min,0)=0 or p.recamaras>=c.recamaras_min)
 and (coalesce(c.banos_min,0)=0 or p.banos>=c.banos_min)
 and (coalesce(c.estacionamientos_min,0)=0 or p.estacionamientos>=c.estacionamientos_min)
 and (coalesce(c.superficie_min,0)=0 or case when c.tipos<@array['Terreno']::text[] then p.m2_terreno else p.m2_construccion end>=c.superficie_min)
 and (cardinality(c.municipios)=0 or exists(select 1 from unnest(c.municipios) m where public.comprador_normalizar(m)=public.comprador_normalizar(p.municipio)))
 and (jsonb_array_length(c.colonias_seleccionadas)=0 or exists(
  select 1 from jsonb_array_elements(c.colonias_seleccionadas) z
  where public.comprador_normalizar(z->>'colonia')=public.comprador_normalizar(p.colonia)
   and (coalesce(z->>'municipio','')='' or public.comprador_normalizar(z->>'municipio')=public.comprador_normalizar(p.municipio))
   and (coalesce(z->>'estado','')='' or public.comprador_normalizar(z->>'estado')=public.comprador_normalizar(p.estado))));
$$;
revoke all on function public.comprador_requisitos_duros(public.perfiles_comprador,public.propiedades) from public,anon;
grant execute on function public.comprador_requisitos_duros(public.perfiles_comprador,public.propiedades) to authenticated,service_role;

-- Reducir candidatos en SQL antes del cálculo, sin construir tarjetas ni fotos.
create index propiedades_comprador_candidatos_idx on public.propiedades(estado,operacion,tipo,moneda,precio,id) where fuente='kwmexico' and estatus='publicada';
create or replace function public.comprador_catalogo_candidatos(p_estado text,p_operacion text,p_tipos text[],p_moneda text,p_minimo numeric,p_maximo numeric,p_offset integer default 0)
returns table(id uuid,estatus text,operacion text,tipo text,estado text,municipio text,colonia text,precio numeric,moneda text,recamaras integer,banos numeric,estacionamientos integer,m2_construccion numeric,m2_terreno numeric,titulo text,descripcion text,caracteristicas jsonb)
language sql stable security invoker set search_path=pg_catalog set jit='off' as $$
 select p.id,p.estatus,p.operacion,p.tipo,p.estado,p.municipio,p.colonia,p.precio,p.moneda,p.recamaras,p.banos,p.estacionamientos,p.m2_construccion,p.m2_terreno,p.titulo,p.descripcion,p.caracteristicas
 from public.propiedades p where p.fuente='kwmexico' and p.estatus='publicada' and p.estado=p_estado and p.operacion=p_operacion
 and p.tipo=any(p_tipos) and p.moneda=p_moneda and p.precio>0 and p.precio between coalesce(p_minimo,0) and p_maximo*1.10
 order by p.id limit 1000 offset greatest(p_offset,0);
$$;
revoke all on function public.comprador_catalogo_candidatos(text,text,text[],text,numeric,numeric,integer) from public,anon,authenticated;
grant execute on function public.comprador_catalogo_candidatos(text,text,text[],text,numeric,numeric,integer) to service_role;

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
 join public.propiedades p on p.id=r.propiedad_id and p.estatus='publicada' and p.operacion=c.operacion and p.tipo=any(c.tipos) and p.estado=c.estado and p.moneda=c.moneda
 where c.activo and (
  (r.categoria='fuertes' and r.porcentaje>=greatest(80,c.umbral_match) and public.comprador_requisitos_duros(c,p))
  or (r.categoria in ('otras_zonas','otras_caracteristicas','otro_presupuesto') and r.porcentaje<80))
 on conflict(perfil_id,propiedad_id) do update set porcentaje=excluded.porcentaje,criterios=excluded.criterios,categoria=excluded.categoria,vigente=true,
  notificado_at=case when comprador_resultados.categoria<>'fuertes' and excluded.categoria='fuertes' then null else comprador_resultados.notificado_at end;
 select count(*) into total_nuevo from public.comprador_resultados where perfil_id=c.id and vigente;
 select coalesce(jsonb_object_agg(nivel,n),'{}') into niveles_nuevos from
 (select case categoria when 'fuertes' then 80 when 'otras_zonas' then -1 when 'otras_caracteristicas' then -2 else -3 end as nivel,count(*) as n
  from public.comprador_resultados where perfil_id=c.id and vigente group by categoria) s;
 update public.comprador_estados set total=total_nuevo,niveles=niveles_nuevos,pendiente=false,calculado_at=now(),ultimo_error=null where perfil_id=c.id;
 return true;
end; $$;
revoke all on function public.comprador_guardar_resultados(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.comprador_guardar_resultados(uuid,uuid,jsonb) to service_role;

-- Se conserva la firma del RPC para las pestañas y el aislamiento por asesor.
create or replace function public.comprador_matches_pagina(p_perfil uuid,p_nivel integer,p_offset integer default 0)
returns table(porcentaje integer,criterios jsonb,propiedad jsonb)
language sql stable security invoker set search_path=pg_catalog as $$
 with pagina as materialized (
  select r.propiedad_id,r.porcentaje,r.criterios from public.comprador_resultados r
  join public.comprador_estados e on e.perfil_id=r.perfil_id
  join public.perfiles_comprador c on c.id=r.perfil_id and c.activo
  join public.propiedades p on p.id=r.propiedad_id and p.estatus='publicada'
  where r.perfil_id=p_perfil and r.vigente
   and r.categoria=case p_nivel when 80 then 'fuertes' when -1 then 'otras_zonas' when -2 then 'otras_caracteristicas' when -3 then 'otro_presupuesto' else '' end
   and (r.categoria<>'fuertes' or (r.porcentaje>=greatest(80,c.umbral_match) and public.comprador_requisitos_duros(c,p)))
   and (not e.pendiente or (e.motivo='inventario' and e.calculado_at is not null))
  order by r.porcentaje desc,r.propiedad_id limit 4 offset greatest(p_offset,0)
 )
 select r.porcentaje,r.criterios,to_jsonb(tarjeta) from pagina r cross join lateral (
  select p.id,p.fuente_id,p.fuente,p.titulo,p.operacion,p.estatus,p.tipo,p.precio,p.moneda,
   p.recamaras,p.banos,p.estacionamientos,p.m2_construccion,p.m2_terreno,p.colonia,p.municipio,p.estado,
   jsonb_build_array(p.imagenes->>0) as imagenes,p.miniatura_url,p.asesor_nombre,p.market_center,p.enlace_kw,p.asesor_kw_id,p.calle,p.cp,p.pais
  from public.propiedades_inventario p where p.id=r.propiedad_id and p.estatus='publicada' limit 1
 ) tarjeta order by r.porcentaje desc,r.propiedad_id;
$$;
revoke all on function public.comprador_matches_pagina(uuid,integer,integer) from public,anon;
grant execute on function public.comprador_matches_pagina(uuid,integer,integer) to authenticated,service_role;

-- Los tres pasos del resumen usan la misma selección: solo coincidencias fuertes.
do $$ declare definicion text; begin
 definicion:=pg_get_functiondef('private.comprador_enviar_resumenes()'::regprocedure);
 definicion:=replace(definicion,'r.vigente and r.notificado_at is null',
  'r.vigente and r.categoria=''fuertes'' and r.porcentaje>=greatest(80,c.umbral_match) and public.comprador_requisitos_duros(c,p) and r.notificado_at is null');
 execute definicion;
end; $$;
-- Ocultar resultados antiguos hasta recalcularlos con las nuevas reglas.
update public.comprador_resultados set vigente=false;
update public.comprador_estados set pendiente=true,revision=gen_random_uuid(),motivo='perfil',total=0,niveles='{}';
notify pgrst,'reload schema';
