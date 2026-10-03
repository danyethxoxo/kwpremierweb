-- Cuatro tarjetas por página, conservando permisos y consulta selectiva.
do $$ declare definicion text; begin
 definicion:=pg_get_functiondef('public.comprador_matches_pagina(uuid,integer,integer)'::regprocedure);
 definicion:=replace(definicion,'limit 5 offset','limit 4 offset');
 execute definicion;
end; $$;
notify pgrst,'reload schema';
