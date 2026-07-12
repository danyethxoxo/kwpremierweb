-- Fase 10: paneles por rol — gestión de usuarios (editar/borrar con
-- permisos por rol) y vista de todos los documentos con su asesor.
-- Ejecutar completo en Supabase Dashboard > SQL Editor.

-- 1) Vista: cada documento guardado junto con los datos de quién lo
--    creó. El control de acceso va en el WHERE (no depende de que las
--    políticas de "profiles" y "documentos_guardados" coincidan): solo
--    tu propio documento, o cualquiera si eres staff/admin/master.
create or replace view public.documentos_con_asesor as
select
  d.id,
  d.user_id,
  d.tipo_documento,
  d.nombre_archivo,
  d.folio,
  d.estado,
  d.created_at,
  d.updated_at,
  p.nombre as asesor_nombre,
  p.apellido as asesor_apellido,
  p.email as asesor_email
from public.documentos_guardados d
join public.profiles p on p.id = d.user_id
where auth.uid() = d.user_id or public.is_staff_or_above();

grant select on public.documentos_con_asesor to authenticated;

-- 2) Seguridad: nadie puede cambiarse su propio rol directamente
--    (solo lo puede hacer la Edge Function "gestionar-usuario", que
--    usa la llave de servicio y por eso corre como "service_role").
create or replace function public.proteger_rol_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> old.role and auth.role() <> 'service_role' then
    raise exception 'No tienes permiso para cambiar el rol de este perfil';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_rol on public.profiles;
create trigger trg_proteger_rol
  before update on public.profiles
  for each row execute function public.proteger_rol_perfil();
