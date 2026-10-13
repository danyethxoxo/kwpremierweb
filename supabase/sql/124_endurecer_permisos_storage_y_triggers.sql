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

-- Los helpers de rol se conservan para anon porque las políticas públicas los
-- invocan; con auth.uid() nulo devuelven false y no conceden acceso.

commit;

notify pgrst, 'reload schema';
