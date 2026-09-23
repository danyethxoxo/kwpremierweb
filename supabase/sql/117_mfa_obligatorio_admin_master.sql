-- MFA obligatorio para las cuentas con privilegios administrativos.
-- Las cuentas existentes sin fila en mfa_metodos quedan bloqueadas hasta que
-- registren y verifiquen su correo de seguridad desde activar-mfa.html.
begin;

create or replace function public.mfa_sesion_autorizada()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- Una fila MFA (activa o inactiva) expresa que la cuenta ya esta dentro
    -- del flujo de segundo paso. Solo una sesion verificada puede continuar.
    when exists (
      select 1
      from public.mfa_metodos m
      where m.user_id = auth.uid()
    ) then exists (
      select 1
      from public.mfa_metodos m
      join public.mfa_sesiones s on s.user_id = m.user_id
      where m.user_id = auth.uid()
        and m.activo
        and s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and s.verificado_hasta > now()
    )
    -- Admin y master no pueden conservar el periodo de adopcion indefinido:
    -- si aun no tienen mfa_metodos, la API tambien debe negarles el acceso.
    when exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('master', 'admin')
    ) then false
    -- Asociados/staff sin MFA conservan el comportamiento gradual existente.
    else true
  end;
$$;

revoke all on function public.mfa_sesion_autorizada() from public;
grant execute on function public.mfa_sesion_autorizada() to authenticated;

notify pgrst, 'reload schema';
commit;
