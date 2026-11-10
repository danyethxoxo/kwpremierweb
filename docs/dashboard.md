# Dashboard de KW Premier

Ruta: `/hub/dashboard.html`. Disponible para master, admin y staff desde el menú del Hub y sus herramientas. Usa Página Universal, el menú y el encabezado móvil compartidos. El servidor comprueba sesión, segundo factor y rol antes de devolver datos, también si hay una respuesta en caché.

## Lectura automática

`dashboard-tracker` reutiliza `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REFRESH_TOKEN` ya configurados para la cuenta de integración `dani.guerrero@kwmexico.mx`. Solo lee IDs, pestañas y rangos fijos de los dos archivos autorizados. No acepta URLs del cliente, no modifica celdas ni comparte archivos. La conexión fue comprobada contra Google Sheets en producción.

El navegador consulta cada 60 segundos mientras la pestaña está visible y al volver a ella si pasó un minuto. Actualizar permite consultar manualmente. El servidor reutiliza la misma lectura durante 30 segundos y agrupa solicitudes concurrentes. Se muestra la fecha de lectura del servidor, no la de modificación de una celda. No es una suscripción instantánea a cambios de Google Sheets.

Una lectura fallida conserva los últimos datos de la sesión y muestra que no se actualizaron. No se persiste información financiera en el navegador ni en archivos públicos de datos. Las pruebas usan cifras sintéticas.

## Fuentes y definición de indicadores

- Tracker/LORE: archivo `15LwnQ-y0cOfjXBg1hEU9qo6qQSLy6dNgCIaGHxruWPw`, pestaña KW Premier, rango A1:BE70. Fuente principal del LORE, actividad y finanzas de Premier.
- Comparativa: archivo `1s2JtYUj0mAySAEDONXJSTjPS9EDvwbQsXela-pt00qY`, pestañas KW Premier, KW City, KW Pedregal, KW Enlace, KW Mas y KW Pani-Barragán, rango A1:Z65 de cada una. No se suma Premier de ambos archivos.
- Lados cerrados: I30 y L30. Exclusivas captadas: I33 y L33. Opciones captadas: I36 y L36. Listados cerrados del inventario propio: I39 y L39. Acuerdos firmados: I42 y L42. Los volúmenes se conservan separados entre venta y renta.
- Premier: asociados J22, citas F7+I7+L7, altas O22, bajas O20, netos Q7, company dollar S7, gastos T7, GCI T19 y utilidad real T20.
- Otros MC: asociados X8, citas G12+H12, altas J10, bajas J25, netos O10, company dollar R11, gastos S11, utilidad R13 y GCI S24. Se usa el detalle de citas reportado; no el valor aislado de G14, que es inconsistente en algunas pestañas.
- Actividad: filas 10, 12 y 14, columnas AA:BE, con días 1 a 31. Un día vacío produce un hueco en la gráfica.

El parser comprueba las etiquetas de las estructuras conocidas antes de mapear celdas. Si cambia el formato, se muestra error en lugar de publicar cifras de posiciones equivocadas. Los vacíos y errores como `#DIV/0!` se representan como S/D; el cero explícito se conserva como cero.

El título del Tracker se obtiene de Google en cada lectura. El comparativo no especifica un mes: se advierte en pantalla y no se presenta como una comparación de periodos confirmados. No se inventa historia mensual ni se mezclan las semanas del bloque de inventario con el LORE.

## Verificación

Pruebas de extracción de ambos formatos, nulos y negativos; restricción de liderazgo y caché; navegador con menú real a 1440, 1366, 390 y 320 píxeles; filtros, selección de tarjeta, recuperación tras error y actualización sin perder selección. El endpoint sin sesión devuelve 401. Las fuentes originales permanecen sin cambios.
