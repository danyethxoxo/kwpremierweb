-- El formulario histórico representa campos numéricos vacíos mediante cero.
-- Un valor no positivo desactiva el filtro, igual que en el filtrado del navegador.
do $$ declare definicion text; campo text; begin
 definicion:=pg_get_functiondef('public.propiedades_inventario_pagina(jsonb,integer)'::regprocedure);
 foreach campo in array array['minimo','maximo','recamaras','recamarasMax','banos','estacionamientos','m2Min','m2Max'] loop
  definicion:=replace(definicion,format('nullif(p_filtros->>%L,%L) is null',campo,''),format('coalesce(nullif(p_filtros->>%L,%L)::numeric,0)<=0',campo,''));
 end loop;
 execute definicion;
end; $$;
notify pgrst,'reload schema';
