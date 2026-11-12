alter table public.propiedades_feed_config add column ultimo_pruebas timestamptz;
create table public.propiedades_feed_pruebas (
  feed_id text not null references public.propiedades_feed_config(id),
  fuente_id text not null,
  estatus text not null check (estatus in ('publicada','suspendida','vendida','rentada','reservada','no_publicada')),
  datos jsonb not null,
  envio_id text not null,
  generado_at timestamptz not null,
  recibido_at timestamptz not null default now(),
  primary key (feed_id,fuente_id)
);
create index propiedades_feed_pruebas_fecha on public.propiedades_feed_pruebas(feed_id,recibido_at desc,fuente_id);
create table public.propiedades_feed_rechazos (
  id uuid primary key default gen_random_uuid(),
  feed_id text not null references public.propiedades_feed_config(id),
  envio_id text,
  codigo integer not null,
  mensaje text not null,
  recibido_at timestamptz not null default now()
);
create index propiedades_feed_rechazos_fecha on public.propiedades_feed_rechazos(feed_id,recibido_at desc);
alter table public.propiedades_feed_pruebas enable row level security;
alter table public.propiedades_feed_rechazos enable row level security;
revoke all on public.propiedades_feed_pruebas,public.propiedades_feed_rechazos from public,anon,authenticated;
grant all on public.propiedades_feed_pruebas,public.propiedades_feed_rechazos to service_role;
create policy feed_pruebas_servidor on public.propiedades_feed_pruebas to service_role using(true) with check(true);
create policy feed_rechazos_servidor on public.propiedades_feed_rechazos to service_role using(true) with check(true);

