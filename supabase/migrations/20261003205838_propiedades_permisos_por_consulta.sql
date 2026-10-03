-- Las comprobaciones independientes de la fila se resuelven una vez por consulta.
alter policy select_publicadas on public.propiedades using (
 (select public.is_staff_or_above()) or
 (estatus='publicada' and ((select auth.uid()) is not null or fuente<>'kwmexico'))
);

-- La vista de tarjetas no se recorre para contar ni ordenar todo el inventario.
create or replace function public.propiedades_inventario_pagina(p_filtros jsonb default '{}',p_pagina integer default 1)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 with candidatos as materialized (
  select p.id,p.updated_at,p.precio,p.m2_construccion from public.propiedades p
  where p.fuente='kwmexico'
   and (nullif(p_filtros->>'operacion','') is null or p.operacion=p_filtros->>'operacion')
   and (nullif(p_filtros->>'estatus','') is null or
    case when p_filtros->>'estatus'='inactiva' then p.estatus<>'publicada' else p.estatus=p_filtros->>'estatus' end)
   and (nullif(p_filtros->>'tipo','') is null or public.propiedad_tipos_filtro(p.tipo,p.titulo) @> array[p_filtros->>'tipo'])
   and (nullif(p_filtros->>'marketCenter','') is null or p.market_center=p_filtros->>'marketCenter')
   and (nullif(p_filtros->>'asesor','') is null or p.asesor_nombre=p_filtros->>'asesor')
   and (nullif(p_filtros->>'estado','') is null or p.estado=p_filtros->>'estado')
   and (nullif(p_filtros->>'municipio','') is null or p.municipio=p_filtros->>'municipio')
   and (nullif(p_filtros->>'colonia','') is null or p.colonia=p_filtros->>'colonia')
   and (nullif(p_filtros->>'minimo','') is null or p.precio>=(p_filtros->>'minimo')::numeric)
   and (nullif(p_filtros->>'maximo','') is null or p.precio<=(p_filtros->>'maximo')::numeric)
   and (nullif(p_filtros->>'recamaras','') is null or p.recamaras>=(p_filtros->>'recamaras')::numeric)
   and (nullif(p_filtros->>'recamarasMax','') is null or p.recamaras<=(p_filtros->>'recamarasMax')::numeric)
   and (nullif(p_filtros->>'banos','') is null or p.banos>=(p_filtros->>'banos')::numeric)
   and (nullif(p_filtros->>'estacionamientos','') is null or p.estacionamientos>=(p_filtros->>'estacionamientos')::numeric)
   and (nullif(p_filtros->>'m2Min','') is null or p.m2_construccion>=(p_filtros->>'m2Min')::numeric)
   and (nullif(p_filtros->>'m2Max','') is null or p.m2_construccion<=(p_filtros->>'m2Max')::numeric)
   and (nullif(p_filtros->>'texto','') is null or strpos(lower(concat_ws(' ',p.titulo,p.asesor_nombre,p.calle,p.colonia,p.municipio,p.estado,p.tipo,p.market_center)),lower(p_filtros->>'texto'))>0)
 ), pagina as materialized (
  select * from candidatos order by
   case when p_filtros->>'orden'='precio-asc' then precio end asc nulls last,
   case when p_filtros->>'orden'='precio-desc' then precio end desc nulls first,
   case when p_filtros->>'orden'='m2-desc' then m2_construccion end desc nulls first,
   case when coalesce(p_filtros->>'orden','reciente') not in ('precio-asc','precio-desc','m2-desc') then updated_at end desc,
   id asc limit 20 offset (least(greatest(p_pagina,1),100000)-1)*20
 ), tarjetas as (
  select p.id,to_jsonb(t) as tarjeta from pagina p cross join lateral (
   select v.id,v.fuente,v.fuente_id,v.titulo,v.operacion,v.estatus,v.tipo,v.precio,v.moneda,
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
   case when coalesce(p_filtros->>'orden','reciente') not in ('precio-asc','precio-desc','m2-desc') then p.updated_at end desc,p.id)
   from tarjetas t join pagina p on p.id=t.id),'[]'::jsonb));
$$;
revoke all on function public.propiedades_inventario_pagina(jsonb,integer) from public,anon;
grant execute on function public.propiedades_inventario_pagina(jsonb,integer) to authenticated,service_role;
notify pgrst,'reload schema';
