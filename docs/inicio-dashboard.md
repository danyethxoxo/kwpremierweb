# Inicio del asesor

`portal.html` usa el armazon de Pagina Universal, el menu general y una sola campana. Su barra de herramientas sustituye la tarjeta de Accesos Directos; el resto de las pantallas conserva su navegacion.

`assets/js/kw-inicio.js` consulta cuatro widgets independientes con la sesion autenticada:

- Propiedades nuevas: diez publicaciones ordenadas por `created_at` descendente y luego por ID, con cinco visibles y scroll propio. Los cambios de precio o sincronizacion no alteran su fecha de incorporacion. Las filas abren el enlace personalizado con el sitio KW del usuario mediante `kw-sitio-asesor.js`; el titulo abre el inventario. MC y asesor aparecen a la derecha. El menu permite abrir, copiar, compartir y descargar la ficha tecnica con el generador compartido, consultando la propiedad completa solo al solicitarla.
- Tus dictamenes: diez registros propios, por `asesor_id`, sin archivados y ordenados por actualizacion. Se consulta la tabla base con sus politicas existentes, porque la vista enriquecida es exclusiva de liderazgo. La tabla muestra expediente, dictamen, marketing y listado, y enlaza con el apartado de dictamenes.
- Perfil comprador: diez perfiles propios por `asesor_id`, incluidos los pausados. Cada fila abre el formulario del perfil guardado; Crear perfil abre uno nuevo.

- Firmas digitales: cinco documentos creados por el usuario (`user_id`), excluyendo eliminados y ordenados por ultima actualizacion. Consulta el estado para distinguir borradores, cancelados y errores de envio de las firmas pendientes. Muestra avance accesible y el conteo real de firmantes. El documento y sus firmantes se abren en el visor del home, consultando sus datos actuales antes de mostrarlos. Ver todo abre Firmas Digitales. Conserva carga, vacio y reintento independientes.

Las firmas se actualizan con eventos Realtime filtrados por usuario y agrupados durante 500 ms. Al volver a la pestana se vuelve a consultar solo ese widget si han pasado al menos 15 segundos. No ejecuta sincronizaciones de WeeTrust, no relee propiedades ni cambia permisos. Los documentos eliminados dejan de aparecer al refrescar.

El home usa lienzo gris claro, widgets blancos con borde neutro y sombra suave, saludo con Welcome Home en gris, e iconos y acentos rojo KW. La navegacion global compartida carga `kw-navegacion-oscura.css` desde `drawer.js`: barra negra con texto blanco, seleccion roja y estados de foco visibles. Este archivo solo afecta a los dos paneles de navegacion, no a los formularios ni al contenido de otras pantallas.

Los filtros personales se mantienen tambien para administradores. Los accesos de liderazgo se muestran segun `profiles.role`; no se cambian permisos ni politicas. Las consultas son de solo lectura y cada widget tiene carga, vacio, error y reintento independientes.

Los widgets no muestran contadores ni botones de actualizacion; se actualizan al recargar la pagina. Los iconos de los cuatro widgets usan trazos uniformes sin fondos de colores. Los botones Ver todo y Crear perfil usan fondo blanco, contorno y texto rojo. Los botones compactos Ver todo comparten la fila del titulo; Crear perfil conserva el signo mas centrado con su texto. El saludo y los accesos comparten el encabezado, con los accesos a la derecha. WeeTrust y KW Mexico no forman parte de la barra de herramientas de Inicio.

La prueba `tests/inicio-dashboard-browser.test.mjs` cubre aislamiento por asesor, limite y orden de consultas, enlaces, roles, fallos parciales, reintentos y anchuras de 320 a 1440 px. Las capturas se guardan en `artifacts/inicio/`.
