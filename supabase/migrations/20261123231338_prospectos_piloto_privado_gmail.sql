-- Piloto de Prospectos. La habilitacion se decide por cuenta, no por rol.
create table private.prospectos_piloto (
 user_id uuid primary key references auth.users(id) on delete cascade,
 activo boolean not null default true
);
alter table private.prospectos_piloto enable row level security;
revoke all on private.prospectos_piloto from public,anon,authenticated;
grant all on private.prospectos_piloto to service_role;
insert into private.prospectos_piloto(user_id)
select id from auth.users where lower(btrim(email))='dani.guerrero@kwmexico.mx' and email_confirmed_at is not null;

create function private.prospectos_habilitado() returns boolean
language sql stable security definer set search_path=''
as $f$ select exists(select 1 from private.prospectos_piloto p
 where p.user_id=(select auth.uid()) and p.activo) and public.mfa_sesion_autorizada() $f$;
revoke all on function private.prospectos_habilitado() from public,anon;
grant execute on function private.prospectos_habilitado() to authenticated,service_role;
create function public.prospectos_habilitado() returns boolean
language sql stable set search_path=''
as $f$ select private.prospectos_habilitado() $f$;
revoke all on function public.prospectos_habilitado() from public,anon;
grant execute on function public.prospectos_habilitado() to authenticated,service_role;

create table public.prospectos_bandeja (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 nombre text not null check(length(btrim(nombre)) between 1 and 160),
 correo text not null default '' check(length(correo)<=254),
 telefono text not null default '' check(length(telefono)<=50),
 interes text not null default '' check(length(interes)<=1000),
 inmueble_url text not null default '' check(length(inmueble_url)<=2048 and (inmueble_url='' or inmueble_url ~ '^https://')),
 origen text not null default 'Manual' check(length(origen) between 1 and 80),
 notas text not null default '' check(length(notas)<=4000),
 gmail_message_id text check(length(gmail_message_id)<=256),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,gmail_message_id)
);
create index prospectos_bandeja_usuario_fecha on public.prospectos_bandeja(user_id,created_at desc,id);
alter table public.prospectos_bandeja enable row level security;
revoke all on public.prospectos_bandeja from public,anon;
grant select,insert,update,delete on public.prospectos_bandeja to authenticated,service_role;
create policy prospectos_solo_piloto on public.prospectos_bandeja for all to authenticated
using(user_id=(select auth.uid()) and (select private.prospectos_habilitado()))
with check(user_id=(select auth.uid()) and (select private.prospectos_habilitado()));

create table public.prospectos_reglas (
 user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 remitentes text[] not null default array[]::text[] check(cardinality(remitentes)<=30),
 asuntos text[] not null default array[]::text[] check(cardinality(asuntos)<=30),
 updated_at timestamptz not null default now()
);
alter table public.prospectos_reglas enable row level security;
revoke all on public.prospectos_reglas from public,anon;
grant select,insert,update,delete on public.prospectos_reglas to authenticated,service_role;
create policy prospectos_reglas_solo_piloto on public.prospectos_reglas for all to authenticated
using(user_id=(select auth.uid()) and (select private.prospectos_habilitado()))
with check(user_id=(select auth.uid()) and (select private.prospectos_habilitado()));

create table private.prospectos_gmail_config (
 user_id uuid primary key references auth.users(id) on delete cascade,
 client_id text not null,
 secreto jsonb not null,
 updated_at timestamptz not null default now()
);
create table private.prospectos_gmail_conexiones (
 user_id uuid primary key references auth.users(id) on delete cascade,
 correo text not null,
 credenciales jsonb not null,
 scopes text not null,
 vinculada_at timestamptz not null default now(),
 comprobada_at timestamptz not null default now()
);
create table private.prospectos_gmail_estados (
 hash text primary key check(hash ~ '^[a-f0-9]{64}$'),
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 verificador jsonb not null,
 vence_at timestamptz not null default now()+interval '10 minutes'
);
create index prospectos_gmail_estados_usuario on private.prospectos_gmail_estados(user_id);
alter table private.prospectos_gmail_config enable row level security;
alter table private.prospectos_gmail_conexiones enable row level security;
alter table private.prospectos_gmail_estados enable row level security;
revoke all on private.prospectos_gmail_config,private.prospectos_gmail_conexiones,private.prospectos_gmail_estados from public,anon,authenticated;
grant all on private.prospectos_gmail_config,private.prospectos_gmail_conexiones,private.prospectos_gmail_estados to service_role;

