-- Retira únicamente los registros de prueba autorizados, conserva su respaldo
-- privado y evita que los contratos de prueba vuelvan a crearlos.
create table private.operatividad_pruebas_retiradas (
  id uuid primary key,
  datos jsonb not null,
  retirado_at timestamptz not null default now()
);
alter table private.operatividad_pruebas_retiradas enable row level security;
revoke all on private.operatividad_pruebas_retiradas from public, anon, authenticated;
do $$
begin
  if (select count(*) from public.operatividad) <> 17 then
    raise exception 'Cambió la operatividad desde la revisión; revisar antes de retirar pruebas';
  end if;
  if exists (select 1 from public.operatividad o join public.dictamenes d on d.id=o.dictamen_id
             where d.archivado_at is null and d.estado in ('devuelta','condicionada','autorizada')) then
    raise exception 'Existe una captación real; no se retira automáticamente';
  end if;
  insert into private.operatividad_pruebas_retiradas select id,to_jsonb(o),now() from public.operatividad o;
  delete from public.operatividad;
end;
$$;

alter table public.operatividad add column documento_tipo text;
alter table public.operatividad add column propiedad_id uuid references public.propiedades(id) on delete set null;
create unique index operatividad_dictamen_unico on public.operatividad(dictamen_id) where dictamen_id is not null;
create index operatividad_propiedad_idx on public.operatividad(propiedad_id) where propiedad_id is not null;

