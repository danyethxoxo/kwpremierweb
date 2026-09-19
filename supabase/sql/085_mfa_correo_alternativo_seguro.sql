-- MFA por correo alternativo, ligado a cada sesion real de Supabase.
-- Ejecutar antes de desplegar la version nueva de la funcion mfa-correo.

create table if not exists public.mfa_metodos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  canal text not null default 'correo' check (canal = 'correo'),
  destino text not null,
  activo boolean not null default false,
  verificado_en timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.mfa_sesiones (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  verificado_hasta timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_mfa_sesiones_usuario on public.mfa_sesiones(user_id, verificado_hasta);

alter table public.mfa_correo_codigos add column if not exists proposito text not null default 'acceso';
alter table public.mfa_correo_codigos add column if not exists destino text;
create index if not exists idx_mfa_codigos_limite on public.mfa_correo_codigos(user_id, created_at desc);

alter table public.mfa_metodos enable row level security;
alter table public.mfa_sesiones enable row level security;
-- Sin politicas: solamente la Edge Function con service_role puede leerlas.

-- Conserva la proteccion de quienes ya habian activado la version anterior.
-- Temporalmente reciben el codigo en su correo de acceso; desde Perfil pueden
-- sustituirlo por un correo alternativo sin quedar bloqueados.
insert into public.mfa_metodos (user_id, destino, activo, verificado_en)
select id, email, true, now()
from auth.users
where coalesce((raw_app_meta_data ->> 'mfa_correo_activo')::boolean, false)
  and email is not null
on conflict (user_id) do nothing;

create or replace function public.mfa_sesion_autorizada()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from public.mfa_metodos m
      where m.user_id = auth.uid() and m.activo
    )
    or exists (
      select 1 from public.mfa_sesiones s
      where s.user_id = auth.uid()
        and s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and s.verificado_hasta > now()
    );
$$;
revoke all on function public.mfa_sesion_autorizada() from public;
grant execute on function public.mfa_sesion_autorizada() to authenticated;

-- Este chequeo ocurre antes de cualquier consulta PostgREST, incluso RPC con
-- SECURITY DEFINER. Es el candado principal contra saltarse el formulario.
create or replace function public.mfa_verificar_peticion()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and not public.mfa_sesion_autorizada() then
    raise insufficient_privilege using message = 'Se requiere verificacion en dos pasos';
  end if;
end;
$$;
revoke all on function public.mfa_verificar_peticion() from public;
grant execute on function public.mfa_verificar_peticion() to anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'public.mfa_verificar_peticion';
notify pgrst, 'reload config';

-- Una politica RESTRICTIVE se combina con las politicas existentes. Asi, una
-- sesion que deba segundo factor no puede saltarse la pantalla llamando la API
-- de Supabase directamente. Las cuentas que aun no activan MFA siguen igual.
do $$
declare tabla record;
begin
  for tabla in
    select schemaname, tablename from pg_tables
    where schemaname = 'public'
      and rowsecurity
      and tablename not in ('mfa_metodos', 'mfa_sesiones', 'mfa_correo_codigos')
  loop
    execute format('drop policy if exists mfa_sesion_requerida on %I.%I', tabla.schemaname, tabla.tablename);
    execute format(
      'create policy mfa_sesion_requerida on %I.%I as restrictive for all to authenticated using (public.mfa_sesion_autorizada()) with check (public.mfa_sesion_autorizada())',
      tabla.schemaname, tabla.tablename
    );
  end loop;
end $$;

delete from public.mfa_correo_codigos where created_at < now() - interval '24 hours';
delete from public.mfa_sesiones where verificado_hasta < now();