create function public.propiedades_feed_guardar_pruebas(
  p_feed text,p_envio text,p_hash text,p_generado timestamptz,p_modo text,p_filas jsonb
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $function$
declare
  cfg public.propiedades_feed_config%rowtype;
  previo public.propiedades_feed_envios%rowtype;
  resultado jsonb;
  total integer; activas integer; anteriores integer; bajas integer; nuevas integer; cambios integer; reactivadas integer;
begin
  select * into cfg from public.propiedades_feed_config where id=p_feed and activo for update;
  if not found then raise exception 'Conexión no habilitada.'; end if;
  if p_modo not in ('incremental','completo') or jsonb_typeof(p_filas)<>'array' then raise exception 'Envío inválido.'; end if;
  total:=jsonb_array_length(p_filas);
  if total<1 or total>10000 or (select count(distinct r->>'fuente_id') from jsonb_array_elements(p_filas) r)<>total then raise exception 'Cantidad de registros o IDs inválidos.'; end if;
  select * into previo from public.propiedades_feed_envios where feed_id=p_feed and envio_id=p_envio and not publicar;
  if found then
    if previo.contenido_hash<>p_hash then raise exception 'envio_id ya existe con otro contenido. Usa un ID nuevo.'; end if;
    return previo.resultado || jsonb_build_object('repetido',true);
  end if;
  if cfg.ultimo_pruebas is not null and p_generado<=cfg.ultimo_pruebas then raise exception 'Envío antiguo: generado_at debe ser posterior al último recibido en pruebas.'; end if;
  if exists(select 1 from jsonb_array_elements(p_filas) r left join public.propiedades_feed_pruebas p
    on p.feed_id=p_feed and p.fuente_id=r->>'fuente_id' where r->>'estatus'<>'publicada' and p.fuente_id is null)
    then raise exception 'La baja contiene un ID que todavía no existe en esta conexión de pruebas.'; end if;
  select count(*) into anteriores from public.propiedades_feed_pruebas where feed_id=p_feed and estatus='publicada';
  select count(*) into bajas from public.propiedades_feed_pruebas p where p.feed_id=p_feed and p.estatus='publicada' and (
    exists(select 1 from jsonb_array_elements(p_filas) r where r->>'fuente_id'=p.fuente_id and r->>'estatus'<>'publicada') or
    (p_modo='completo' and not exists(select 1 from jsonb_array_elements(p_filas) r where r->>'fuente_id'=p.fuente_id)));
  if anteriores>0 and bajas>anteriores*cfg.max_bajas_porcentaje then raise exception 'Bajas superiores al límite de seguridad. Revisar el envío con Premier.'; end if;
  select count(*) filter(where r->>'estatus'='publicada' and p.fuente_id is null),
    count(*) filter(where r->>'estatus'='publicada' and p.estatus<>'publicada'),
    count(*) filter(where r->>'estatus'='publicada' and p.estatus='publicada' and p.datos is distinct from r)
    into nuevas,reactivadas,cambios
    from jsonb_array_elements(p_filas) r left join public.propiedades_feed_pruebas p on p.feed_id=p_feed and p.fuente_id=r->>'fuente_id';
  insert into public.propiedades_feed_pruebas as actual(feed_id,fuente_id,estatus,datos,envio_id,generado_at)
    select p_feed,r->>'fuente_id',r->>'estatus',r,p_envio,p_generado from jsonb_array_elements(p_filas) r
    on conflict(feed_id,fuente_id) do update set estatus=excluded.estatus,
      datos=case when excluded.estatus='publicada' then excluded.datos else actual.datos||excluded.datos end,
      envio_id=excluded.envio_id,generado_at=excluded.generado_at,recibido_at=now();
  if p_modo='completo' then
    update public.propiedades_feed_pruebas p set estatus='suspendida',datos=datos||'{"estatus":"suspendida"}'::jsonb,
      envio_id=p_envio,generado_at=p_generado,recibido_at=now()
      where p.feed_id=p_feed and p.estatus='publicada' and not exists(select 1 from jsonb_array_elements(p_filas) r where r->>'fuente_id'=p.fuente_id);
  end if;
  select count(*) into activas from public.propiedades_feed_pruebas where feed_id=p_feed and estatus='publicada';
  resultado:=jsonb_build_object('envio_id',p_envio,'estado','validado','publicado',false,'almacenado_en_pruebas',true,
    'recibidas',total,'activas_en_pruebas',activas,'nuevas',nuevas,'reactivadas',reactivadas,'actualizadas',cambios,'desactivadas',bajas,'modo',p_modo);
  insert into public.propiedades_feed_envios(feed_id,envio_id,publicar,contenido_hash,generado_at,resultado)
    values(p_feed,p_envio,false,p_hash,p_generado,resultado);
  update public.propiedades_feed_config set ultimo_pruebas=p_generado where id=p_feed;
  return resultado||jsonb_build_object('repetido',false);
end
$function$;
revoke all on function public.propiedades_feed_guardar_pruebas(text,text,text,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.propiedades_feed_guardar_pruebas(text,text,text,timestamptz,text,jsonb) to service_role;

create function public.propiedades_feed_consultar(p_feed text,p_texto text default '',p_estatus text default '',p_pagina integer default 1)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $function$
with filtradas as materialized (
  select * from public.propiedades_feed_pruebas p where feed_id=p_feed
    and (coalesce(p_estatus,'')='' or estatus=p_estatus)
    and (coalesce(p_texto,'')='' or concat_ws(' ',fuente_id,datos->>'titulo',datos->>'asesor_nombre',datos->>'colonia',datos->>'municipio',datos->>'estado') ilike '%'||left(p_texto,160)||'%')
), pagina as (select * from filtradas order by recibido_at desc,fuente_id limit 24 offset (least(greatest(p_pagina,1),10000)-1)*24)
select jsonb_build_object('data',coalesce((select jsonb_agg(to_jsonb(p) order by recibido_at desc,fuente_id) from pagina p),'[]'::jsonb),
  'total',(select count(*) from filtradas),
  'resumen',(select jsonb_build_object('total',count(*),'activas',count(*) filter(where estatus='publicada'),'inactivas',count(*) filter(where estatus<>'publicada'),'ultima_recepcion',max(recibido_at)) from public.propiedades_feed_pruebas where feed_id=p_feed),
  'envios',coalesce((select jsonb_agg(to_jsonb(e)) from(select envio_id,generado_at,recibido_at,resultado from public.propiedades_feed_envios where feed_id=p_feed and not publicar order by recibido_at desc limit 15)e),'[]'::jsonb),
  'rechazos',coalesce((select jsonb_agg(to_jsonb(e)) from(select id,envio_id,codigo,mensaje,recibido_at from public.propiedades_feed_rechazos where feed_id=p_feed order by recibido_at desc limit 15)e),'[]'::jsonb));
$function$;
revoke all on function public.propiedades_feed_consultar(text,text,text,integer) from public,anon,authenticated;
grant execute on function public.propiedades_feed_consultar(text,text,text,integer) to service_role;

