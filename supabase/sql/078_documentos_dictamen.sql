-- 078 · Enlace explícito entre acuerdos/contratos y dictámenes.
-- Ejecutar completo en Supabase SQL Editor después de 077_dictamenes_por_permisos.sql.

alter table public.documentos_guardados
  add column if not exists dictamen_id uuid references public.dictamenes(id) on delete set null;

create index if not exists idx_documentos_guardados_dictamen
  on public.documentos_guardados(dictamen_id)
  where dictamen_id is not null;

-- El equipo que dictamina puede leer el documento vinculado desde el
-- expediente, aunque haya sido creado por el asesor.
drop policy if exists "select_documentos_en_dictamen" on public.documentos_guardados;
create policy "select_documentos_en_dictamen" on public.documentos_guardados
  for select to authenticated
  using (dictamen_id is not null and public.puede_dictaminar());

-- Conserva los enlaces que Operatividad ya hubiera resuelto o capturado.
update public.documentos_guardados d
set dictamen_id = o.dictamen_id
from public.operatividad o
where o.documento_id = d.id
  and o.dictamen_id is not null
  and d.dictamen_id is null;

create or replace function public.listar_dictamenes_para_enlazar(p_documento_id uuid)
returns table (
  id uuid,
  folio text,
  inmueble text,
  cliente text,
  asesor_nombre text,
  fecha_dictamen date,
  estado text,
  enlazado boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_doc public.documentos_guardados%rowtype;
  v_correo text;
  v_rol text;
  v_liderazgo boolean;
begin
  select * into v_doc from public.documentos_guardados where documentos_guardados.id = p_documento_id;
  if not found then raise exception 'Documento no encontrado'; end if;

  select p.email, p.role into v_correo, v_rol
  from public.profiles p where p.id = auth.uid();
  v_liderazgo := v_rol in ('master', 'admin', 'staff');

  if v_doc.user_id <> auth.uid() and not v_liderazgo then
    raise exception 'No tienes permiso para enlazar este documento';
  end if;
  if v_doc.estado <> 'finalizado' then
    raise exception 'Solo se enlazan documentos finalizados';
  end if;

  return query
  select d.id, d.folio, d.inmueble, d.cliente, a.nombre,
         d.fecha_dictamen, d.estado, d.id = v_doc.dictamen_id
  from public.dictamenes d
  join public.dictamen_asesores a on a.id = d.asesor_id
  where d.archivado_at is null
    and (v_liderazgo or lower(coalesce(a.correo, '')) = lower(coalesce(v_correo, '')))
  order by (d.id = v_doc.dictamen_id) desc, d.created_at desc;
end;
$$;

revoke all on function public.listar_dictamenes_para_enlazar(uuid) from public;
grant execute on function public.listar_dictamenes_para_enlazar(uuid) to authenticated;

create or replace function public.enlazar_documento_dictamen(
  p_documento_id uuid,
  p_dictamen_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documentos_guardados%rowtype;
  v_correo text;
  v_rol text;
  v_liderazgo boolean;
begin
  select * into v_doc
  from public.documentos_guardados
  where id = p_documento_id
  for update;

  if not found then raise exception 'Documento no encontrado'; end if;

  select p.email, p.role into v_correo, v_rol
  from public.profiles p where p.id = auth.uid();
  v_liderazgo := v_rol in ('master', 'admin', 'staff');

  if v_doc.user_id <> auth.uid() and not v_liderazgo then
    raise exception 'No tienes permiso para enlazar este documento';
  end if;
  if v_doc.estado <> 'finalizado' then
    raise exception 'Solo se enlazan documentos finalizados';
  end if;

  if p_dictamen_id is not null and not exists (
    select 1
    from public.dictamenes d
    join public.dictamen_asesores a on a.id = d.asesor_id
    where d.id = p_dictamen_id
      and d.archivado_at is null
      and (v_liderazgo or lower(coalesce(a.correo, '')) = lower(coalesce(v_correo, '')))
  ) then
    raise exception 'No tienes permiso para enlazar ese dictamen';
  end if;

  update public.documentos_guardados
  set dictamen_id = p_dictamen_id
  where id = p_documento_id;

  -- Operatividad conserva el mismo vínculo y deja de depender de comparar
  -- direcciones escritas de maneras distintas.
  update public.operatividad o
  set dictamen_id = p_dictamen_id,
      campos_manuales = case
        when 'dictamen_id' = any(o.campos_manuales) then o.campos_manuales
        else array_append(o.campos_manuales, 'dictamen_id')
      end,
      fecha_dictamen = case
        when 'fecha_dictamen' = any(o.campos_manuales) then o.fecha_dictamen
        else (select d.fecha_dictamen from public.dictamenes d where d.id = p_dictamen_id)
      end,
      estatus_dictamen = case
        when 'estatus_dictamen' = any(o.campos_manuales) then o.estatus_dictamen
        else (select public.operatividad_estatus_dictamen(d.estado)
              from public.dictamenes d where d.id = p_dictamen_id)
      end,
      sincronizado_at = now()
  where o.documento_id = p_documento_id;
end;
$$;

revoke all on function public.enlazar_documento_dictamen(uuid, uuid) from public;
grant execute on function public.enlazar_documento_dictamen(uuid, uuid) to authenticated;
