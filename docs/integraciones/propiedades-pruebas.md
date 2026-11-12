# Operación del inventario privado

## Acceso

- Pantalla: /hub/propiedades-pruebas.html, llamada Propiedades, con distintivo Pruebas.
- Roles: master y admin, con sesión y MFA. El backend verifica el rol en profiles; ocultar la navegación no es la barrera de acceso.
- La clave del proveedor no se envía al navegador del administrador. El proveedor no necesita cuenta del portal.

## Flujo

1. El proveedor hace POST al receptor recibir-feed-propiedades, con x-api-key y un JSON/XML versión 1.
2. El lector valida el lote completo. La clave se compara mediante SHA-256 con propiedades_feed_config.
3. El servidor invoca propiedades_feed_guardar_pruebas. Una transacción bloquea la configuración de esa conexión para ordenar los envíos, verifica idempotencia, fecha y límite de bajas, y guarda las fichas en propiedades_feed_pruebas.
4. El acuse queda en propiedades_feed_envios con almacenado_en_pruebas=true y publicado=false.
5. La pantalla consulta propiedades-feed-pruebas cada 30 segundos cuando la pestaña está visible. La función requiere sesión, MFA y rol master/admin; consulta únicamente kw-oficial.
6. El proveedor puede verificar un envío aceptado con GET al receptor usando envio_id y su clave. Los rechazos procesados tras autenticación se registran en propiedades_feed_rechazos; los rechazos previos del gateway pueden no generar registro.

El endpoint del proveedor también conserva su modalidad de lectura desde una URL configurada por el administrador. Para esta integración el flujo principal es envío directo al receptor. No hay horario de consulta oficial activo.

## Reglas

- Inventario privado físicamente separado de public.propiedades; no interviene en búsquedas, compradores, leads ni correos actuales de KWMéxico.
- Sin promoción automática al catálogo actual. publicacion_habilitada permanece false.
- Envios completos suspenden ausentes solo en su conexión; incrementales conservan los demás IDs.
- Bajas conservan la ficha. Rechazar bajas de IDs desconocidos y cualquier lote que retire más del porcentaje configurado.
- Reenvíos aceptados devuelven el resultado original y repetido=true; no actualizan fechas ni duplican fichas.
- Los dos acuses de ejemplo anteriores a esta pantalla se etiquetan como Validación anterior. No contienen fichas persistidas y no se pueden reconstruir desde esos acuses. Un nuevo envío con un nuevo ID sí se almacena.
- Cada ficha activa se recibe completa. Omitir opcionales vacía esos campos; una baja mínima conserva los datos anteriores.

## Verificación

- tests/feed-pruebas.sql prueba altas, cambios, bajas, reactivaciones, snapshots, orden, reenvíos, RLS y aislamiento en una transacción con rollback.
- tests/feed-pruebas-api.test.mjs prueba roles y alcance fijo del backend.
- tests/feed-pruebas-browser.test.mjs comprueba Página Universal con drawer, campana única, ficha, búsqueda, paginación, errores, vacío, recepciones y escritorio/móvil.
- La prueba HTTP de despliegue se hizo con una conexión temporal independiente. Se retiraron sus datos y credencial; no se dejaron anuncios ficticios en el catálogo del proveedor ni en public.propiedades.

Antes de cualquier paso a producción pública: recibir muestra real, verificar correspondencia de IDs, definir autoridad de la fuente y adaptar las consultas/reportes que filtran kwmexico. Ese paso es independiente de esta conexión privada.

