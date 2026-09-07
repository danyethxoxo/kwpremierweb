-- Revisiones de acuerdos y contratos sobre el mismo folio.
-- Ejecutar completo en Supabase Dashboard > SQL Editor después de 072_operatividad.sql.

alter table public.documentos_guardados
  add column if not exists revision integer not null default 0;

alter table public.documentos_guardados
  drop constraint if exists documentos_guardados_revision_check;
alter table public.documentos_guardados
  add constraint documentos_guardados_revision_check check (revision >= 0);

create table if not exists public.documento_revisiones (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.documentos_guardados(id) on delete cascade,
  revision integer not null check (revision >= 0),
  contenido jsonb not null,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (documento_id, revision)
);

create index if not exists idx_documento_revisiones_documento
  on public.documento_revisiones(documento_id, revision desc);

alter table public.documento_revisiones enable row level security;

drop policy if exists "leer_revisiones_propias" on public.documento_revisiones;
create policy "leer_revisiones_propias" on public.documento_revisiones
  for select to authenticated
  using (
    exists (
      select 1
      from public.documentos_guardados d
      where d.id = documento_id
        and (d.user_id = auth.uid() or public.is_master())
    )
  );

-- Guarda la versión final actual y convierte el mismo documento en el
-- borrador de la revisión siguiente. El id y el folio nunca cambian.
create or replace function public.crear_revision_documento(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documentos_guardados%rowtype;
  v_revision integer;
begin
  select * into v_doc
  from public.documentos_guardados
  where id = p_id
  for update;

  if not found then raise exception 'Documento no encontrado'; end if;
  if v_doc.user_id <> auth.uid() and not public.is_master() then
    raise exception 'No tienes permiso para revisar este documento';
  end if;
  if v_doc.estado <> 'finalizado' then
    raise exception 'Solo se puede crear una revisión de un documento finalizado';
  end if;
  if v_doc.folio is null then
    raise exception 'El documento finalizado no tiene folio';
  end if;

  insert into public.documento_revisiones
    (documento_id, revision, contenido, creado_por, created_at)
  values
    (v_doc.id, coalesce(v_doc.revision, 0), to_jsonb(v_doc), auth.uid(),
     coalesce(v_doc.finalizado_at, now()))
  on conflict (documento_id, revision) do nothing;

  v_revision := coalesce(v_doc.revision, 0) + 1;

  update public.documentos_guardados
  set revision = v_revision,
      estado = 'borrador',
      finalizado_at = null,
      updated_at = now()
  where id = p_id;

  return v_revision;
end;
$$;

grant execute on function public.crear_revision_documento(uuid) to authenticated;

-- El historial incluye las fotografías anteriores y la versión actual.
-- La pantalla siempre abre esta última; las demás solo se consultan.
create or replace function public.listar_revisiones_documento(p_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_doc public.documentos_guardados%rowtype;
  v_resultado jsonb;
begin
  select * into v_doc from public.documentos_guardados where id = p_id;
  if not found then raise exception 'Documento no encontrado'; end if;
  if v_doc.user_id <> auth.uid() and not public.is_master() then
    raise exception 'No tienes permiso para ver estas revisiones';
  end if;

  select coalesce(jsonb_agg(version order by (version ->> 'revision')::integer desc), '[]'::jsonb)
  into v_resultado
  from (
    select jsonb_build_object(
      'revision', coalesce(v_doc.revision, 0),
      'folio', v_doc.folio,
      'estado', v_doc.estado,
      'finalizado_at', v_doc.finalizado_at,
      'updated_at', v_doc.updated_at,
      'nombre_archivo', v_doc.nombre_archivo,
      'datos', v_doc.datos,
      'es_actual', true
    ) as version
    union all
    select jsonb_build_object(
      'revision', r.revision,
      'folio', r.contenido ->> 'folio',
      'estado', 'finalizado',
      'finalizado_at', r.contenido ->> 'finalizado_at',
      'updated_at', r.contenido ->> 'updated_at',
      'nombre_archivo', r.contenido ->> 'nombre_archivo',
      'datos', coalesce(r.contenido -> 'datos', '{}'::jsonb),
      'es_actual', false
    )
    from public.documento_revisiones r
    where r.documento_id = p_id
  ) versiones;

  return v_resultado;
end;
$$;

grant execute on function public.listar_revisiones_documento(uuid) to authenticated;

-- Finalizar por primera vez asigna folio. Finalizar una revisión conserva
-- el folio y solo sella la versión que se estaba editando.
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
  select tipo_documento, estado, user_id, folio
  into v_tipo, v_estado, v_owner, v_folio
  from public.documentos_guardados
  where id = p_id
  for update;

  if not found then raise exception 'Documento no encontrado'; end if;
  if v_owner <> auth.uid() and not public.is_master() then
    raise exception 'No tienes permiso para finalizar este documento';
  end if;
  if v_estado = 'finalizado' then return v_folio; end if;

  if v_folio is null then
    v_folio := public.obtener_siguiente_folio(v_tipo);
  end if;

  update public.documentos_guardados
  set folio = v_folio,
      estado = 'finalizado',
      finalizado_at = now(),
      updated_at = now()
  where id = p_id;

  return v_folio;
end;
$$;

grant execute on function public.finalizar_documento(uuid) to authenticated;

-- Mientras una revisión está abierta no debe poder borrarse como si fuera
-- un borrador nuevo, porque eso eliminaría también su folio e historial.
drop policy if exists "delete_own" on public.documentos_guardados;
create policy "delete_own" on public.documentos_guardados
  for delete
  using (
    public.is_master()
    or (auth.uid() = user_id and estado = 'borrador' and revision = 0)
  );
