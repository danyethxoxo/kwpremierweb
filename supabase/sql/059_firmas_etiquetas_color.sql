-- Cambiarle el color a una etiqueta, y quitar las de ejemplo.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

-- ── Cambiar nombre o color ──
-- Sirve para las dos cosas porque van juntas en el menú: se abre para
-- ajustar la etiqueta y desde ahí se toca lo que haga falta.
create or replace function public.firmas_actualizar_etiqueta(
  p_etiqueta uuid,
  p_nombre text default null,
  p_color text default null
)
returns public.firmas_etiquetas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila public.firmas_etiquetas;
begin
  if not public.is_staff_or_above() then
    raise exception 'Solo el equipo de liderazgo puede cambiar las etiquetas';
  end if;

  -- Solo se toca lo que venga: pasar null en un campo quiere decir
  -- "déjalo como está", no "bórralo". Sin esto, cambiar el color desde
  -- el menú le borraría el nombre a la etiqueta.
  update public.firmas_etiquetas
  set nombre = coalesce(nullif(trim(p_nombre), ''), nombre),
      color = coalesce(nullif(trim(p_color), ''), color)
  where id = p_etiqueta
  returning * into v_fila;

  if not found then
    raise exception 'Esa etiqueta no existe';
  end if;
  return v_fila;
end;
$$;

grant execute on function public.firmas_actualizar_etiqueta(uuid, text, text) to authenticated;

-- ── Quitar las de ejemplo ──
-- La migración anterior sembraba tres etiquetas de muestra. Las que
-- sirven de verdad las sabe el Market Center, así que estorban: hay que
-- borrarlas antes de poder armar la lista propia.
--
-- Solo se van las que nadie haya usado todavía. Si alguien ya etiquetó
-- un documento con una de ellas, es que le sirve y se queda.
delete from public.firmas_etiquetas e
where e.nombre in ('Revisado', 'Falta anexo', 'Todo OK')
  and not exists (
    select 1 from public.firmas_documentos d where d.etiquetas @> array[e.id]
  );
