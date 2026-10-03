-- Primero se pagina el indice de coincidencias y despues se leen las tarjetas.
-- LIMIT en el lateral evita recorrer y convertir todo el inventario protegido.
create or replace function public.comprador_matches_pagina(p_perfil uuid,p_nivel integer,p_offset integer default 0)
returns table(porcentaje integer,criterios jsonb,propiedad jsonb)
language sql stable security invoker set search_path=pg_catalog as $$
 with pagina as materialized (
  select r.propiedad_id,r.porcentaje,r.criterios
  from public.comprador_resultados r
  join public.comprador_estados e on e.perfil_id=r.perfil_id
  join public.perfiles_comprador c on c.id=r.perfil_id and c.activo
  where r.perfil_id=p_perfil and r.vigente and (r.porcentaje/10)*10=p_nivel
   and (not e.pendiente or (e.motivo='inventario' and e.calculado_at is not null))
  order by r.porcentaje desc,r.propiedad_id limit 5 offset greatest(p_offset,0)
 )
 select r.porcentaje,r.criterios,to_jsonb(tarjeta) from pagina r
 cross join lateral (
  select p.id,p.fuente_id,p.fuente,p.titulo,p.operacion,p.estatus,p.tipo,p.precio,p.moneda,
   p.recamaras,p.banos,p.estacionamientos,p.m2_construccion,p.m2_terreno,
   p.colonia,p.municipio,p.estado,jsonb_build_array(p.imagenes->>0) as imagenes,
   p.miniatura_url,p.asesor_nombre,p.market_center,p.enlace_kw
  from public.propiedades_inventario p where p.id=r.propiedad_id and p.estatus='publicada'
  limit 1
 ) tarjeta order by r.porcentaje desc,r.propiedad_id;
$$;
revoke all on function public.comprador_matches_pagina(uuid,integer,integer) from public,anon;
grant execute on function public.comprador_matches_pagina(uuid,integer,integer) to authenticated,service_role;

-- Los avisos incluyen la primera busqueda, no solo altas posteriores del inventario.
create or replace function public.comprador_guardar_resultados(p_perfil uuid,p_revision uuid,p_resultados jsonb)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare e public.comprador_estados; c public.perfiles_comprador; niveles_nuevos jsonb; total_nuevo integer;
begin
 select * into e from public.comprador_estados where perfil_id=p_perfil for update;
 if not found or e.revision<>p_revision or not e.pendiente then return false; end if;
 select * into c from public.perfiles_comprador where id=p_perfil;
 update public.comprador_resultados set vigente=false where perfil_id=p_perfil;
 insert into public.comprador_resultados(perfil_id,propiedad_id,asesor_id,porcentaje,criterios,vigente,notificado_at)
 select c.id,r.propiedad_id,c.asesor_id,r.porcentaje,r.criterios,true,null
 from jsonb_to_recordset(p_resultados) as r(propiedad_id uuid,porcentaje integer,criterios jsonb)
 join public.propiedades p on p.id=r.propiedad_id and p.estatus='publicada'
 where c.activo and r.porcentaje>=c.umbral_match
 on conflict(perfil_id,propiedad_id) do update set porcentaje=excluded.porcentaje,criterios=excluded.criterios,vigente=true;
 select count(*) into total_nuevo from public.comprador_resultados where perfil_id=c.id and vigente;
 select coalesce(jsonb_object_agg(nivel,n),'{}') into niveles_nuevos from
 (select (porcentaje/10)*10 as nivel,count(*) as n from public.comprador_resultados where perfil_id=c.id and vigente group by (porcentaje/10)*10) s;
 update public.comprador_estados set total=total_nuevo,niveles=niveles_nuevos,pendiente=false,calculado_at=now(),ultimo_error=null where perfil_id=c.id;
 return true;
end; $$;
revoke all on function public.comprador_guardar_resultados(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.comprador_guardar_resultados(uuid,uuid,jsonb) to service_role;

-- Recuperar coincidencias iniciales que se marcaron enviadas sin crear un aviso.
update public.comprador_resultados r set notificado_at=null
from public.perfiles_comprador c
where c.id=r.perfil_id and c.activo and c.avisos_correo and r.vigente
 and not exists(select 1 from public.notificaciones n where n.user_id=r.asesor_id and n.tipo='comprador_matches');

-- Respetar las preferencias de avisos en todas las consultas del resumen existente.
do $$ declare definicion text; begin
 definicion:=pg_get_functiondef('private.comprador_enviar_resumenes()'::regprocedure);
 definicion:=replace(definicion,'c.activo','c.activo and c.avisos_correo');
 execute definicion;
end; $$;
notify pgrst,'reload schema';
