create table public.comprador_estados (
 perfil_id uuid primary key references public.perfiles_comprador(id) on delete cascade,
 asesor_id uuid not null references public.profiles(id) on delete cascade,
 revision uuid not null default gen_random_uuid(),
 pendiente boolean not null default true,
 motivo text not null default 'perfil',
 calculado_at timestamptz,
 total integer not null default 0,
 niveles jsonb not null default '{}',
 ultimo_error text
);
create index comprador_estados_asesor_idx on public.comprador_estados(asesor_id);
create table public.comprador_resultados (
 perfil_id uuid not null references public.perfiles_comprador(id) on delete cascade,
 propiedad_id uuid not null references public.propiedades(id) on delete cascade,
 asesor_id uuid not null references public.profiles(id) on delete cascade,
 porcentaje integer not null check (porcentaje between 0 and 100),
 criterios jsonb not null,
 vigente boolean not null default true,
 primera_coincidencia timestamptz not null default now(),
 notificado_at timestamptz,
 primary key(perfil_id,propiedad_id)
);
create index comprador_resultados_asesor_idx on public.comprador_resultados(asesor_id);
create index comprador_resultados_propiedad_idx on public.comprador_resultados(propiedad_id);
create index comprador_resultados_pagina_idx on public.comprador_resultados(perfil_id,porcentaje desc,propiedad_id) where vigente;
alter table public.comprador_estados enable row level security;
alter table public.comprador_resultados enable row level security;
revoke all on public.comprador_estados,public.comprador_resultados from public,anon,authenticated;
grant select on public.comprador_estados,public.comprador_resultados to authenticated;
grant all on public.comprador_estados,public.comprador_resultados to service_role;
create policy comprador_estados_propios on public.comprador_estados for select to authenticated using ((select auth.uid())=asesor_id);
create policy comprador_resultados_propios on public.comprador_resultados for select to authenticated using ((select auth.uid())=asesor_id);

create or replace function private.comprador_encolar_perfil() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into public.comprador_estados(perfil_id,asesor_id) values(new.id,new.asesor_id)
 on conflict(perfil_id) do update set revision=gen_random_uuid(),pendiente=true,motivo='perfil',ultimo_error=null;
 return new;
end; $$;
revoke all on function private.comprador_encolar_perfil() from public,anon,authenticated;
create trigger comprador_encolar after insert or update on public.perfiles_comprador for each row execute function private.comprador_encolar_perfil();
insert into public.comprador_estados(perfil_id,asesor_id) select id,asesor_id from public.perfiles_comprador;

create or replace function public.comprador_marcar_inventario() returns void language sql security invoker set search_path=pg_catalog as $$
 update public.comprador_estados e set pendiente=true,revision=gen_random_uuid(),motivo=case when e.pendiente and e.motivo='perfil' then 'perfil' else 'inventario' end
 from public.perfiles_comprador c where c.id=e.perfil_id and c.activo;
$$;
revoke all on function public.comprador_marcar_inventario() from public,anon,authenticated;
grant execute on function public.comprador_marcar_inventario() to service_role;

create or replace function public.comprador_guardar_resultados(p_perfil uuid,p_revision uuid,p_resultados jsonb)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare e public.comprador_estados; c public.perfiles_comprador; niveles_nuevos jsonb; total_nuevo integer;
begin
 select * into e from public.comprador_estados where perfil_id=p_perfil for update;
 if not found or e.revision<>p_revision or not e.pendiente then return false; end if;
 select * into c from public.perfiles_comprador where id=p_perfil;
 update public.comprador_resultados set vigente=false where perfil_id=p_perfil;
 insert into public.comprador_resultados(perfil_id,propiedad_id,asesor_id,porcentaje,criterios,vigente,notificado_at)
 select c.id,r.propiedad_id,c.asesor_id,r.porcentaje,r.criterios,true,
 case when e.calculado_at is not null and e.motivo='inventario' then null else now() end
 from jsonb_to_recordset(p_resultados) as r(propiedad_id uuid,porcentaje integer,criterios jsonb)
 join public.propiedades p on p.id=r.propiedad_id and p.estatus='publicada'
 where c.activo and r.porcentaje>=c.umbral_match
 on conflict(perfil_id,propiedad_id) do update set porcentaje=excluded.porcentaje,criterios=excluded.criterios,vigente=true;
 select count(*) into total_nuevo from public.comprador_resultados where perfil_id=c.id and vigente;
 select coalesce(jsonb_object_agg(nivel,n),'{}') into niveles_nuevos from
 (select (porcentaje/10)*10 as nivel,count(*) as n from public.comprador_resultados where perfil_id=c.id and vigente group by (porcentaje/10)*10) s;
 update public.comprador_estados set total=total_nuevo,niveles=niveles_nuevos,pendiente=false,calculado_at=now(),ultimo_error=null where perfil_id=c.id;
 return true;
