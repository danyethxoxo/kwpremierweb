# Conexión de propiedades con KW Premier

Versión 1.2 | 12 de noviembre de 2026 | Para Ricardo y el equipo técnico de KW


El cambio a KWEB conserva el receptor de Supabase, el contrato de datos y la clave de integración. La documentación anterior sigue accesible en el dominio institucional.

## Qué proporciona Premier

- Portal receptor: https://kweb.com.mx (KWEB, sistema de KW Premier)
- Sitio institucional: https://www.kwpremieroficial.com
- Receptor: https://iloetojomzqtadkithtv.supabase.co/functions/v1/recibir-feed-propiedades
- Método: POST desde el servidor del proveedor.
- Autenticación: cabecera `x-api-key` con una clave exclusiva entregada por separado. No se requieren claves de Supabase, cuentas del portal ni contraseñas de Command.
- Formatos: `application/json` o `application/xml`, codificados en UTF-8.
- Estado inicial: recepción y almacenamiento privados habilitados; publicación pública deshabilitada. Los archivos aceptados se muestran en el apartado privado Propiedades (pruebas), sin modificar el catálogo actual.

El receptor acepta el contrato de datos versión 1 descrito aquí. Si KW usa otro esquema, necesitamos su muestra para preparar y probar el adaptador. No se debe asumir compatibilidad automática por el solo hecho de ser JSON o XML.

## Qué necesitamos de Ricardo o de su equipo

1. Confirmar la modalidad: envío a nuestro receptor o lectura desde una URL de KW.
2. Entregar una muestra real y el diccionario de campos, valores de estatus y operación.
3. Indicar el identificador estable de cada propiedad y cómo relacionarlo con los IDs publicados actualmente en KWMéxico y Command.
4. Confirmar el alcance autorizado: Premier, asesores específicos, red nacional u otro conjunto. Indicar cómo se identifica la oficina y el asesor.
5. Explicar cómo informan bajas, ventas, rentas y eliminaciones; si el archivo es completo o solo contiene cambios; y cómo indican el total y la última página.
6. Confirmar frecuencia, credenciales, caducidad de enlaces de fotografías, límites, condiciones de uso y contacto de soporte.

## Envío al portal: modalidad principal

Enviar el cuerpo completo del JSON o XML por POST. No usar multipart/form-data, ZIP, adjuntos por correo ni un objeto que solo contenga una URL. Las fotografías se referencian mediante URLs HTTPS; no se adjuntan sus archivos binarios.

```sh
curl --request POST \
  'https://iloetojomzqtadkithtv.supabase.co/functions/v1/recibir-feed-propiedades' \
  --header "x-api-key: $KWP_FEED_KEY" \
  --header 'Content-Type: application/json' \
  --data-binary '@ejemplo-propiedades.json'
```

Para XML, cambiar Content-Type a application/xml y usar ejemplo-propiedades.xml. La variable KWP_FEED_KEY representa la clave privada, que no se incluye en este documento.

La ruta sin parámetros valida y guarda las fichas en el inventario privado de pruebas. Esta es la dirección que debe usar KW ahora. No agregar `?publicar=true`: la publicación al catálogo actual permanece deshabilitada y responde HTTP 409. El proveedor no necesita una cuenta en el portal de Premier; se autentica con su clave de integración.

## Alternativa: Premier consulta la URL de KW

Ricardo entrega una URL HTTPS y sus credenciales, si las requiere. Premier configura esa dirección en el servidor y programa la consulta con la frecuencia acordada. La dirección y las credenciales nunca se colocan en el navegador ni en el repositorio.

El receptor ya puede descargar una URL configurada por Premier mediante POST a la misma dirección con `?descargar=true`. Requiere la clave de feed. Para publicar después de la habilitación: `?descargar=true&publicar=true`.

Actualmente no hay una URL oficial configurada ni un horario de consulta oficial activo. Se configurarán cuando KW entregue su fuente. El descargador no sigue redirecciones, admite un archivo por consulta, espera hasta 30 segundos y aplica el mismo contrato de datos y límite de tamaño. Si la API requiere OAuth, paginación, varias solicitudes o un formato distinto, se prepara su adaptador antes de activarla.

## Contrato de datos versión 1

