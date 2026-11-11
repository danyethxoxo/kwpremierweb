-- Credenciales independientes del sincronizador interno. Solo el servidor puede leerlas.
create table public.propiedades_feed_config (
  id text primary key,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  activo boolean not null default true,
  publicacion_habilitada boolean not null default false,
  url_feed text check (url_feed is null or url_feed ~ '^https://'),
  authorization_feed text,
  max_bajas_porcentaje numeric not null default 0.20 check (max_bajas_porcentaje between 0 and 1),
  ultimo_generado timestamptz,
  creado_at timestamptz not null default now()
);
create table public.propiedades_feed_envios (
  feed_id text not null references public.propiedades_feed_config(id),
  envio_id text not null,
  publicar boolean not null default false,
  contenido_hash text not null,
  generado_at timestamptz not null,
  recibido_at timestamptz not null default now(),
  resultado jsonb not null,
  primary key (feed_id, envio_id, publicar)
);
alter table public.propiedades_feed_config enable row level security;
alter table public.propiedades_feed_envios enable row level security;
revoke all on public.propiedades_feed_config, public.propiedades_feed_envios from public, anon, authenticated;
grant all on public.propiedades_feed_config, public.propiedades_feed_envios to service_role;
create policy feed_config_servidor on public.propiedades_feed_config to service_role using (true) with check (true);
create policy feed_envios_servidor on public.propiedades_feed_envios to service_role using (true) with check (true);

create function public.propiedades_feed_recibir(
  p_feed text, p_envio text, p_hash text, p_generado timestamptz,
  p_modo text, p_filas jsonb, p_publicar boolean default false
) returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public
as $function$
declare
  cfg public.propiedades_feed_config%rowtype;
  previo public.propiedades_feed_envios%rowtype;
  fuente_feed text := 'feed:' || p_feed;
  resultado jsonb;
  total integer; activas integer; nuevas integer := 0; cambios integer := 0;
  reactivadas integer := 0; bajas integer := 0; existentes integer := 0;
