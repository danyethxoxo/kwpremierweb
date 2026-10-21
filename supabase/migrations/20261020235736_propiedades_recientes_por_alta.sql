CREATE OR REPLACE FUNCTION public.propiedades_inventario_pagina(p_filtros jsonb DEFAULT '{}'::jsonb, p_pagina integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
 SET jit TO 'off'
AS $function$
 with candidatos as materialized (
  select p.id,alta.created_at,p.updated_at,p.precio,p.m2_construccion from public.propiedades_inventario_filtradas(p_filtros) p join public.propiedades alta on alta.id=p.id ), pagina as materialized (
  select * from candidatos order by
   case when p_filtros->>'orden'='precio-asc' then precio end asc nulls last,
   case when p_filtros->>'orden'='precio-desc' then precio end desc nulls first,
   case when p_filtros->>'orden'='m2-desc' then m2_construccion end desc nulls first,
   case when coalesce(p_filtros->>'orden','reciente') not in ('precio-asc','precio-desc','m2-desc') then created_at end desc nulls last,
   id asc limit 20 offset (least(greatest(p_pagina,1),100000)-1)*20
 ), tarjetas as (
  select p.id,to_jsonb(t) as tarjeta from pagina p cross join lateral (
   select v.id,v.fuente,v.fuente_id,v.titulo,v.operacion,v.operaciones_filtro,v.estatus,v.tipo,v.precio,v.moneda,
    v.recamaras,v.banos,v.estacionamientos,v.m2_construccion,v.m2_terreno,v.calle,v.colonia,
    v.municipio,v.estado,v.cp,v.pais,v.imagenes,v.miniatura_url,v.caracteristicas,
    v.asesor_id,v.asesor_nombre,v.market_center,v.updated_at,v.enlace_kw,v.asesor_kw_id
   from public.propiedades_inventario v where v.id=p.id limit 1
  ) t
 )
 select jsonb_build_object('total',(select count(*) from candidatos),
  'data',coalesce((select jsonb_agg(t.tarjeta order by
   case when p_filtros->>'orden'='precio-asc' then p.precio end asc nulls last,
   case when p_filtros->>'orden'='precio-desc' then p.precio end desc nulls first,
   case when p_filtros->>'orden'='m2-desc' then p.m2_construccion end desc nulls first,
   case when coalesce(p_filtros->>'orden','reciente') not in ('precio-asc','precio-desc','m2-desc') then p.created_at end desc nulls last,p.id)
   from tarjetas t join pagina p on p.id=t.id),'[]'::jsonb));
$function$;

notify pgrst,'reload schema';