JSON usa un objeto con `version`, `envio_id`, `generado_at`, `modo`, `total` y el arreglo `propiedades`. XML usa una raíz `<feed>`, los mismos campos como elementos y `<propiedades><propiedad>...</propiedad></propiedades>`.

| Campo de envío | Regla |
| --- | --- |
| version | 1 |
| envio_id | ID único del envío, máximo 100 caracteres. Letras, números, punto, guion, dos puntos o guion bajo. |
| generado_at | Fecha ISO 8601 con zona horaria, por ejemplo 2026-11-11T18:00:00Z. Debe avanzar en cada nuevo envío. |
| modo | incremental o completo. |
| total | Número exacto de propiedades de este envío. |
| propiedades | Entre 1 y 10,000 registros; tamaño total máximo 8 MiB. |

El formato completo requiere el inventario íntegro del alcance acordado, no una página de resultados. No enviar un inventario vacío para retirar todo: esa operación se coordina con Premier. Envíos mayores se dividen en lotes incrementales; no se consideran cada lote como inventarios completos.

| Campo de propiedad | Regla |
| --- | --- |
| id | Obligatorio, estable, único, texto de hasta 120 caracteres. Conservar ceros iniciales. |
| estatus | activa/publicada, inactiva/suspendida, vendida, rentada, reservada o no_publicada. |
| titulo | Obligatorio para una propiedad activa. |
| operacion | venta o renta; obligatorio para una activa. |
| tipo | Obligatorio para una activa; ejemplo Casa o Departamento. Confirmar catálogo con KW. |
| precio | Obligatorio para una activa; número mayor a cero sin símbolos ni separadores de miles. |
| moneda | MXN o USD; obligatoria para una activa. |
| estado, municipio | Obligatorios para una activa. estado es la entidad federativa; no es el estatus. |
| dias_en_mercado | Opcional: entero no negativo enviado por KW. Se muestra tal como lo informa el proveedor, incluido 0. |
| fecha_publicacion | Opcional: fecha AAAA-MM-DD de inicio de comercialización. Permite calcular días si no se recibe dias_en_mercado. |
| fecha_cierre | Opcional: fecha AAAA-MM-DD del cierre o retiro. No puede ser futura ni anterior a fecha_publicacion. |
| descripcion, calle, colonia, cp, pais | Opcionales; cp es texto y pais usa MX para México. |
| recamaras, estacionamientos | Conteos enteros no negativos. |
| banos, m2_construccion, m2_terreno | Números no negativos; punto para decimales. Superficies en metros cuadrados. |
| lat, lng | Coordenadas geográficas numéricas opcionales. |
| imagenes | Arreglo de URLs HTTPS en JSON. En XML: imagenes/foto. Máximo 100. |
| caracteristicas | Arreglo de textos en JSON. En XML: caracteristicas/caracteristica. |
| market_center, asesor_nombre, asesor_kw_id | Datos de identificación de oficina y asesor. Recomendados. |
| asesor_email | Correo del asesor para enlazar con su perfil de Premier. Opcional y válido. No incluir datos de clientes o propietarios. |

Los estatus se aceptan sin distinguir mayúsculas/minúsculas: activa/publicada, inactiva/suspendida, vendida, rentada, reservada y no_publicada. La pantalla permite filtrarlos y conserva las fichas después de una baja. Para una baja basta con el ID y el estatus; también puede incluir los días y fechas finales. Un ID nuevo debe enviarse primero como ficha activa.

Si KW envía dias_en_mercado, ese valor tiene prioridad y no se incrementa automáticamente. Si no lo envía y existe fecha_publicacion, calculamos días naturales hasta fecha_cierre; sin cierre, las activas se calculan hasta hoy en Ciudad de México y las demás requieren fecha_cierre o una cifra de días enviada por KW. Sin cifra ni fecha de inicio se muestra Sin dato, nunca 0 inventado. Si se actualizan fechas sin enviar una cifra de días, se descarta la cifra anterior para recalcular. En una baja que no incluya días ni fechas se conserva la información previa. No calculamos esta antigüedad desde la primera recepción en nuestra web.

Una ficha activa se envía completa: los campos opcionales omitidos se vacían al actualizarla. Una baja puede enviar solamente id y estatus; conserva el resto de la ficha existente. IDs duplicados, estatus desconocidos, cifras inválidas o total inconsistente rechazan todo el lote.

