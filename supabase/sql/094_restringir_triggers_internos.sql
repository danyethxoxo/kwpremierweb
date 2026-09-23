-- Fase 94: los triggers internos no son una API del navegador.
--
-- Estas funciones se invocan exclusivamente desde triggers de PostgreSQL.
-- Los triggers conservan su ejecución al correr dentro de la transacción que
-- los dispara; se bloquea únicamente la ejecución directa por roles expuestos.

begin;

revoke execute on function public.dictamen_asesores_reflejar_cambio() from public, anon, authenticated;
revoke execute on function public.dictamen_asesores_reflejar_perfil() from public, anon, authenticated;
revoke execute on function public.dictamen_historia() from public, anon, authenticated;
revoke execute on function public.dictamen_punto_historia() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.notificar_dictamen() from public, anon, authenticated;
revoke execute on function public.notificar_prospecto_nuevo() from public, anon, authenticated;
revoke execute on function public.notificar_reclutamiento_nuevo() from public, anon, authenticated;
revoke execute on function public.notificar_resena_nueva() from public, anon, authenticated;
revoke execute on function public.notificar_reserva_sala_actualizada() from public, anon, authenticated;
revoke execute on function public.notificar_reserva_sala_nueva() from public, anon, authenticated;
revoke execute on function public.notificar_ticket_actualizado() from public, anon, authenticated;
revoke execute on function public.notificar_ticket_nuevo() from public, anon, authenticated;
revoke execute on function public.notificar_usuario_nuevo() from public, anon, authenticated;
revoke execute on function public.operatividad_al_dictaminar() from public, anon, authenticated;
revoke execute on function public.operatividad_al_guardar_documento() from public, anon, authenticated;
revoke execute on function public.proteger_rol_perfil() from public, anon, authenticated;

commit;
