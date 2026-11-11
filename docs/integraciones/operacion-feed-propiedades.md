# Operación interna de Premier


La configuración se guarda en propiedades_feed_config; la clave se almacena únicamente como hash SHA-256. propiedades_feed_envios registra ID, fecha, hash y resultado; no conserva archivos ni datos personales del contacto. Las dos tablas y la función propiedades_feed_recibir solo permiten uso desde service_role.

Para lectura por URL, el administrador configura url_feed y, si aplica, authorization_feed (valor completo de Authorization, por ejemplo Bearer o Basic). Son datos privados del servidor. No se acepta una URL arbitraria enviada por el proveedor en el cuerpo. La programación debe llamar al receptor autenticado y comprobar ok, estado y publicado, no solamente HTTP 200.

La publicación permanece deshabilitada hasta completar la prueba de aceptación. No cambiar publicacion_habilitada sin conciliar IDs y revisar las consultas que actualmente filtran fuente=kwmexico. Los reportes diarios actuales de KWMéxico no incluyen automáticamente el nuevo feed.

Para rotar la clave, generar 32 bytes aleatorios, usar prefijo kwp_feed_ y guardar el SHA-256 del valor completo en token_hash. Entregar el valor original por separado. activo=false revoca toda la conexión. Conservar el historial de acuses para investigar errores o reintentos.

