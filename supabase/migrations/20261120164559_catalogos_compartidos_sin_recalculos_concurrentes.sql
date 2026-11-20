set lock_timeout='3s';
create table if not exists private.propiedades_catalogos_cache (
 clave text primary key, datos jsonb not null, actualizado_en timestamptz not null default clock_timestamp()
);
alter table private.propiedades_catalogos_cache enable row level security;
revoke all on private.propiedades_catalogos_cache from public,anon,authenticated;
do $migration$ declare definition text; begin
select pg_get_functiondef('public.propiedades_inventario_catalogo(text,text,text,text)'::regprocedure) into definition;
if definition not like '%declare resultado jsonb%' then raise exception 'Definicion original no coincide'; end if;
execute replace(definition,'public.propiedades_inventario_catalogo(', 'private.propiedades_catalogo_calcular(');
end $migration$;
revoke all on function private.propiedades_catalogo_calcular(text,text,text,text) from public,anon,authenticated;
create or replace function public.propiedades_inventario_catalogo(p_campo text,p_mc text default null,p_estado text default null,p_municipio text default null)
returns jsonb language plpgsql volatile security definer set search_path='' set jit=off as $function$
declare clave text; resultado jsonb; actualizado timestamptz; bloqueo bigint;
begin
 if (select auth.uid()) is null or not (select public.mfa_sesion_autorizada()) then
 raise exception 'Se requiere una sesion autorizada' using errcode='42501'; end if;
 if p_campo not in ('colonia','tipos_filtro','market_center','asesor_nombre','estado','municipio')
 or coalesce(length(p_mc),0)>250 or coalesce(length(p_estado),0)>250 or coalesce(length(p_municipio),0)>250 then
 raise exception 'Campo de catalogo no permitido' using errcode='22023'; end if;
 clave:=pg_catalog.md5(pg_catalog.jsonb_build_array(p_campo,nullif(p_mc,''),nullif(p_estado,''),nullif(p_municipio,''))::text);
 select c.datos,c.actualizado_en into resultado,actualizado from private.propiedades_catalogos_cache c where c.clave=clave;
 if actualizado > clock_timestamp()-interval '2 minutes' then return resultado; end if;
 bloqueo:=pg_catalog.hashtextextended('catalogo:'||clave,0);
 if resultado is not null then
  if not pg_catalog.pg_try_advisory_xact_lock(bloqueo) then return resultado; end if;
 else
  perform pg_catalog.pg_advisory_xact_lock(bloqueo);
 end if;
 select c.datos,c.actualizado_en into resultado,actualizado from private.propiedades_catalogos_cache c where c.clave=clave;
 if actualizado > clock_timestamp()-interval '2 minutes' then return resultado; end if;
 resultado:=private.propiedades_catalogo_calcular(p_campo,p_mc,p_estado,p_municipio);
 insert into private.propiedades_catalogos_cache as c(clave,datos,actualizado_en)
 values(clave,resultado,clock_timestamp()) on conflict(clave) do update set datos=excluded.datos,actualizado_en=excluded.actualizado_en;
 return resultado;
end $function$;
revoke all on function public.propiedades_inventario_catalogo(text,text,text,text) from public,anon;
grant execute on function public.propiedades_inventario_catalogo(text,text,text,text) to authenticated;

