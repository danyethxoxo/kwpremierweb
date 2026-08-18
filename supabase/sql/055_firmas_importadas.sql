-- Traer al sitio el historial que ya existe en weetrust.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.
--
-- El Market Center llevaba tiempo mandando documentos desde el panel de
-- weetrust, antes de que existiera esta pantalla. Esos contratos no
-- tienen renglón aquí, así que el historial del sitio arranca a medias y
-- para ver lo anterior hay que entrar a weetrust.
--
-- La importación los copia como están. Son documentos que ya vivieron su
-- vida allá: no se les puede reconstruir el archivo original ni de dónde
-- salió cada uno, así que se guardan con lo que weetrust todavía sabe de
-- ellos y se marcan como importados para no confundirlos con los que sí
-- nacieron aquí.

-- 1) Un origen más.
alter table public.firmas_documentos
  drop constraint if exists firmas_documentos_origen_check;
alter table public.firmas_documentos
  add constraint firmas_documentos_origen_check
  check (origen in ('subido', 'guardado', 'plantilla', 'importado'));

-- 2) Un documento importado no tiene archivo en nuestro bucket: el PDF
--    vive en weetrust y de allá se consulta. Por eso la ruta deja de ser
--    obligatoria; para todo lo que se manda desde el sitio se sigue
--    llenando igual.
alter table public.firmas_documentos
  alter column archivo_ruta drop not null;

-- 3) Quién lo mandó, según weetrust. Aquí no se puede usar user_id: esos
--    documentos se crearon desde su panel con la cuenta de la oficina, y
--    quien los mandó puede ni siquiera tener cuenta en el sitio. Se
--    guarda el correo tal cual lo reporta weetrust y ya.
alter table public.firmas_documentos
  add column if not exists creado_por text;

-- 4) La coherencia del origen, ahora con el caso nuevo. El `case` sin
--    `else` devolvía null para un origen no contemplado, y un check que
--    da null se considera cumplido: o sea que un renglón mal armado
--    habría pasado sin que nadie se enterara.
alter table public.firmas_documentos
  drop constraint if exists firmas_documentos_origen_coherente;
alter table public.firmas_documentos
  add constraint firmas_documentos_origen_coherente check (
    case origen
      when 'subido' then documento_guardado_id is null and documento_plantilla_id is null
                     and archivo_ruta is not null
      when 'guardado' then documento_guardado_id is not null and documento_plantilla_id is null
      when 'plantilla' then documento_plantilla_id is not null and documento_guardado_id is null
      when 'importado' then documento_guardado_id is null and documento_plantilla_id is null
      else false
    end
  );

-- 5) Lo importado no gasta del tope del mes.
--    Son documentos que ya se mandaron y ya se cobraron en su momento;
--    hacerlos contar le comería el mes a quien corra la importación, que
--    además no es quien los mandó.
create or replace function public.firmas_disponibles(p_user uuid default auth.uid())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_tiene_ajuste boolean;
  v_limite int;
  v_usados int;
begin
  if p_user is null then
    raise exception 'Falta indicar de quién se quiere saber el tope';
  end if;

  if auth.uid() is not null and p_user <> auth.uid() and not public.is_admin() then
    raise exception 'No puedes consultar el tope de otra persona';
  end if;

  select role into v_rol from public.profiles where id = p_user;

  select true, limite_mensual into v_tiene_ajuste, v_limite
  from public.firmas_limites where user_id = p_user;

  if not coalesce(v_tiene_ajuste, false) then
    if v_rol = 'master' then
      v_limite := null;
    else
      select limite_mensual_default into v_limite from public.firmas_config where id;
    end if;
  end if;

  select count(*) into v_usados
  from public.firmas_documentos
  where user_id = p_user
    and estado not in ('cancelado', 'error')
    and origen <> 'importado'
    and created_at >= date_trunc('month', now());

  return jsonb_build_object(
    'sin_tope', v_limite is null,
    'limite', v_limite,
    'usados', v_usados,
    'restantes', case when v_limite is null then null else greatest(v_limite - v_usados, 0) end
  );
end;
$$;

grant execute on function public.firmas_disponibles(uuid) to authenticated;
