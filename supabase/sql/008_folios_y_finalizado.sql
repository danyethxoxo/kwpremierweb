-- Fase 9: folios consecutivos y documentos finalizados/inmutables.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

-- 1) Nuevas columnas: folio (se asigna al finalizar), estado
--    (borrador -> se puede seguir editando; finalizado -> ya no).
alter table public.documentos_guardados
  add column if not exists folio text,
  add column if not exists finalizado_at timestamptz;

alter table public.documentos_guardados
  add column if not exists estado text not null default 'borrador';

alter table public.documentos_guardados
  drop constraint if exists documentos_guardados_estado_check;
alter table public.documentos_guardados
  add constraint documentos_guardados_estado_check
  check (estado in ('borrador', 'finalizado'));

-- 2) Contador de folios por tipo de documento (prefijo + consecutivo).
--    Agrega aquí una fila por cada tipo de documento que ya folie.
create table if not exists public.folio_contadores (
  tipo_documento text primary key,
  prefijo text not null,
  siguiente int not null default 1
);

insert into public.folio_contadores (tipo_documento, prefijo)
values ('carta_terminacion', 'CT')
on conflict (tipo_documento) do nothing;

-- 3) Función interna: entrega el siguiente folio de forma atómica
--    (formato "PREFIJO 0001"). Solo la usa finalizar_documento().
create or replace function public.obtener_siguiente_folio(p_tipo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefijo text;
  v_num int;
begin
  update public.folio_contadores
  set siguiente = siguiente + 1
  where tipo_documento = p_tipo
  returning prefijo, siguiente - 1 into v_prefijo, v_num;

  if not found then
    raise exception 'Tipo de documento % no tiene prefijo de folio configurado', p_tipo;
  end if;

  return v_prefijo || ' ' || lpad(v_num::text, 4, '0');
end;
$$;

-- 4) Función pública (RPC): finaliza un documento propio (o de
--    cualquiera, si eres master). Le asigna folio y lo vuelve
--    inmutable. Es la ÚNICA forma de pasar un documento a
--    "finalizado" — un update directo del cliente no puede hacerlo
--    (ver política de update más abajo).
create or replace function public.finalizar_documento(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
  v_estado text;
  v_owner uuid;
  v_folio text;
begin
  select tipo_documento, estado, user_id into v_tipo, v_estado, v_owner
  from public.documentos_guardados
  where id = p_id;

  if not found then
    raise exception 'Documento no encontrado';
  end if;

  if v_owner <> auth.uid() and not public.is_master() then
    raise exception 'No tienes permiso para finalizar este documento';
  end if;

  if v_estado = 'finalizado' then
    raise exception 'Este documento ya fue finalizado';
  end if;

  v_folio := public.obtener_siguiente_folio(v_tipo);

  update public.documentos_guardados
  set folio = v_folio, estado = 'finalizado', finalizado_at = now()
  where id = p_id;

  return v_folio;
end;
$$;

grant execute on function public.finalizar_documento(uuid) to authenticated;

-- 5) Un documento "finalizado" ya no se puede editar ni borrar,
--    salvo por el usuario master (que siempre puede todo).
drop policy if exists "update_own" on public.documentos_guardados;
create policy "update_own" on public.documentos_guardados
  for update
  using (public.is_master() or (auth.uid() = user_id and estado = 'borrador'))
  with check (public.is_master() or (auth.uid() = user_id and estado = 'borrador'));

drop policy if exists "delete_own" on public.documentos_guardados;
create policy "delete_own" on public.documentos_guardados
  for delete
  using (public.is_master() or (auth.uid() = user_id and estado = 'borrador'));