-- Exclusivo del backend. Nunca se devuelve este resultado al navegador sin sanear.
create function public.prospectos_gmail_backend(p_accion text,p_usuario uuid,p_sesion uuid,p_datos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $f$
declare r jsonb;
begin
 if not exists(select 1 from private.prospectos_piloto where user_id=p_usuario and activo)
 or not public.security_sesion_vigente(p_usuario,p_sesion)
 then raise exception using errcode='42501',message='No autorizado'; end if;
 if p_accion='estado' then
  return jsonb_build_object('config',(select to_jsonb(c) from private.prospectos_gmail_config c where c.user_id=p_usuario),
   'conexion',(select to_jsonb(c) from private.prospectos_gmail_conexiones c where c.user_id=p_usuario));
 elsif p_accion='configurar' then
  if exists(select 1 from private.prospectos_gmail_conexiones where user_id=p_usuario)
  then raise exception using errcode='22023',message='Desvincula Gmail antes de cambiar la configuracion'; end if;
  if length(p_datos->>'client_id')>256 or coalesce(p_datos->>'client_id','') !~ '^[a-zA-Z0-9_-]+[.]apps[.]googleusercontent[.]com$'
  or jsonb_typeof(p_datos->'secreto')<>'object'
  then raise exception using errcode='22023',message='Configuracion invalida'; end if;
  insert into private.prospectos_gmail_config(user_id,client_id,secreto)
  values(p_usuario,p_datos->>'client_id',p_datos->'secreto')
  on conflict(user_id) do update set client_id=excluded.client_id,secreto=excluded.secreto,updated_at=now();
  delete from private.prospectos_gmail_estados where user_id=p_usuario;
  return '{"ok":true}'::jsonb;
 elsif p_accion='crear_estado' then
  delete from private.prospectos_gmail_estados where user_id=p_usuario or vence_at<now();
  insert into private.prospectos_gmail_estados(hash,user_id,session_id,verificador)
  values(p_datos->>'hash',p_usuario,p_sesion,p_datos->'verificador');
  return '{"ok":true}'::jsonb;
 elsif p_accion='consumir_estado' then
  delete from private.prospectos_gmail_estados e where e.hash=p_datos->>'hash'
   and e.user_id=p_usuario and e.session_id=p_sesion and e.vence_at>now()
  returning e.verificador into r;
  return r;
 elsif p_accion='conectar' then
  if not exists(select 1 from private.prospectos_gmail_config c where c.user_id=p_usuario and c.client_id=p_datos->>'client_id')
  then raise exception using errcode='22023',message='La configuracion cambio'; end if;
  insert into private.prospectos_gmail_conexiones(user_id,correo,credenciales,scopes)
  values(p_usuario,p_datos->>'correo',p_datos->'credenciales',p_datos->>'scopes')
  on conflict(user_id) do update set correo=excluded.correo,credenciales=excluded.credenciales,scopes=excluded.scopes,comprobada_at=now();
  return '{"ok":true}'::jsonb;
 elsif p_accion='desconectar' then
  delete from private.prospectos_gmail_estados where user_id=p_usuario;
  delete from private.prospectos_gmail_conexiones c where c.user_id=p_usuario returning to_jsonb(c) into r;
  return r;
 else raise exception using errcode='22023',message='Accion invalida';
 end if;
end $f$;
revoke all on function public.prospectos_gmail_backend(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.prospectos_gmail_backend(text,uuid,uuid,jsonb) to service_role;
