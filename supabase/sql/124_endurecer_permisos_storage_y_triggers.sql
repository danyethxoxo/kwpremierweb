-- Reduce la superficie expuesta sin romper los flujos públicos intencionales.
-- Las imágenes del bucket `perfiles` siguen siendo públicas por URL, pero ya
-- no se permite enumerar todo su contenido mediante el API de Storage.
begin;

drop policy if exists "perfiles_storage_select_public" on storage.objects;

-- Los triggers se ejecutan por las operaciones sobre sus tablas. Conservamos
-- ejecución para usuarios autenticados y service_role, pero no para anon.
revoke execute on function public.abc_registrar_avance_historial() from public;
grant execute on function public.abc_registrar_avance_historial() to authenticated;

revoke execute on function public.abc_preparar_comentario() from public;
grant execute on function public.abc_preparar_comentario() to authenticated;

-- Estos wrappers no se usan desde políticas públicas; sus implementaciones
-- privadas son las que deben proteger las comprobaciones de rol.
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_master() from anon;
revoke execute on function public.is_admin_or_master() from anon;
revoke execute on function public.is_staff_or_above() from anon;

commit;

notify pgrst, 'reload schema';
