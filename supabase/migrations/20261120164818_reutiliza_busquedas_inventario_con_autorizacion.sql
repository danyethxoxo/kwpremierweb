set lock_timeout='3s';
do $migration$ declare definition text; begin
select pg_get_functiondef('public.propiedades_inventario_pagina(jsonb,integer)'::regprocedure) into definition;
if definition not like '%with pagina as materialized%' then raise exception 'Definicion no coincide'; end if;
execute replace(definition,'public.propiedades_inventario_pagina(', 'private.propiedades_pagina_calcular(');
end $migration$;
revoke all on function private.propiedades_pagina_calcular(jsonb,integer) from public,anon,authenticated;
create or replace function public.propiedades_inventario_pagina(p_filtros jsonb default '{}',p_pagina integer default 1)
returns jsonb language plpgsql volatile security definer set search_path='' set jit=off as $function$
declare cache_clave text; resultado jsonb; actualizado timestamptz; bloqueo bigint;
begin
 if (select auth.uid()) is null or not (select public.mfa_sesion_autorizada()) then
 raise exception 'Se requiere una sesion autorizada' using errcode='42501'; end if;
 cache_clave:='pagina:'||pg_catalog.md5(pg_catalog.jsonb_build_array(p_filtros,least(greatest(p_pagina,1),100000))::text);
 select c.datos,c.actualizado_en into resultado,actualizado from private.propiedades_catalogos_cache c where c.clave=cache_clave;
 if actualizado > clock_timestamp()-interval '20 seconds' then return resultado; end if;
 bloqueo:=pg_catalog.hashtextextended(cache_clave,0);
 if resultado is not null then
  if not pg_catalog.pg_try_advisory_xact_lock(bloqueo) then return resultado; end if;
 else
  perform pg_catalog.pg_advisory_xact_lock(bloqueo);
 end if;
 select c.datos,c.actualizado_en into resultado,actualizado from private.propiedades_catalogos_cache c where c.clave=cache_clave;
 if actualizado > clock_timestamp()-interval '20 seconds' then return resultado; end if;
 resultado:=private.propiedades_pagina_calcular(p_filtros,p_pagina);
 insert into private.propiedades_catalogos_cache(clave,datos,actualizado_en)
 values(cache_clave,resultado,clock_timestamp()) on conflict(clave) do update set datos=excluded.datos,actualizado_en=excluded.actualizado_en;
 delete from private.propiedades_catalogos_cache where clave in
 (select c.clave from private.propiedades_catalogos_cache c where c.actualizado_en < clock_timestamp()-interval '1 day' limit 20);
 return resultado;
end $function$;
revoke all on function public.propiedades_inventario_pagina(jsonb,integer) from public,anon;
grant execute on function public.propiedades_inventario_pagina(jsonb,integer) to authenticated;

