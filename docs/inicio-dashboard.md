# Inicio del asesor

`portal.html` usa el armazon de Pagina Universal, el menu general y una sola campana. Su barra de herramientas sustituye la tarjeta de Accesos Directos; el resto de las pantallas conserva su navegacion.

`assets/js/kw-inicio.js` consulta tres widgets independientes con la sesion autenticada:

- Propiedades nuevas: diez publicaciones ordenadas por `created_at` descendente y luego por ID. Los cambios de precio o sincronizacion no alteran su fecha de incorporacion. Las filas abren la ficha local de la propiedad; el titulo abre el inventario.
- Tus dictamenes: diez registros propios, por `asesor_id`, sin archivados y ordenados por actualizacion. Se consulta la tabla base con sus politicas existentes, porque la vista enriquecida es exclusiva de liderazgo. La tabla muestra expediente, dictamen, marketing y listado, y enlaza con el apartado de dictamenes.
- Perfil comprador: diez perfiles propios por `asesor_id`, incluidos los pausados. Cada fila abre el formulario del perfil guardado; Crear perfil abre uno nuevo.

Los filtros personales se mantienen tambien para administradores. Los accesos de liderazgo se muestran segun `profiles.role`; no se cambian permisos ni politicas. Las consultas son de solo lectura y cada widget tiene carga, vacio, error y reintento independientes.

La prueba `tests/inicio-dashboard-browser.test.mjs` cubre aislamiento por asesor, limite y orden de consultas, enlaces, roles, fallos parciales, reintentos y anchuras de 320 a 1440 px. Las capturas se guardan en `artifacts/inicio/`.