## Altas, cambios y bajas

- Incremental: actualiza únicamente los IDs recibidos. Omitir una propiedad no la desactiva.
- Completo: actualiza el conjunto y suspende las propiedades ausentes, exclusivamente dentro de esta conexión. Nunca modifica por ausencia otras fuentes.
- Bajas explícitas: usar el ID existente y su nuevo estatus. No se elimina físicamente la ficha ni su historial.
- Reenvíos: repetir el mismo envio_id y contenido devuelve el resultado anterior con repetido=true. Reutilizar el ID con otro contenido devuelve 409.
- Orden: un envío nuevo más antiguo o con la misma fecha que el último envío aceptado se rechaza.
- Protección: si un envío retira más del 20 % de las activas de esta conexión, se bloquea para revisión de Premier. El límite puede ajustarse por el administrador tras validar el lote.
- Integridad: cada recepción se aplica en una sola transacción. Un error revierte todo el lote.

## Respuestas y comprobación

Una recepción privada correcta responde HTTP 200 y almacenado_en_pruebas=true. Significa que las fichas ya están disponibles en el apartado privado, pero NO están publicadas en el catálogo actual:

```json
{"ok":true,"envio_id":"kw-20261112-01","estado":"validado","publicado":false,"almacenado_en_pruebas":true,"recibidas":1,"activas_en_pruebas":1,"nuevas":1,"reactivadas":0,"actualizadas":0,"desactivadas":0,"modo":"incremental","repetido":false}
```

Tras habilitar producción, la respuesta tiene estado=publicado, publicado=true y los conteos nuevas, reactivadas, actualizadas y desactivadas. Premier conserva un registro de recepción por envio_id. Este acuse permite rastrear lo recibido; no sustituye la comprobación visual del portal.

| HTTP | Significado y acción |
| --- | --- |
| 200 | Revisar ok y almacenado_en_pruebas. publicado=false es correcto para esta conexión privada. |
| 401 | Clave ausente, inválida o deshabilitada. |
| 409 | Publicación pendiente, envío conflictivo/antiguo, baja desconocida, duplicidad entre fuentes o límite de bajas. Revisar error. |
| 413 | Archivo mayor a 8 MiB. |
| 415 | Content-Type no admitido. |
| 422 | Archivo o datos inválidos. Corregir y reenviar. |
| 429 | Límite de solicitudes. Respetar Retry-After. |
| 502/503 | Fuente o servicio temporalmente no disponible. Reintentar con el mismo envio_id y contenido. |

Límites: 30 solicitudes por minuto por conexión y 60 por IP en este receptor, sujetos también a los límites generales del servidor. No enviar la clave como parámetro de URL ni incluirla en capturas o registros.

## Flujo de conexión y aceptación privada

1. Premier entrega por separado la clave; Ricardo configura el receptor, Content-Type y x-api-key en el sistema emisor. KW envía un archivo inicial con un envio_id nuevo y una fecha actual. Debe recibir ok=true y almacenado_en_pruebas=true con la cantidad esperada.
2. Un usuario master o admin abre https://www.kwpremieroficial.com/hub/propiedades-pruebas.html con su sesión habitual. Deben aparecer los IDs recibidos, las fichas, fotografías, precios, moneda, ubicación y asesor. La pantalla consulta los datos cada 30 segundos y tiene un botón Actualizar. Los ejemplos adjuntos son ficticios; example.com no representa fotografías reales.
3. Se concilian IDs con el catálogo actual para conservar enlaces y evitar anuncios duplicados, incluso cuando los identificadores de KW y KWMéxico sean diferentes.
4. Se define qué fuente gobierna cada propiedad y se ajustan buscador, perfil comprador, reportes y programación según el alcance. La lectura actual de KWMéxico no se sustituye automáticamente.
5. KW envía un cambio de precio o foto con un nuevo envio_id y generado_at posterior; después, una baja y una reactivación. Premier revisa el resultado en la ficha y en Recepciones. Reenviar un archivo idéntico debe responder repetido=true sin duplicar registros. Un lote rechazado no cambia ninguna ficha; el panel muestra los rechazos autenticados registrados.
6. Se comparan IDs y cantidades del inventario privado con el emisor, y se acuerdan frecuencia y monitoreo. Con esto queda aceptada la conexión privada. Una migración posterior al catálogo actual requiere una decisión y conciliación independientes; no es necesaria para comenzar estas pruebas.

