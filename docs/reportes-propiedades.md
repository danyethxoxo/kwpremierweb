# Reportes de propiedades

El inventario se consulta a medianoche y mediodía de Ciudad de México desde la API pública de KW México. Los reportes describen esa fuente; no consultan Command directamente.

Cada página se reintenta hasta tres veces ante interrupciones de red o HTTP 429, 500, 502, 503 y 504. Se conservan el offset y las comprobaciones de integridad. Una falla persistente aborta la lectura; no se aplican bajas por ausencia sobre una descarga incompleta. Los reintentos no convierten respuestas fallidas en un catálogo vacío.

El correo y el Excel distinguen la última comprobación de la última fecha de estatus entregada por la fuente. Si la fecha de estatus más reciente está al menos 72 horas detrás de la comprobación, muestran un aviso para revisar la actualización de KW México. Esta es una señal de revisión, no una afirmación de que cada propiedad esté desactualizada. Las fechas de estatus de origen se muestran como fecha de calendario en UTC para evitar que el 29 de octubre aparezca como 28 por conversión de zona horaria.

La operación interna `vista_previa: true` devuelve los conteos y el aviso sin reclamar ni enviar un correo. Requiere el secreto habitual de sincronización o, exclusivamente para esta consulta, el webhook interno. El webhook no permite enviar correos. El destino de los reportes sigue siendo el configurado en servidor.

## Comprobación del 3 de noviembre de 2026

Se descargaron todas las páginas de la fuente con parámetros nuevos y encabezado de revalidación: 7,474 registros únicos. La comparación completa con la descarga del 2 de noviembre no encontró registros agregados, retirados ni modificados. La fecha de estatus máxima en los datos era el 29 de octubre de 2026. La fuente no estaba entregando movimientos más recientes; repetir nuestra sincronización no puede incorporar registros ausentes de ella.

Se verificó la nueva consulta en producción, sin enviar correos ni modificar inventario. Pasaron 12 pruebas del reporte y de la ejecución programada/manual, además de la comprobación de tipos de la función.
