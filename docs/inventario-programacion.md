# Lecturas de propiedades

El inventario de KW México se actualiza a las 00:00 y 12:00 de America/Mexico_City. Supabase Cron ejecuta `kw-inventario-medianoche-mediodia` a las 06:00 y 18:00 UTC. La tarea anterior `kw-inventario-diario-3am` queda inactiva.

Los intentos de los minutos 10, 20, 30, 40 y 50 recuperan fallas de fuente o correo. `inventario-diario` identifica cada periodo de doce horas: si la lectura ya terminó correctamente, solo reintenta el reporte pendiente; si ambos terminaron, no repite ninguno. Una lectura incompleta conserva el estado de error para reintentarse. El último intento avisa si la actualización sigue pendiente. Cada reporte abarca desde el reporte anterior enviado.

La programación y su estado se verificaron en producción el 22 de octubre de 2026. Los límites de medianoche, mediodía y cambio de fecha están cubiertos por `tests/inventario-diario.test.mjs`.
