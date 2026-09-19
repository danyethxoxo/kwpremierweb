-- MFA obligatorio para invitados nuevos y dispositivos confiables por 7 dias.
-- Ejecutar antes de desplegar mfa-correo e invitar-usuario actualizados.

alter table public.mfa_metodos alter column destino drop not null;

create table if not exists public.mfa_dispositivos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  nombre text,
  creado_en timestamptz not null default now(),
  ultimo_acceso timestamptz not null default now(),
  revocado_en timestamptz,
  unique (user_id, token_hash)
);
create index if not exists idx_mfa_dispositivos_vigentes
  on public.mfa_dispositivos(user_id, ultimo_acceso desc)
  where revocado_en is null;
alter table public.mfa_dispositivos enable row level security;
-- Sin politicas: solo Edge Functions con service_role.

-- Consume el codigo bajo bloqueo de fila. Evita que solicitudes paralelas
-- prueben mas combinaciones que el maximo permitido.
create or replace function public.mfa_consumir_codigo(
  p_user_id uuid,
  p_proposito text,
  p_codigo_hash text
)
returns table(resultado text, destino text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo public.mfa_correo_codigos%rowtype;
begin
  select * into v_codigo
  from public.mfa_correo_codigos
  where user_id = p_user_id and proposito = p_proposito
  order by created_at desc
  limit 1
  for update;

  if not found then return query select 'no_encontrado'::text, null::text; return; end if;
  if v_codigo.usado then return query select 'usado'::text, null::text; return; end if;
  if v_codigo.expira_en <= now() then
    update public.mfa_correo_codigos set usado = true where id = v_codigo.id;
    return query select 'vencido'::text, null::text; return;
  end if;
  if v_codigo.intentos >= 5 then
    update public.mfa_correo_codigos set usado = true where id = v_codigo.id;
    return query select 'bloqueado'::text, null::text; return;
  end if;
  if v_codigo.codigo_hash <> p_codigo_hash then
    update public.mfa_correo_codigos
      set intentos = intentos + 1, usado = (intentos + 1 >= 5)
      where id = v_codigo.id;
    return query select 'incorrecto'::text, null::text; return;
  end if;

  update public.mfa_correo_codigos set usado = true where id = v_codigo.id;
  return query select 'ok'::text, v_codigo.destino;
end;
$$;
revoke all on function public.mfa_consumir_codigo(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mfa_consumir_codigo(uuid, text, text) to service_role;

-- Sin fila MFA: usuario existente en periodo de adopcion. Fila inactiva:
-- invitado nuevo que debe terminar el alta. Fila activa: exige sesion MFA.
create or replace function public.mfa_sesion_autorizada()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (select 1 from public.mfa_metodos m where m.user_id = auth.uid())
    or exists (
      select 1
      from public.mfa_metodos m
      join public.mfa_sesiones s on s.user_id = m.user_id
      where m.user_id = auth.uid()
        and m.activo
        and s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and s.verificado_hasta > now()
    );
$$;
revoke all on function public.mfa_sesion_autorizada() from public;
grant execute on function public.mfa_sesion_autorizada() to authenticated;

delete from public.mfa_dispositivos where revocado_en < now() - interval '90 days';
delete from public.mfa_sesiones where verificado_hasta < now() - interval '1 day';
