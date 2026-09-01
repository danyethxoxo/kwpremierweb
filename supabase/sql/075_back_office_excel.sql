-- ═════════════════════════════════════════════════════════════
-- 075 · Reconocer las hojas de Back Office del Excel
-- ═════════════════════════════════════════════════════════════
--
-- Algunos libros llaman la pestaña “Back Office Activos”. La detección
-- anterior podía guardarla como hoja genérica porque también encontraba
-- la palabra “activos”. Normalizamos esas claves y reparamos únicamente
-- las filas del Excel cuyo estatus nunca fue fijado a mano.

create or replace function public.asesores_estatus_de_hoja(p_hoja text)
returns text
language sql
immutable
set search_path = public
as $$
  with nombre as (
    select lower(regexp_replace(coalesce(trim(p_hoja), ''), '[ _-]+', '', 'g')) as valor
  )
  select case
    when valor like '%backoffice%' and valor like '%baja%' then 'back_office_baja'
    when valor like '%backoffice%' then 'back_office_activo'
    when valor in ('activos', 'celulas') then 'asesor_activo'
    when valor = 'bajas' then 'asesor_baja'
    when valor = '' then 'asesor_activo'
    else lower(trim(p_hoja))
  end
  from nombre;
$$;

update public.asesores
set grupo = case
  when lower(regexp_replace(coalesce(grupo, '') || ' ' || coalesce(hoja, ''), '[ _-]+', '', 'g')) like '%baja%'
    then 'back_office_baja'
  else 'back_office_activo'
end
where origen = 'excel'
  and not coalesce(fijado, false)
  and lower(regexp_replace(coalesce(grupo, '') || ' ' || coalesce(hoja, ''), '[ _-]+', '', 'g')) like '%backoffice%';
