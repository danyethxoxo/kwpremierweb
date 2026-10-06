# Incidencias para la demo

La dirección visual está fijada por Página Universal y Firmas Digitales.
Se conserva su lienzo claro, Poppins, barra de 292 px, encabezado, campana
y acciones compartidas. Refero aporta el criterio de formularios recuperables,
estados explícitos y foco visible; Impeccable aporta la comprobación de errores,
texto largo y dispositivos pequeños. No se introducen imágenes decorativas.

| Decisión | Referencia | Propósito |
| --- | --- | --- |
| Barra de búsqueda y filtros, encabezado y botones compartidos | `docs/pagina-universal.md`, `hub/firmas.html` | Mantener la identidad aprobada |
| Formulario dentro de la página | Página Universal, Impeccable Operate | Dar espacio para redactar y adjuntar capturas |
| Tipos problema, sugerencia y duda | Demo para 10 asesores | Recoger tanto fallos como retroalimentación |
| Borrador, validación y errores recuperables | Refero Craft Details, Impeccable Harden | Evitar perder trabajo o duplicar envíos |
| Conversación y enlaces por folio | Flujo reportar, responder, revisar | Mantener el seguimiento en un solo lugar |

## Despliegue

Aplicar `supabase/migrations/20261006042944_incidencias_demo_seguimiento.sql`
y `supabase/migrations/20261006044343_incidencias_mensajes_indice_autor.sql`
antes de publicar `hub/tickets.html` y sus dos assets específicos. La migración
conserva los reportes y respuestas previos. Las notificaciones nuevas usan un
enlace directo; los avisos anteriores no se modifican.

Los asociados y staff reportan y comentan sus propios casos. Admin y master
gestionan todos, conforme a los permisos actuales del servidor. Los mensajes
son inmutables y tienen RLS; los asesores no pueden leer conversaciones ajenas.
El cambio de estado y la respuesta del equipo se guardan en una transacción,
con control de versión e idempotencia para reintentos.

Las capturas siguen en el bucket privado, con enlaces firmados de 5 minutos.
El texto del borrador se guarda por usuario en el navegador; archivos locales
sin subir requieren mantener la página abierta. Los identificadores de envío
se reutilizan para recuperar una confirmación perdida por fallos de conexión.

## Verificación

La suite de Node pasó con 80 pruebas y una omisión existente de respaldo;
las 11 pruebas de Edge también pasaron. El navegador automatizado verifica
escritorio y celular, borrador después de recargar, filtros móviles, doble
clic, confirmación perdida tras insertar, un solo envío/archivo y comentarios.
Su autenticación y red son simuladas; no sustituye una sesión real de asesor.

En Supabase se verificaron RLS, privilegios y vista invoker, y se probó insertar,
consultar y guardar seguimiento como authenticated con MFA, incluyendo un
reintento idempotente, dentro de una transacción revertida. No quedaron reportes
de prueba ni se confirmaron notificaciones de esa transacción. La entrega de
correo a destinatarios reales no se probó. Los avisos de seguridad existentes
en otros módulos no forman parte de este cambio; incidencias no añadió avisos.
