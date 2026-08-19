-- Guardar un envío a medias, para terminarlo después.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.
--
-- Hasta ahora armar un envío era todo o nada: se juntaban los archivos,
-- se capturaban los firmantes, se colocaban las firmas, y de ahí salía
-- directo a firmar. Si a media captura faltaba un correo o un anexo, se
-- perdía el trabajo.
--
-- Un borrador guarda todo eso sin mandarlo a weetrust: sin correos, sin
-- documento creado allá y sin nada que se pueda cobrar. Se reabre, se
-- corrige lo que faltaba y ahí sí se manda.

-- ── Dónde queda cada firma ──
-- Las coordenadas se calculaban en la pantalla y se le mandaban a
-- weetrust sin guardarlas: al reabrir un borrador no habría de dónde
-- volver a dibujar los recuadros.
--
-- Se guardan como se le mandan a ellos (puntos del PDF, con el tamaño de
-- su página al lado) y no como porcentajes de pantalla: los puntos no
-- dependen de en qué se estaba viendo, y de ahí se puede volver a sacar
-- el porcentaje, pero al revés no.
alter table public.firmas_documentos
  add column if not exists posiciones jsonb not null default '[]';

-- ── Un borrador sin mandar no gasta del tope ──
-- Nada se creó en weetrust y nada se puede cobrar. Contarlo haría que
-- alguien se quedara sin mes por dejar tres envíos a medio armar.
--
-- La condición mira el identificador de weetrust y no solo el estado,
-- porque 'borrador' también es el momento entre que el documento se sube
-- allá y se manda la invitación: eso sí llegó a existir de su lado.
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
    and not (estado = 'borrador' and weetrust_document_id is null)
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
