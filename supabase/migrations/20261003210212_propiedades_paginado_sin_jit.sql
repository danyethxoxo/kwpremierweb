-- Evitar compilacion JIT para una consulta breve con numerosos filtros opcionales.
alter function public.propiedades_inventario_pagina(jsonb,integer) set jit='off';