begin
  select * into cfg from public.propiedades_feed_config where id=p_feed and activo for update;
  if not found then raise exception 'Conexión no habilitada.'; end if;
  if p_modo not in ('incremental','completo') or jsonb_typeof(p_filas) <> 'array' then raise exception 'Envío inválido.'; end if;
  total := jsonb_array_length(p_filas);
  if total < 1 or total > 10000 then raise exception 'Cantidad de registros inválida.'; end if;
  if (select count(distinct r->>'fuente_id') from jsonb_array_elements(p_filas) r) <> total then raise exception 'IDs inválidos o duplicados.'; end if;
  if p_publicar and not cfg.publicacion_habilitada then raise exception 'Publicación no habilitada.'; end if;
  select * into previo from public.propiedades_feed_envios where feed_id=p_feed and envio_id=p_envio and publicar=p_publicar;
  if found then
    if previo.contenido_hash <> p_hash then raise exception 'envio_id ya existe con otro contenido. Usa un ID nuevo.'; end if;
    return previo.resultado || jsonb_build_object('repetido',true);
  end if;
  select count(*) into activas from jsonb_array_elements(p_filas) r where r->>'estatus'='publicada';
  if not p_publicar then
    resultado := jsonb_build_object('envio_id',p_envio,'estado','validado','publicado',false,
      'recibidas',total,'activas_en_envio',activas,'bajas_en_envio',total-activas,'modo',p_modo);
  else
    if cfg.ultimo_generado is not null and p_generado <= cfg.ultimo_generado then raise exception 'Envío antiguo: generado_at debe ser posterior al último publicado.'; end if;
    -- Antes de habilitar se debe conciliar la equivalencia entre IDs del proveedor y del inventario actual.
    if exists (select 1 from public.propiedades p join jsonb_array_elements(p_filas) r on p.fuente_id=r->>'fuente_id'
      where p.fuente<>fuente_feed and p.estatus='publicada') then
      raise exception 'Hay IDs publicados por otra fuente. Premier debe conciliar el inventario antes de publicar.';
    end if;
    if exists (select 1 from jsonb_array_elements(p_filas) r left join public.propiedades p on p.fuente=fuente_feed and p.fuente_id=r->>'fuente_id'
      where r->>'estatus'<>'publicada' and p.id is null) then raise exception 'La baja contiene un ID que todavía no existe en esta conexión.'; end if;
    select count(*) into existentes from public.propiedades where fuente=fuente_feed and estatus='publicada';
    select count(*) into bajas from public.propiedades p where p.fuente=fuente_feed and p.estatus='publicada' and (
      exists (select 1 from jsonb_array_elements(p_filas) r where r->>'fuente_id'=p.fuente_id and r->>'estatus'<>'publicada') or
      (p_modo='completo' and not exists (select 1 from jsonb_array_elements(p_filas) r where r->>'fuente_id'=p.fuente_id)));
    if existentes>0 and bajas>existentes*cfg.max_bajas_porcentaje then raise exception 'Bajas superiores al límite de seguridad. Revisar el envío con Premier.'; end if;
    select count(*) filter (where p.id is null),count(*) filter (where p.id is not null and p.estatus<>'publicada')
      into nuevas,reactivadas from jsonb_array_elements(p_filas) r left join public.propiedades p
      on p.fuente=fuente_feed and p.fuente_id=r->>'fuente_id' where r->>'estatus'='publicada';

    -- Una transacción aplica el lote completo o no aplica nada.
    with filas as (
      select r, jsonb_populate_record(null::public.propiedades, r) p from jsonb_array_elements(p_filas) r where r->>'estatus'='publicada'
    ), guardadas as (
      insert into public.propiedades as actual (
        fuente,fuente_id,titulo,descripcion,operacion,estatus,tipo,precio,moneda,
        recamaras,banos,estacionamientos,m2_construccion,m2_terreno,calle,colonia,municipio,estado,cp,pais,lat,lng,
        imagenes,caracteristicas,market_center,asesor_nombre,asesor_kw_id,asesor_id,datos_origen,sincronizado_at)
      select fuente_feed,(p).fuente_id,(p).titulo,(p).descripcion,(p).operacion,(p).estatus,(p).tipo,(p).precio,(p).moneda,
        (p).recamaras,(p).banos,(p).estacionamientos,(p).m2_construccion,(p).m2_terreno,(p).calle,(p).colonia,(p).municipio,(p).estado,(p).cp,coalesce((p).pais,'MX'),(p).lat,(p).lng,
        coalesce((p).imagenes,'[]'::jsonb),coalesce((p).caracteristicas,'[]'::jsonb),(p).market_center,(p).asesor_nombre,(p).asesor_kw_id,
        (select pr.id from public.profiles pr where lower(pr.email)=lower(r->>'asesor_email') order by pr.id limit 1),
        r-'asesor_email',now() from filas
      on conflict (fuente,fuente_id) do update set
        titulo=excluded.titulo,descripcion=excluded.descripcion,operacion=excluded.operacion,estatus=excluded.estatus,
        tipo=excluded.tipo,precio=excluded.precio,moneda=excluded.moneda,recamaras=excluded.recamaras,banos=excluded.banos,
        estacionamientos=excluded.estacionamientos,m2_construccion=excluded.m2_construccion,m2_terreno=excluded.m2_terreno,
        calle=excluded.calle,colonia=excluded.colonia,municipio=excluded.municipio,estado=excluded.estado,cp=excluded.cp,pais=excluded.pais,
        lat=excluded.lat,lng=excluded.lng,imagenes=excluded.imagenes,caracteristicas=excluded.caracteristicas,market_center=excluded.market_center,
        asesor_nombre=excluded.asesor_nombre,asesor_kw_id=excluded.asesor_kw_id,asesor_id=excluded.asesor_id,
        datos_origen=excluded.datos_origen,sincronizado_at=excluded.sincronizado_at
      where actual.datos_origen is distinct from excluded.datos_origen or actual.estatus is distinct from excluded.estatus or actual.asesor_id is distinct from excluded.asesor_id
      returning id
    ) select greatest(0,count(*)-nuevas-reactivadas) into cambios from guardadas;
    update public.propiedades p set estatus=r->>'estatus',sincronizado_at=now()
      from jsonb_array_elements(p_filas) r where p.fuente=fuente_feed and p.fuente_id=r->>'fuente_id'
      and r->>'estatus'<>'publicada' and p.estatus is distinct from r->>'estatus';
    if p_modo='completo' then
      update public.propiedades p set estatus='suspendida',sincronizado_at=now() where p.fuente=fuente_feed and p.estatus='publicada'
        and not exists (select 1 from jsonb_array_elements(p_filas) r where r->>'fuente_id'=p.fuente_id);
    end if;
    update public.propiedades_feed_config set ultimo_generado=p_generado where id=p_feed;
    resultado := jsonb_build_object('envio_id',p_envio,'estado','publicado','publicado',true,'recibidas',total,
      'nuevas',nuevas,'reactivadas',reactivadas,'actualizadas',cambios,'desactivadas',bajas,'modo',p_modo);
  end if;
  insert into public.propiedades_feed_envios(feed_id,envio_id,publicar,contenido_hash,generado_at,resultado)
    values(p_feed,p_envio,p_publicar,p_hash,p_generado,resultado);
  return resultado || jsonb_build_object('repetido',false);
end
$function$;
revoke all on function public.propiedades_feed_recibir(text,text,text,timestamptz,text,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.propiedades_feed_recibir(text,text,text,timestamptz,text,jsonb,boolean) to service_role;

