-- Fase 92: las vistas de lectura nunca son superficies de escritura.
--
-- Estas vistas combinan tablas con RLS, datos derivados y, en los casos
-- públicos, columnas seleccionadas de perfiles. El navegador solamente las
-- consulta; no existe ningún flujo de la aplicación que inserte, actualice o
-- elimine registros a través de ellas. Revocar DML evita que una vista
-- actualizable se convierta por accidente en una vía alternativa a las
-- políticas de sus tablas base.
--
-- Es idempotente y conserva SELECT para anon/authenticated. service_role y
-- postgres no se modifican para mantener las integraciones del servidor.

begin;

revoke all on table public.incidencias_con_reportante from anon, authenticated;
revoke all on table public.perfiles_publicos from anon, authenticated;
revoke all on table public.reservas_salas_con_datos from anon, authenticated;
revoke all on table public.propiedades_publicas from anon, authenticated;
revoke all on table public.propiedades_inventario from anon, authenticated;
revoke all on table public.documentos_plantilla_con_asesor from anon, authenticated;
revoke all on table public.dictamen_historial_con_quien from anon, authenticated;
revoke all on table public.dictamenes_con_asesor from anon, authenticated;
revoke all on table public.documentos_con_asesor from anon, authenticated;

grant select on table public.incidencias_con_reportante to authenticated;
grant select on table public.perfiles_publicos to anon, authenticated;
grant select on table public.reservas_salas_con_datos to authenticated;
grant select on table public.propiedades_publicas to anon, authenticated;
grant select on table public.propiedades_inventario to authenticated;
grant select on table public.documentos_plantilla_con_asesor to authenticated;
grant select on table public.dictamen_historial_con_quien to authenticated;
grant select on table public.dictamenes_con_asesor to authenticated;
grant select on table public.documentos_con_asesor to authenticated;

notify pgrst, 'reload schema';

commit;
