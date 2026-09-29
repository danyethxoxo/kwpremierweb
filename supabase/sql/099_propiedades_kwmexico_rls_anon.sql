-- Retira la politica anonima anterior, que solo revisaba el estatus y
-- podia volver a exponer el inventario importado por la tabla directa.

drop policy if exists "select_publicadas_anon" on public.propiedades;
