-- Evitar consultas y agregados JSON repetidos por cada propiedad del catálogo.
-- Los rechazos baratos se evalúan antes de interpretar operación y características.
create or replace function public.propiedad_cumple_busqueda(p public.propiedades,f jsonb) returns boolean
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare campo text; valores jsonb; actual text; requerido numeric; disponible numeric; operaciones text[];
begin
 if p.fuente is distinct from 'kwmexico' then return false; end if;
 actual:=nullif(f->>'estatus','');
 if actual is not null and (p.estatus is null or case when actual='inactiva' then p.estatus='publicada' else p.estatus<>actual end) then return false; end if;
 if nullif(f->>'moneda','') is not null and p.moneda is distinct from f->>'moneda' then return false; end if;
 foreach campo in array array['tipo','municipio','colonia','estado'] loop
  valores:=f->campo;
  if valores is null or valores in ('null'::jsonb,'[]'::jsonb,'""'::jsonb) then continue; end if;
  if jsonb_typeof(valores)<>'array' then valores:=jsonb_build_array(valores); end if;
  actual:=case campo when 'tipo' then p.tipo_comprador when 'municipio' then p.municipio when 'colonia' then p.colonia else p.estado end;
  if actual is not null and valores ? actual then continue; end if;
  if campo='estado' and lower(trim(actual)) in ('cdmx','ciudad de méxico','ciudad de mexico')
   and valores ?| array['CDMX','Ciudad de México','Ciudad de Mexico','cdmx','CIUDAD DE MÉXICO','CIUDAD DE MEXICO'] then continue; end if;
  return false;
 end loop;
 foreach campo in array array['minimo','maximo','recamaras','recamarasMax','banos','estacionamientos','m2Min','m2Max'] loop
  requerido:=coalesce(nullif(f->>campo,'')::numeric,0);
  if requerido<=0 then continue; end if;
  disponible:=case when campo in ('minimo','maximo') then p.precio when campo in ('recamaras','recamarasMax') then p.recamaras
   when campo='banos' then p.banos when campo='estacionamientos' then p.estacionamientos
   when p.tipo_comprador='Terreno' then p.m2_terreno else p.m2_construccion end;
  if disponible is null then return false; end if;
  if campo in ('maximo','recamarasMax','m2Max') then
   if disponible>requerido then return false; end if;
  elsif disponible<requerido then return false;
  end if;
 end loop;
 valores:=f->'operacion';
 if valores is not null and valores not in ('null'::jsonb,'[]'::jsonb,'""'::jsonb) then
  if jsonb_typeof(valores)<>'array' then valores:=jsonb_build_array(valores); end if;
  operaciones:=public.propiedad_operaciones_filtro(p.operacion,p.titulo,p.descripcion);
  if not ((valores ? 'venta' and 'venta'=any(operaciones)) or (valores ? 'renta' and 'renta'=any(operaciones))) then return false; end if;
 end if;
 return true;
end; $$;
notify pgrst,'reload schema';