end; $$;
revoke all on function public.comprador_guardar_resultados(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.comprador_guardar_resultados(uuid,uuid,jsonb) to service_role;

create or replace function public.comprador_matches_pagina(p_perfil uuid,p_nivel integer,p_offset integer default 0)
returns table(porcentaje integer,criterios jsonb,propiedad jsonb)
language sql stable security invoker set search_path=pg_catalog as $$
 select r.porcentaje,r.criterios,to_jsonb(p) from public.comprador_resultados r
 join public.propiedades_inventario p on p.id=r.propiedad_id and p.estatus='publicada'
 join public.comprador_estados e on e.perfil_id=r.perfil_id and not e.pendiente
 where r.perfil_id=p_perfil and r.vigente and (r.porcentaje/10)*10=p_nivel
 order by r.porcentaje desc,r.propiedad_id limit 5 offset greatest(p_offset,0);
$$;
revoke all on function public.comprador_matches_pagina(uuid,integer,integer) from public,anon;
grant execute on function public.comprador_matches_pagina(uuid,integer,integer) to authenticated,service_role;

create or replace function private.comprador_enviar_resumenes() returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare asesor record; mensajes text; n integer:=0;
begin
 -- Hora local y candado evitan envíos fuera de las 09:00 o duplicados concurrentes.
 if extract(hour from now() at time zone 'America/Mexico_City')<>9 then return 0; end if;
 if not pg_try_advisory_xact_lock(91260401) then return 0; end if;
 for asesor in select distinct r.asesor_id from public.comprador_resultados r
 join public.comprador_estados e on e.perfil_id=r.perfil_id and not e.pendiente
 join public.perfiles_comprador c on c.id=r.perfil_id and c.activo
 join public.propiedades p on p.id=r.propiedad_id and p.estatus='publicada'
 where r.vigente and r.notificado_at is null loop
  select string_agg(nombre||': '||cantidad||' nuevas coincidencias',E'\n' order by nombre) into mensajes from
  (select c.nombre,count(*) as cantidad from public.comprador_resultados r
   join public.perfiles_comprador c on c.id=r.perfil_id and c.activo
   join public.comprador_estados e on e.perfil_id=c.id and not e.pendiente
   join public.propiedades p on p.id=r.propiedad_id and p.estatus='publicada'
   where r.asesor_id=asesor.asesor_id and r.vigente and r.notificado_at is null group by c.id,c.nombre) s;
  insert into public.notificaciones(user_id,tipo,titulo,mensaje,url)
  values(asesor.asesor_id,'comprador_matches','Nuevas propiedades para tus clientes',mensajes,'/hub/perfil-comprador.html');
  update public.comprador_resultados r set notificado_at=now() from public.comprador_estados e,public.perfiles_comprador c,public.propiedades p
  where r.asesor_id=asesor.asesor_id and r.perfil_id=e.perfil_id and c.id=r.perfil_id and c.activo and not e.pendiente and p.id=r.propiedad_id and p.estatus='publicada' and r.vigente and r.notificado_at is null;
  n:=n+1;
 end loop;
 return n;
end; $$;
revoke all on function private.comprador_enviar_resumenes() from public,anon,authenticated;

-- SCHEDULE: Vault mantiene el secreto fuera de archivos y respuestas públicas.
create or replace function private.comprador_disparar_worker() returns bigint
language plpgsql security definer set search_path=pg_catalog as $$
declare secreto text;
begin
 if not exists(select 1 from public.comprador_estados where pendiente) then return null; end if;
 select decrypted_secret into secreto from vault.decrypted_secrets where name='kw_webhook_secret' limit 1;
 if secreto is null then raise exception 'Falta el secreto del worker'; end if;
 return net.http_post(url:='https://iloetojomzqtadkithtv.supabase.co/functions/v1/matches-comprador',
 headers:=jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_ZvaIC0_lkd6OQ0VMihOvjA_BIgpbClq','x-webhook-secret',secreto),body:='{}'::jsonb,timeout_milliseconds:=60000);
end; $$;
revoke all on function private.comprador_disparar_worker() from public,anon,authenticated;
select cron.schedule('kw-comprador-worker','* * * * *','select private.comprador_disparar_worker()');
-- 15:00 UTC = 09:00 Ciudad de México. Reintentos en esa hora no duplican resúmenes.
select cron.schedule('kw-comprador-resumen-9am','0,10,20,30,40,50 15 * * *','select private.comprador_enviar_resumenes()');
