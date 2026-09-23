-- Fase 93: ruta de búsqueda estable para funciones auxiliares.
--
-- Evita que estas funciones resuelvan objetos con el search_path de la sesión
-- que las invoca. Se conserva public para las referencias existentes y
-- pg_temp queda al final para no anteponer objetos temporales a los del
-- esquema de la aplicación.

begin;

alter function public.abc_touch_updated_at() set search_path = public, pg_temp;
alter function public.dictamen_nombre_estado(text) set search_path = public, pg_temp;
alter function public.operatividad_clave(text) set search_path = public, pg_temp;
alter function public.operatividad_estatus_dictamen(text) set search_path = public, pg_temp;
alter function public.operatividad_fecha(text) set search_path = public, pg_temp;
alter function public.operatividad_mes(date) set search_path = public, pg_temp;
alter function public.operatividad_numero(text) set search_path = public, pg_temp;
alter function public.operatividad_partir_direccion(text) set search_path = public, pg_temp;
alter function public.operatividad_texto(text) set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.touch_propiedad() set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.validar_roles_documento() set search_path = public, pg_temp;

commit;
