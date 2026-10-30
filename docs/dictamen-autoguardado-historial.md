# Borradores e historial de dictamenes

El editor protege los cambios en almacenamiento local por usuario en cada input o cambio y los sincroniza tras 800 ms de inactividad. Al salir, ocultar la pagina o recargar conserva una copia local y hace un ultimo intento de sincronizacion. No depende de que una peticion termine durante el cierre del navegador.

El primer autoguardado de un documento nuevo crea un dictamen en estado borrador con un ID estable. Los reintentos no crean otro expediente. Los campos completos, fechas parciales, clientes, correcciones y observaciones aun sin agregar se respaldan en dictamen_autoguardados. Cada usuario puede leer y eliminar solo su respaldo; el RPC exige permiso de dictaminar y sesion MFA autorizada. Una edicion de un dictamen emitido no cambia sus datos oficiales hasta Guardar. Los autoguardados no generan revisiones ni envian avisos o correos.

Los borradores locales pendientes aparecen en la lista aunque no hayan alcanzado a sincronizarse. Al reabrir, se recupera primero el respaldo local pendiente o, si no lo hay, el de la plataforma. Guardar limpia los respaldos de ese documento. Eliminar borrador no exige archivar antes y borra tambien los respaldos y observaciones asociados. Los dictamenes emitidos mantienen el flujo de archivo anterior.

El timeline va del inicio al movimiento mas reciente y comienza con Se inicio el dictamen / Borrador. Conserva estatus, observaciones nuevas, editadas, corregidas o quitadas, marketing, listado, contratos, ediciones y archivo. Los envios incluyen destinatarios y responsable y se registran desde enviar-dictamen-email solo cuando Resend acepta el correo. Un rechazo no se registra como envio; un fallo de auditoria despues del envio se avisa sin marcar el correo como fallido.

Las observaciones conservan los IDs recibidos al crearlas para evitar quitarlas y recrearlas al volver a guardar. El trigger de observaciones omite nuevas entradas cuando se elimina en cascada el expediente completo.

Pruebas: dictamen-autoguardado.test.mjs verifica SQL, RLS, MFA, idempotencia, eliminacion en cascada y recuperacion tras recarga sin conexion. dictamen-autoguardado-integracion.test.mjs ejecuta el formulario real con respaldo de clientes, folios y fechas parciales. dictamen-historial-browser.test.mjs revisa orden, escape y presentacion en escritorio y movil. Las pruebas de envio simulan Resend.
