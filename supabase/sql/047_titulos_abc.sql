-- Fase 47: renombra las dos tarjetas del ABC en Documentos Internos.
--
-- Los títulos viven en la tabla documentos_internos (044), no en el
-- HTML: por eso hace falta esta migración en vez de solo tocar código.
-- Solo actualiza el título de las filas que ya existen; no toca
-- descripción, href, icono, orden ni roles. Es idempotente: correrla
-- de nuevo deja el mismo resultado.
--
-- Ejecutar en Supabase Dashboard > SQL Editor.

update public.documentos_internos
   set titulo = 'ABC de la Tecnología'
 where id = 'abc-tracker';

update public.documentos_internos
   set titulo = 'Constancia del ABC para 100%'
 where id = 'abc';

-- Comprobación.
select id, titulo from public.documentos_internos where id in ('abc-tracker', 'abc');