create or replace function public.operatividad_sincronizar_dictamen(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  d public.dictamenes%rowtype;
  o public.operatividad%rowtype;
  contrato_fila public.operatividad%rowtype;
  doc public.documentos_guardados%rowtype;
  a public.dictamen_asesores%rowtype;
  v jsonb;
  clientes text;
  campo text;
  bandera text := coalesce(current_setting('kw.operatividad_sync',true),'');
begin
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into d from public.dictamenes where id=p_id;
  if not found then return; end if;
  if d.archivado_at is not null or d.estado not in ('devuelta','condicionada','autorizada') then
    return;
  end if;
  select * into a from public.dictamen_asesores where id=d.asesor_id;
  select string_agg(nombre, ', ' order by orden) into clientes from public.dictamen_clientes where dictamen_id=d.id;
  select * into doc from public.documentos_guardados g
    where g.dictamen_id=d.id and g.estado='finalizado'
      and g.tipo_documento in ('acuerdo_renta','contrato_profeco','contrato_comercial')
      and not exists(select 1 from private.operatividad_pruebas_retiradas r where r.datos->>'documento_id'=g.id::text)
    order by g.finalizado_at desc nulls last limit 1;
  perform set_config('kw.operatividad_sync','si',true);
  select * into o from public.operatividad where dictamen_id=d.id for update;
  if o.id is not null and doc.id is not null then
    select * into contrato_fila from public.operatividad where documento_id=doc.id and id<>o.id for update;
    if contrato_fila.id is not null then
      -- Conserva las correcciones del contrato al reunir ambos seguimientos.
      foreach campo in array contrato_fila.campos_manuales loop
        if not (campo=any(o.campos_manuales)) and campo<>'dictamen_id' then
          o:=jsonb_populate_record(o,jsonb_build_object(campo,to_jsonb(contrato_fila)->campo));
          o.campos_manuales:=array_append(o.campos_manuales,campo);
        end if;
      end loop;
      o.propiedad_id:=coalesce(o.propiedad_id,contrato_fila.propiedad_id);
      delete from public.operatividad where id=contrato_fila.id;
    end if;
  elsif o.id is null and doc.id is not null then
    select * into o from public.operatividad where documento_id=doc.id for update;
  end if;
  if o.id is null then
    insert into public.operatividad(dictamen_id) values(d.id) returning * into o;
  end if;
  v := coalesce(public.operatividad_desde_documento(doc),'{}'::jsonb) || jsonb_build_object(
    'asociado_nombre',a.nombre,'folio',d.folio,'fecha_dictamen',d.fecha_dictamen,
    'estatus_dictamen',public.operatividad_estatus_dictamen(d.estado),
    'tipo',upper(d.operacion),'exclusividad',case d.tipo_contrato when 'exclusiva' then 'EXCLUSIVA' when 'abierto' then 'OPCIÓN' end,
    'division',upper(d.uso),'precio',d.precio_listado,'porcentaje',d.comision_porcentaje,
    'direccion',d.inmueble,'cliente_nombre',coalesce(nullif(clientes,''),d.cliente));
  o := jsonb_populate_record(o,v - o.campos_manuales);
  update public.operatividad set dictamen_id=d.id,
    documento_id=coalesce(doc.id,o.documento_id), documento_tipo=coalesce(doc.tipo_documento,o.documento_tipo),
    propiedad_id=o.propiedad_id,campos_manuales=o.campos_manuales,
    asociado_nombre=o.asociado_nombre,folio=o.folio,fecha_dictamen=o.fecha_dictamen,
    estatus_dictamen=o.estatus_dictamen,tipo=o.tipo,exclusividad=o.exclusividad,
    division=o.division,precio=o.precio,porcentaje=o.porcentaje,direccion=o.direccion,
    cliente_nombre=o.cliente_nombre,fecha_contrato=o.fecha_contrato,mes_recibo=o.mes_recibo,
    numero_propietario=o.numero_propietario,colonia=o.colonia,alcaldia=o.alcaldia,
    entidad=o.entidad,codigo_postal=o.codigo_postal,sincronizado_at=now()
    where id=o.id;
  perform set_config('kw.operatividad_sync',bandera,true);
end;
$$;
revoke all on function public.operatividad_sincronizar_dictamen(uuid) from public, anon, authenticated;

create or replace function public.operatividad_al_dictaminar()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.operatividad_sincronizar_dictamen(new.id);
  return new;
end;
$$;
revoke all on function public.operatividad_al_dictaminar() from public, anon, authenticated;
drop trigger if exists trg_operatividad_al_dictaminar on public.dictamenes;
create trigger trg_operatividad_al_dictaminar after insert or update on public.dictamenes
for each row execute function public.operatividad_al_dictaminar();

create function public.operatividad_al_actualizar_cliente()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then perform public.operatividad_sincronizar_dictamen(old.dictamen_id); end if;
  if tg_op <> 'DELETE' then perform public.operatividad_sincronizar_dictamen(new.dictamen_id); end if;
  return null;
end;
$$;
revoke all on function public.operatividad_al_actualizar_cliente() from public, anon, authenticated;
create trigger operatividad_cliente_actualizado after insert or update or delete on public.dictamen_clientes
for each row execute function public.operatividad_al_actualizar_cliente();

create or replace function public.operatividad_resincronizar(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.operatividad%rowtype; doc public.documentos_guardados%rowtype;
begin
  if not coalesce(private.is_staff_or_above(),false) or not coalesce(public.mfa_sesion_autorizada(),false) then raise exception 'Sin permiso'; end if;
  select * into o from public.operatividad where id=p_id for update;
  if o.documento_id is null and o.dictamen_id is null then raise exception 'No hay documento de origen'; end if;
  update public.operatividad set campos_manuales='{}' where id=p_id;
  if o.documento_id is not null then
    select * into doc from public.documentos_guardados where id=o.documento_id;
    perform public.operatividad_sincronizar_documento(doc);
  end if;
  if o.dictamen_id is not null then perform public.operatividad_sincronizar_dictamen(o.dictamen_id); end if;
end;
$$;
revoke all on function public.operatividad_resincronizar(uuid) from public, anon;
grant execute on function public.operatividad_resincronizar(uuid) to authenticated;

do $$
declare d record;
begin
  for d in select id from public.dictamenes where archivado_at is null and estado in ('devuelta','condicionada','autorizada') loop
    perform public.operatividad_sincronizar_dictamen(d.id);
  end loop;
end;
$$;

create or replace function public.operatividad_sincronizar_documento(p_doc public.documentos_guardados)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto jsonb;
  v_fila public.operatividad%rowtype;
  v_dic public.dictamenes%rowtype;
  v_perfil public.profiles%rowtype;
begin
  if p_doc.estado is distinct from 'finalizado' then return; end if;
  if exists (select 1 from private.operatividad_pruebas_retiradas
             where datos->>'documento_id' = p_doc.id::text) then return; end if;
  if p_doc.dictamen_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_doc.dictamen_id::text, 0));
    perform public.operatividad_sincronizar_dictamen(p_doc.dictamen_id);
  end if;

  v_auto := public.operatividad_desde_documento(p_doc);
  if v_auto is null then return; end if;

  -- El nombre del asesor se escribe a mano en el documento y a veces se
  -- deja en blanco. El de la cuenta que lo generó sirve de respaldo.
  if not (v_auto ? 'asociado_nombre') then
    select * into v_perfil from public.profiles where id = p_doc.user_id;
    if found then
      v_auto := v_auto || jsonb_strip_nulls(jsonb_build_object(
        'asociado_nombre',
        public.operatividad_texto(trim(coalesce(v_perfil.nombre, '') || ' ' ||
                                       coalesce(v_perfil.apellido, '')))
      ));
    end if;
  end if;

  -- De aquí para abajo escribe la sincronización, no una persona: se
  -- levanta la bandera para que el trigger de operatividad_marcar_manual
  -- no confunda esto con una corrección. Se baja al final, para que una
  -- edición a mano hecha después en la misma transacción sí se marque.
  perform set_config('kw.operatividad_sync', 'si', true);

  select * into v_fila from public.operatividad where documento_id = p_doc.id or (p_doc.dictamen_id is not null and dictamen_id = p_doc.dictamen_id) limit 1;

  if not found then
    insert into public.operatividad (documento_id, asociado_id, sincronizado_at)
    values (p_doc.id, p_doc.user_id, now())
    returning * into v_fila;
  end if;

  -- Lo que una persona ya corrigió no se vuelve a tocar.
  v_auto := v_auto - v_fila.campos_manuales;

  -- El dictamen se busca mientras el renglón no tenga ninguno. Si alguien
  -- lo enlazó o lo desenlazó a mano, esa decisión manda sobre lo que la
  -- búsqueda opine.
  if v_fila.dictamen_id is null and not ('dictamen_id' = any(v_fila.campos_manuales)) then
    v_fila.dictamen_id := p_doc.dictamen_id;
  end if;

  -- La fecha que vale es la que puso quien dictaminó (fecha_dictamen del
  -- dictamen), no la del reloj al guardarlo: a veces el expediente se
  -- captura días después de haberse revisado. Un dictamen todavía en
  -- borrador no aporta nada, y por eso se pide que ya tenga estatus.
  if v_fila.dictamen_id is not null then
    select * into v_dic from public.dictamenes where id = v_fila.dictamen_id;
    if found and public.operatividad_estatus_dictamen(v_dic.estado) is not null then
      v_auto := (v_auto || jsonb_strip_nulls(jsonb_build_object(
        'fecha_dictamen', v_dic.fecha_dictamen,
        'estatus_dictamen', public.operatividad_estatus_dictamen(v_dic.estado)
      ))) - v_fila.campos_manuales;
    end if;
  end if;

  -- jsonb_populate_record deja el renglón con los valores nuevos encima
  -- de los que ya tenía, columna por columna y sin tener que escribir un
  -- coalesce por cada una.
  v_fila := jsonb_populate_record(v_fila, v_auto);

  update public.operatividad set
    documento_id       = p_doc.id,
    documento_tipo     = p_doc.tipo_documento,
    dictamen_id        = coalesce(p_doc.dictamen_id, v_fila.dictamen_id),
    asociado_nombre    = v_fila.asociado_nombre,
    folio              = v_fila.folio,
    fecha_dictamen     = v_fila.fecha_dictamen,
    estatus_dictamen   = v_fila.estatus_dictamen,
    mes_recibo         = v_fila.mes_recibo,
    fecha_contrato     = v_fila.fecha_contrato,
    tipo               = v_fila.tipo,
    exclusividad       = v_fila.exclusividad,
    division           = v_fila.division,
    precio             = v_fila.precio,
    porcentaje         = v_fila.porcentaje,
    direccion          = v_fila.direccion,
    colonia            = v_fila.colonia,
    alcaldia           = v_fila.alcaldia,
    entidad            = v_fila.entidad,
    codigo_postal      = v_fila.codigo_postal,
    cliente_nombre     = v_fila.cliente_nombre,
    numero_propietario = v_fila.numero_propietario,
    sincronizado_at    = now()
  where id = v_fila.id;

  if p_doc.dictamen_id is not null then
    perform public.operatividad_sincronizar_dictamen(p_doc.dictamen_id);
  end if;
  perform set_config('kw.operatividad_sync', '', true);
