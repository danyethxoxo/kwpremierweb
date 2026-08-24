-- Fase 68: índices que faltaban en llaves foráneas.
--
-- Postgres NO crea índice solo cuando declaras una llave foránea (a
-- diferencia de las llaves primarias, que sí). Sin índice, cada vez que
-- se cruza una tabla con otra por esa columna, la base lee la tabla
-- completa.
--
-- Aclaración honesta sobre la urgencia: hoy NO hay un problema de
-- lentitud por esto. Con los volúmenes actuales (cientos de filas por
-- tabla) leer la tabla completa es tan rápido que ni se nota. Esto se
-- pone ahora porque es barato y porque el costo sí crece con los años:
-- cuando haya miles de dictámenes y de documentos, ya estará resuelto
-- sin tener que salir a apagar un incendio.
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor. Es idempotente
-- y no bloquea nada de forma apreciable con el tamaño actual de las
-- tablas.

-- Cruces que sí se usan al pintar pantallas (filtrar por el padre).
create index if not exists idx_abc_avance_tema
  on public.abc_avance(tema_id);
create index if not exists idx_api_bitacora_llave
  on public.api_bitacora(llave_id);
create index if not exists idx_documentos_plantilla_plantilla
  on public.documentos_plantilla(plantilla_id);
create index if not exists idx_dictamenes_tipo_inmueble
  on public.dictamenes(tipo_inmueble_id);
create index if not exists idx_propiedades_compartidas_propiedad
  on public.propiedades_compartidas(propiedad_id);
create index if not exists idx_propiedades_destacadas_propiedad
  on public.propiedades_destacadas(propiedad_id);
create index if not exists idx_firmas_limites_user
  on public.firmas_limites(user_id);

-- Columnas de "quién lo hizo": se usan para mostrar el nombre de quien
-- capturó o autorizó. Son joins chicos, pero por consistencia quedan
-- indexadas igual.
create index if not exists idx_abc_avance_marcado_por
  on public.abc_avance(marcado_por);
create index if not exists idx_altas_procesadas_procesado_por
  on public.altas_procesadas(procesado_por);
create index if not exists idx_api_llaves_creada_por
  on public.api_llaves(creada_por);
create index if not exists idx_dictamen_historial_quien
  on public.dictamen_historial(quien);
create index if not exists idx_dictamenes_dictaminado_por
  on public.dictamenes(dictaminado_por);
create index if not exists idx_firmas_config_actualizado_por
  on public.firmas_config(actualizado_por);
create index if not exists idx_firmas_limites_actualizado_por
  on public.firmas_limites(actualizado_por);
create index if not exists idx_ingreso_asesores_capturado_por
  on public.ingreso_asesores(capturado_por);
create index if not exists idx_plantillas_documento_creada_por
  on public.plantillas_documento(creada_por);
create index if not exists idx_reservas_salas_respondido_por
  on public.reservas_salas(respondido_por);
