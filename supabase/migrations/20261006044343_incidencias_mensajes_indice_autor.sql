-- Cubrir la referencia al autor sin modificar conversaciones ni permisos.
create index if not exists incidencias_mensajes_autor on public.incidencias_mensajes(user_id);
