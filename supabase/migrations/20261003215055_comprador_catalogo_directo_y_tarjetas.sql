-- Cálculo interno sin construir tarjetas, enlaces ni imágenes del inventario.
create index if not exists propiedades_comprador_catalogo_idx on public.propiedades(estado,operacion,id) where fuente='kwmexico' and estatus='publicada';
create or replace function public.comprador_catalogo_calculo(p_estado text,p_operacion text,p_offset integer default 0)
returns table(id uuid,estatus text,operacion text,tipo text,tipos_filtro text[],estado text,municipio text,colonia text,precio numeric,moneda text,recamaras integer,banos numeric,estacionamientos integer,m2_construccion numeric,m2_terreno numeric,titulo text,descripcion text,caracteristicas jsonb)
language sql stable security invoker set search_path=pg_catalog set jit='off' as $$
 select p.id,p.estatus,p.operacion,p.tipo,public.propiedad_tipos_filtro(p.tipo,p.titulo),p.estado,p.municipio,p.colonia,p.precio,p.moneda,p.recamaras,p.banos,p.estacionamientos,p.m2_construccion,p.m2_terreno,p.titulo,p.descripcion,p.caracteristicas
 from public.propiedades p where p.fuente='kwmexico' and p.estatus='publicada' and p.estado=p_estado and p.operacion=p_operacion
 order by p.id limit 1000 offset greatest(p_offset,0);
$$;
revoke all on function public.comprador_catalogo_calculo(text,text,integer) from public,anon,authenticated;
grant execute on function public.comprador_catalogo_calculo(text,text,integer) to service_role;
-- Datos del perfil que publicó la propiedad y dirección para las fichas.
do $$ declare definicion text; begin
 definicion:=pg_get_functiondef('public.comprador_matches_pagina(uuid,integer,integer)'::regprocedure);
 definicion:=replace(definicion,'p.miniatura_url,p.asesor_nombre,p.market_center,p.enlace_kw','p.miniatura_url,p.asesor_nombre,p.market_center,p.enlace_kw,p.asesor_kw_id,p.calle,p.cp,p.pais');
 execute definicion;
end; $$;
notify pgrst,'reload schema';