end;
$$;
revoke all on function public.operatividad_sincronizar_documento(public.documentos_guardados) from public, anon, authenticated;

create function public.operatividad_listar()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(private.is_staff_or_above(),false) or not coalesce(public.mfa_sesion_autorizada(),false) then raise exception 'Sin permiso'; end if;
  return coalesce((select jsonb_agg(to_jsonb(o) || jsonb_build_object(
    'precio',case when 'precio'=any(o.campos_manuales) then o.precio else coalesce(o.precio,p.precio) end,
    'colonia',coalesce(o.colonia,p.colonia),'alcaldia',coalesce(o.alcaldia,p.municipio),
    'entidad',coalesce(o.entidad,p.estado),'codigo_postal',coalesce(o.codigo_postal,p.cp),
    'propiedad',case when p.id is not null then jsonb_build_object('id',p.id,'titulo',p.titulo,'estatus',p.estatus,
    'fuente_id',p.fuente_id,'enlace_kw',case when coalesce(p.datos_origen->'listado'->>'Property_Command_ID',
      p.datos_origen->'detalle'->'data'->'Property_Data'->0->>'Property_Command_ID') ~ '^[0-9]+$'
      then 'https://kw.com/es-419/property/Propiedad/' || coalesce(p.datos_origen->'listado'->>'Property_Command_ID',
      p.datos_origen->'detalle'->'data'->'Property_Data'->0->>'Property_Command_ID') end) end)
    order by coalesce(o.fecha_dictamen,o.fecha_contrato) desc nulls last,o.created_at desc)
    from public.operatividad o left join public.dictamenes d on d.id=o.dictamen_id
    left join public.propiedades p on p.id=o.propiedad_id
    where o.dictamen_id is null or (d.archivado_at is null and d.estado in ('devuelta','condicionada','autorizada'))),'[]'::jsonb);
end;
$$;
revoke all on function public.operatividad_listar() from public,anon;
grant execute on function public.operatividad_listar() to authenticated;
