# Sincronización de asesores

El panel consulta la base de datos al entrar. El trabajo `asesores-libro-cada-2-minutos` consulta Google Sheets en segundo plano cada dos minutos y conserva las reglas de `asesores_sincronizar`: coincidencia por correo, valores vacíos sin borrado y grupos fijados desde el sitio.

`asesores_sync_control` registra una huella de la última importación completa, sus fechas, error y una exclusión temporal de cinco minutos para evitar ejecuciones simultáneas. La importación usa lotes de 20. Una hoja vacía o fallida no elimina registros; una importación fallida no avanza la huella. Cuando la hoja no cambió, no se vuelven a escribir los asesores.

El servicio usa el secreto de Vault `kw_webhook_secret`. La función verifica `WEBHOOK_SECRET` y permite importar el libro, procesar las altas guardadas en la cola o completar cumpleaños de contactos existentes a partir del padrón. No acepta personas ni permisos arbitrarios por esta ruta. Las peticiones de usuarios conservan validación de sesión, MFA y rol.

Al crear un asesor activo, reactivarlo o asignarle correo mientras está activo, un trigger guarda una tarea de Google en la misma transacción. Aplica al formulario, el panel y la sincronización del libro; respeta los grupos fijados. No se vuelven a otorgar permisos a todo el padrón ni a las cuentas retiradas anteriormente. Sin correo se conserva el registro y se encola cuando se captura.

La tarea crea el contacto y otorga Drive y Calendario con las funciones existentes, consultando antes lo que ya existe. Un aviso asíncrono inicia el proceso al guardar; un cron cada minuto recupera tareas pendientes. Los errores se reintentan después de dos minutos. Hay un bloqueo global con vencimiento de cinco minutos y una revisión por tarea para no confirmar una versión reemplazada. Antes de otorgar, se comprueba que el asesor siga activo y conserve el mismo correo. Los resultados quedan en `asesores_altas_google`; las altas completas también en `altas_procesadas`. El formulario guarda primero y no espera las llamadas de Google.

Los contactos nuevos incluyen cumpleaños válidos; si ya existen, se completa únicamente el cumpleaños ausente. `cumpleanos_contactos` permite revisar el padrón completo sin escribir por defecto; `aplicar: true` procesa hasta 20 contactos por cuenta, con continuación por identificador. La base es la primera fuente y el libro complementa fechas ausentes. Solo se emparejan correos exactos; las fechas ambiguas o desconocidas quedan pendientes. Cada escritura consulta el contacto vigente, conserva su etag, modifica solo `birthdays` y verifica la fecha devuelta. No crea contactos, elimina fichas ni cambia accesos, etiquetas u otros campos. Las escrituras de una cuenta se ejecutan en secuencia. La rutina no está programada para alterar periódicamente todos los contactos.

Al completar una importación con cambios, Realtime notifica al panel mediante la tabla de control, consultable exclusivamente por Liderazgo con sesión MFA autorizada. Se actualiza el directorio sin esperar otra lectura de Sheets; los formularios y las operaciones activas no bloquean la apertura del panel.

Recargar el libro, revisar accesos y descargar CSV o Excel están disponibles para Liderazgo. La administración de accesos existentes conserva su autorización propia. El Excel respeta la lista y búsqueda actuales, ofrece filtros en cada columna, encabezados congelados y formato azul. No exporta contraseñas ni CURP.

Trello todavía requiere autorización de una cuenta con acceso al tablero Ingresos. La conexión puede usar una API key y token de lectura guardados como secretos de servidor `TRELLO_API_KEY` y `TRELLO_TOKEN`; no deben almacenarse en archivos públicos o en el navegador.