## Confirmación de un envío por el proveedor

El proveedor puede consultar un envío aceptado, sin iniciar sesión en la web, usando GET y su misma clave:

```sh
curl 'https://iloetojomzqtadkithtv.supabase.co/functions/v1/recibir-feed-propiedades?envio_id=kw-20261112-01' \
  --header "x-api-key: $KWP_FEED_KEY"
```

La consulta solo permite ver acuses de su propia conexión. Responde 200 con resultado, recibido_at y generado_at, o 404 si ese envío no fue aceptado. Para reintentar un fallo temporal se reenvía el mismo cuerpo y envio_id. Para corregir un archivo rechazado o cambiar su contenido, usar un nuevo envio_id y una fecha generado_at posterior. Los errores procesados después de autenticar pueden incluir recepcion_id para soporte; no todos los rechazos del gateway, como un archivo demasiado grande, llegan al registro del panel.

## Reglas para la operación privada

- Primer envío: inventario completo del alcance acordado, o lotes incrementales coordinados si excede los límites. No enviar cada página de una API como inventario completo.
- Cada propiedad usa el mismo ID en altas, cambios, bajas y reactivaciones. Un cambio de precio no genera un ID nuevo.
- Cada nuevo envío avanza generado_at. Nunca lanzar lotes simultáneos sin coordinar su orden; un envío antiguo se rechaza para no sobrescribir datos recientes.
- El modo completo y el límite de bajas del 20 % también se aplican al inventario privado. Para retirar más del límite, coordinar la revisión con Premier; no fragmentar envíos para eludirlo.
- Una baja requiere un ID ya recibido. Se conserva su ficha y cambia de estatus, por lo que puede seguir revisándose con los filtros del apartado.
- Enviar fotos mediante URLs HTTPS accesibles desde el navegador; la recepción valida la URL, pero no garantiza que la imagen exista o que el proveedor permita descargarla. Confirmar permisos y vigencia.
- Las fichas privadas no se muestran en el buscador actual, no generan leads y no se mezclan con los reportes de KWMéxico.
- No compartir la clave en el navegador, capturas o enlaces. Para rotación o incidencias, canalizar con el responsable técnico de Premier a través de Ricardo. Confirmar ese contacto durante el alta.

## Material para entregar

Enviar a Ricardo este documento y los archivos ejemplo-propiedades.json y ejemplo-propiedades.xml. La clave exclusiva se entrega por un canal privado al responsable técnico. No enviar claves generales de Supabase ni del sincronizador existente.

## Operación interna de Premier

La configuración se guarda en propiedades_feed_config; la clave se almacena únicamente como hash SHA-256. propiedades_feed_envios registra ID, fecha, hash y resultado; no conserva archivos ni datos personales del contacto. Las tablas de conexión, acuses, propiedades_feed_pruebas y propiedades_feed_rechazos solo permiten uso desde service_role. Las fichas normalizadas sí se conservan en propiedades_feed_pruebas. El panel las consulta a través de la función autenticada propiedades-feed-pruebas, que exige MFA y rol master o admin.

Para lectura por URL, el administrador configura url_feed y, si aplica, authorization_feed (valor completo de Authorization, por ejemplo Bearer o Basic). Son datos privados del servidor. No se acepta una URL arbitraria enviada por el proveedor en el cuerpo. La programación debe llamar al receptor autenticado y comprobar ok, estado y publicado, no solamente HTTP 200.

La publicación permanece deshabilitada hasta completar la prueba de aceptación. No cambiar publicacion_habilitada sin conciliar IDs y revisar las consultas que actualmente filtran fuente=kwmexico. Los reportes diarios actuales de KWMéxico no incluyen automáticamente el nuevo feed.

Para rotar la clave, generar 32 bytes aleatorios, usar prefijo kwp_feed_ y guardar el SHA-256 del valor completo en token_hash. Entregar el valor original por separado. activo=false revoca toda la conexión. Conservar el historial de acuses para investigar errores o reintentos.




