-- Separar "eliminado en weetrust" de "cancelado".
-- Ejecutar completo en Supabase Dashboard > SQL Editor.
--
-- Hasta ahora, cuando alguien borraba un documento directo desde el
-- panel de weetrust, el sitio lo marcaba con el mismo estado que usa el
-- botón "Cancelar" de aquí. Quedaban mezclados dos casos distintos: uno
-- es que alguien decidió cancelarlo desde el sitio, el otro es que
-- weetrust ya no lo tiene por algo que pasó de su lado. Este cambio les
-- da su propio estado.

-- ── El nuevo estado ──
-- Se agrega 'eliminado' a la lista que ya existía. Se quita y se vuelve
-- a poner la restricción para que esto se pueda correr otra vez sin
-- quejarse si ya estaba.
alter table public.firmas_documentos
  drop constraint if exists firmas_documentos_estado_check;

alter table public.firmas_documentos
  add constraint firmas_documentos_estado_check
  check (estado in ('preparando', 'borrador', 'pendiente', 'completado', 'cancelado', 'error', 'eliminado'));

-- ── Tampoco gasta del tope ──
-- Mismo motivo que 'cancelado' y 'error': ya no hay nada activo ahí.
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
    and estado not in ('cancelado', 'error', 'eliminado')
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
