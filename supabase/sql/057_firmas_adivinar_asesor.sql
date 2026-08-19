-- Averiguar de qué asesor es cada documento importado.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.
--
-- Los documentos que se trajeron de weetrust quedaron todos a nombre de
-- quien corrió la importación, porque weetrust no dice en su listado
-- quién creó cada uno. En la tabla se ven todos con la misma etiqueta, y
-- así el historial no sirve para saber quién hizo qué.
--
-- Pero el dato sí está, solo que indirecto: en casi todos los contratos
-- del Market Center firman el OP y la MCA, y el otro correo del equipo
-- que aparece entre los firmantes es el del asesor. Esta función busca
-- eso: entre los firmantes, el primero que corresponda a una cuenta del
-- sitio y que no sea uno de los firmantes frecuentes.
--
-- Es una deducción, no un dato: hay documentos donde el asesor no firma,
-- y hay quien firmó con un correo personal que no coincide con su cuenta
-- del sitio. En esos casos no se adivina nada y el documento se queda
-- como estaba, que es preferible a colgárselo a quien no es.

create or replace function public.firmas_adivinar_asesor(p_firmantes jsonb)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from jsonb_array_elements(coalesce(p_firmantes, '[]'::jsonb)) as f
  join public.profiles p
    on lower(p.email) = lower(nullif(trim(f->>'correo'), ''))
  where lower(trim(f->>'correo')) not in (
    select lower(trim(correo)) from public.firmas_frecuentes
  )
  -- Si por lo que sea hay dos asesores firmando, se toma el primero de
  -- la lista, que es el orden en que se capturaron: en un contrato el
  -- asesor que lo arma suele ir antes que el de la contraparte.
  limit 1
$$;

grant execute on function public.firmas_adivinar_asesor(jsonb) to authenticated;

-- ── Arreglar lo que ya está ──
-- Solo los importados: los que se mandaron desde el sitio ya tienen
-- dueño de verdad y no hay nada que adivinar ahí.
update public.firmas_documentos d
set user_id = public.firmas_adivinar_asesor(d.firmantes)
where d.origen = 'importado'
  and public.firmas_adivinar_asesor(d.firmantes) is not null;

-- Los que no se pudieron adivinar se quedan sin dueño en vez de a nombre
-- de quien corrió la importación. Un documento sin dueño solo lo ve el
-- liderazgo, que es más honesto que decir que es de alguien que no lo
-- hizo, y además hace evidente cuáles faltan por identificar.
update public.firmas_documentos d
set user_id = null
where d.origen = 'importado'
  and public.firmas_adivinar_asesor(d.firmantes) is null;
