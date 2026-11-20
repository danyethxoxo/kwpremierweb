set lock_timeout='3s'; create index if not exists propiedades_inicio_reciente_idx on public.propiedades(fuente,estatus,created_at desc nulls last,id); do $migration$ declare previous text; begin select regexp_replace(prosrc,';[[:space:]]*$','') into previous from pg_proc where oid='public.propiedades_inventario_pagina(jsonb,integer)'::regprocedure; if previous not like '%with candidatos as materialized%' then raise exception 'Definicion no coincide'; end if; execute format($ddl$
create or replace function public.propiedades_inventario_pagina(p_filtros jsonb default '{}',p_pagina integer default 1)
returns jsonb language plpgsql stable set search_path=pg_catalog,public set jit=off as $body$
begin
if (select auth.uid()) is null then return jsonb_build_object('total',0,'data','[]'::jsonb); end if;
if coalesce(p_filtros->>'orden','reciente')='reciente'
and coalesce(p_filtros->>'estatus','')='publicada'
and not exists (select 1 from jsonb_each(p_filtros) f where f.key not in ('orden','estatus') and f.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'0'::jsonb)) then
return (
with pagina as materialized (
 select id,created_at from public.propiedades where fuente='kwmexico' and estatus='publicada'
 order by created_at desc nulls last,id limit 20 offset (least(greatest(p_pagina,1),100000)-1)*20
), tarjetas as (
 select p.created_at,p.id,to_jsonb(v)-'descripcion'-'lat'-'lng'-'tipos_filtro' as tarjeta
 from pagina p join public.propiedades_inventario v on v.id=p.id
)
select jsonb_build_object('total',(select count(*) from public.propiedades where fuente='kwmexico' and estatus='publicada'),
 'data',coalesce((select jsonb_agg(tarjeta order by created_at desc nulls last,id) from tarjetas),'[]'::jsonb))
);
end if;
return (%s);
end $body$;
$ddl$,previous);
end $migration$;