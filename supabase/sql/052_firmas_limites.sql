-- Tope mensual de documentos mandados a firma, por persona.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.
--
-- weetrust cobra por documento firmado, así que sin un tope el gasto
-- del Market Center depende de cuánto use cada quien. No todos gastan
-- igual: habrá quien mande diez al mes y quien no mande ninguno, y por
-- eso el tope tiene un valor general y además se puede ajustar persona
-- por persona, en vez de un solo número parejo para todos.

create extension if not exists pgcrypto;

-- ── El tope general ──
-- Una sola fila, siempre. El truco del id booleano con check obliga a
-- que solo pueda existir la fila 'true': sin eso, alguien podría
-- insertar una segunda configuración y nadie sabría cuál manda.
create table if not exists public.firmas_config (
  id boolean primary key default true,
  constraint firmas_config_una_sola_fila check (id),
  limite_mensual_default int not null default 10
    check (limite_mensual_default >= 0),
  actualizado_por uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.firmas_config (id) values (true)
on conflict (id) do nothing;

-- ── Los ajustes por persona ──
-- Solo se guarda fila para quien tenga un tope distinto al general; los
-- demás no aparecen aquí. Así el tope general sigue aplicando solo a
-- quien no se le haya tocado nada, y subirlo o bajarlo mueve a todos
-- ellos de una vez.
create table if not exists public.firmas_limites (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- null quiere decir sin tope. Es distinto de 0, que quiere decir que
  -- esta persona no puede mandar nada.
  limite_mensual int check (limite_mensual is null or limite_mensual >= 0),
  nota text,
  actualizado_por uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.firmas_config enable row level security;
alter table public.firmas_limites enable row level security;

-- Todos pueden leer para que la pantalla les enseñe cuánto les queda.
-- Cambiarlos es cosa del liderazgo, y eso se hace con la función de
-- abajo, no escribiendo directo.
drop policy if exists "firmas_config_select" on public.firmas_config;
create policy "firmas_config_select" on public.firmas_config
  for select using (auth.uid() is not null);

drop policy if exists "firmas_limites_select" on public.firmas_limites;
create policy "firmas_limites_select" on public.firmas_limites
  for select using (auth.uid() = user_id or public.is_admin());

-- ── Cuánto le queda a alguien ──
-- Lo usan tres lugares: la pantalla de Firmas para enseñar el contador,
-- el Panel para la lista del equipo, y la Edge Function para dejar
-- pasar el envío o no. Vive en la base y no repartido en cada uno para
-- que los tres cuenten exactamente igual.
--
-- Se cuenta por mes de calendario y se descartan los cancelados y los
-- que fallaron: esos no llegan a cobrarse, así que no tiene sentido que
-- ocupen lugar del tope de nadie.
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

  -- Solo se puede consultar lo propio, salvo el liderazgo.
  --
  -- El "auth.uid() is not null" no sobra: cuando llama la Edge Function
  -- con la llave de servicio no hay sesión, y sin esa condición la
  -- comparación con null dejaría pasar la revisión por cómo se evalúa
  -- un null en un if, o sea por accidente y no porque se haya decidido.
  -- Ahí sí se permite a propósito: esa llave ya es de confianza y es la
  -- que necesita revisar el tope antes de dejar mandar un documento.
  if auth.uid() is not null and p_user <> auth.uid() and not public.is_admin() then
    raise exception 'No puedes consultar el tope de otra persona';
  end if;

  select role into v_rol from public.profiles where id = p_user;

  select true, limite_mensual into v_tiene_ajuste, v_limite
  from public.firmas_limites where user_id = p_user;

  if not coalesce(v_tiene_ajuste, false) then
    -- El master nunca se queda sin poder mandar: es quien administra
    -- esto, y dejarlo fuera por el tope general sería encerrarse con la
    -- llave por dentro.
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

-- ── Cambiar el tope de alguien ──
-- Pasar null en p_limite le quita el tope; pasar -1 borra su ajuste y
-- lo regresa al tope general. Son dos cosas distintas y por eso no se
-- pueden expresar con el mismo valor.
create or replace function public.firmas_fijar_limite(
  p_user uuid,
  p_limite int,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el liderazgo puede cambiar los topes de firma';
  end if;

  if p_limite is not null and p_limite < -1 then
    raise exception 'El tope no puede ser negativo';
  end if;

  if p_limite = -1 then
    delete from public.firmas_limites where user_id = p_user;
  else
    insert into public.firmas_limites (user_id, limite_mensual, nota, actualizado_por, updated_at)
    values (p_user, p_limite, p_nota, auth.uid(), now())
    on conflict (user_id) do update set
      limite_mensual = excluded.limite_mensual,
      nota = excluded.nota,
      actualizado_por = excluded.actualizado_por,
      updated_at = now();
  end if;

  -- Se regresa cómo quedó para que la pantalla se actualice con lo que
  -- de verdad se guardó, y no con lo que creía que iba a guardar.
  return public.firmas_disponibles(p_user);
end;
$$;

grant execute on function public.firmas_fijar_limite(uuid, int, text) to authenticated;

-- ── Cambiar el tope general ──
create or replace function public.firmas_fijar_default(p_limite int)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el liderazgo puede cambiar el tope general';
  end if;
  if p_limite is null or p_limite < 0 then
    raise exception 'El tope general tiene que ser cero o más';
  end if;

  update public.firmas_config
  set limite_mensual_default = p_limite, actualizado_por = auth.uid(), updated_at = now()
  where id;

  return p_limite;
end;
$$;

grant execute on function public.firmas_fijar_default(int) to authenticated;
