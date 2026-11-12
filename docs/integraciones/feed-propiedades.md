# Conexión de propiedades con KW Premier

Versión 1 | 11 de noviembre de 2026 | Para Ricardo y el equipo técnico de KW

## Requerimientos

Queremos dar de alta www.kwpremieroficial.com como destino de publicación de las propiedades autorizadas de KW. Ya tenemos un receptor HTTPS para archivos JSON o XML. Necesitamos confirmar si KW enviará el inventario a nuestra dirección o si nos proporcionará una URL para consultarlo, y recibir una muestra real con su documentación.

Esta integración cubre propiedades. Contactos, leads y oportunidades de Command necesitan una integración y autorizaciones independientes.

## Qué proporciona Premier

- Portal: https://www.kwpremieroficial.com
- Receptor: https://iloetojomzqtadkithtv.supabase.co/functions/v1/recibir-feed-propiedades
- Método: POST desde el servidor del proveedor.
- Autenticación: cabecera `x-api-key` con una clave exclusiva entregada por separado. No se requieren claves de Supabase, cuentas del portal ni contraseñas de Command.
- Formatos: `application/json` o `application/xml`, codificados en UTF-8.
- Estado inicial: validación habilitada; publicación deshabilitada. Un archivo de prueba no modifica el catálogo público.

El receptor acepta el contrato de datos versión 1 descrito aquí. Si KW usa otro esquema, necesitamos su muestra para preparar y probar el adaptador. No se debe asumir compatibilidad automática por el solo hecho de ser JSON o XML.

## Qué necesitamos de Ricardo o de su equipo

1. Confirmar la modalidad: envío a nuestro receptor o lectura desde una URL de KW.
2. Entregar una muestra real y el diccionario de campos, valores de estatus y operación.
3. Indicar el identificador estable de cada propiedad y cómo relacionarlo con los IDs publicados actualmente en KWMéxico y Command.
4. Confirmar el alcance autorizado: Premier, asesores específicos, red nacional u otro conjunto. Indicar cómo se identifica la oficina y el asesor.
5. Explicar cómo informan bajas, ventas, rentas y eliminaciones; si el archivo es completo o solo contiene cambios; y cómo indican el total y la última página.
6. Confirmar frecuencia, credenciales, caducidad de enlaces de fotografías, límites, condiciones de uso y contacto de soporte.

## Modalidad A: KW envía el archivo

Enviar el cuerpo completo del JSON o XML por POST. No usar multipart/form-data, ZIP, adjuntos por correo ni un objeto que solo contenga una URL. Las fotografías se referencian mediante URLs HTTPS; no se adjuntan sus archivos binarios.

```sh
curl --request POST \
  'https://iloetojomzqtadkithtv.supabase.co/functions/v1/recibir-feed-propiedades' \
  --header "x-api-key: $KWP_FEED_KEY" \
  --header 'Content-Type: application/json' \
  --data-binary '@ejemplo-propiedades.json'
```

Para XML, cambiar Content-Type a application/xml y usar ejemplo-propiedades.xml. La variable KWP_FEED_KEY representa la clave privada, que no se incluye en este documento.

La ruta sin parámetros solo valida. Una vez autorizada y configurada la publicación por Premier, el proveedor usa la misma ruta con `?publicar=true`. Antes de habilitarla, esa petición devuelve HTTP 409.

## Modalidad B: Premier consulta la URL de KW

Ricardo entrega una URL HTTPS y sus credenciales, si las requiere. Premier configura esa dirección en el servidor y programa la consulta con la frecuencia acordada. La dirección y las credenciales nunca se colocan en el navegador ni en el repositorio.

El receptor ya puede descargar una URL configurada por Premier mediante POST a la misma dirección con `?descargar=true`. Requiere la clave de feed. Para publicar después de la habilitación: `?descargar=true&publicar=true`.

Actualmente no hay una URL oficial configurada ni un horario de consulta oficial activo. Se configurarán cuando KW entregue su fuente. El descargador no sigue redirecciones, admite un archivo por consulta, espera hasta 30 segundos y aplica el mismo contrato de datos y límite de tamaño. Si la API requiere OAuth, paginación, varias solicitudes o un formato distinto, se prepara su adaptador antes de activarla.

## Contrato de datos versión 1

JSON usa un objeto con `version`, `envio_id`, `generado_at`, `modo`, `total` y el arreglo `propiedades`. XML usa una raíz `<feed>`, los mismos campos como elementos y `<propiedades><propiedad>...</propiedad></propiedades>`.

| Campo de envío | Regla |
| --- | --- |
| version | 1 |
| envio_id | ID único del envío, máximo 100 caracteres. Letras, números, punto, guion, dos puntos o guion bajo. |
| generado_at | Fecha ISO 8601 con zona horaria, por ejemplo 2026-11-11T18:00:00Z. Debe avanzar en cada nueva publicación. |
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
| descripcion, calle, colonia, cp, pais | Opcionales; cp es texto y pais usa MX para México. |
| recamaras, estacionamientos | Conteos enteros no negativos. |
| banos, m2_construccion, m2_terreno | Números no negativos; punto para decimales. Superficies en metros cuadrados. |
| lat, lng | Coordenadas geográficas numéricas opcionales. |
| imagenes | Arreglo de URLs HTTPS en JSON. En XML: imagenes/foto. Máximo 100. |
| caracteristicas | Arreglo de textos en JSON. En XML: caracteristicas/caracteristica. |
| market_center, asesor_nombre, asesor_kw_id | Datos de identificación de oficina y asesor. Recomendados. |
| asesor_email | Correo del asesor para enlazar con su perfil de Premier. Opcional y válido. No incluir datos de clientes o propietarios. |

Una ficha activa se envía completa: los campos opcionales omitidos se vacían al actualizarla. Una baja puede enviar solamente id y estatus; conserva el resto de la ficha existente. IDs duplicados, estatus desconocidos, cifras inválidas o total inconsistente rechazan todo el lote.

## Altas, cambios y bajas

- Incremental: actualiza únicamente los IDs recibidos. Omitir una propiedad no la desactiva.
- Completo: actualiza el conjunto y suspende las propiedades ausentes, exclusivamente dentro de esta conexión. Nunca modifica por ausencia otras fuentes.
- Bajas explícitas: usar el ID existente y su nuevo estatus. No se elimina físicamente la ficha ni su historial.
- Reenvíos: repetir el mismo envio_id y contenido devuelve el resultado anterior con repetido=true. Reutilizar el ID con otro contenido devuelve 409.
- Orden: un envío nuevo más antiguo o con la misma fecha que la última publicación se rechaza.
- Protección: si una publicación retira más del 20 % de las activas de esta conexión, se bloquea para revisión de Premier. El límite puede ajustarse por el administrador tras validar el lote.
- Integridad: cada publicación se aplica en una sola transacción. Un error revierte todo el lote.

## Respuestas y comprobación

Una validación correcta responde HTTP 200, pero NO significa que se haya publicado:

```json
{"ok":true,"envio_id":"ejemplo-json-20261111-01","estado":"validado","publicado":false,"recibidas":1,"activas_en_envio":1,"bajas_en_envio":0,"modo":"incremental","repetido":false}
```

Tras habilitar producción, la respuesta tiene estado=publicado, publicado=true y los conteos nuevas, reactivadas, actualizadas y desactivadas. Premier conserva un registro de recepción por envio_id. Este acuse permite rastrear lo recibido; no sustituye la comprobación visual del portal.

| HTTP | Significado y acción |
| --- | --- |
| 200 | Revisar estado y publicado. Puede ser solo validación. |
| 401 | Clave ausente, inválida o deshabilitada. |
| 409 | Publicación pendiente, envío conflictivo/antiguo, baja desconocida, duplicidad entre fuentes o límite de bajas. Revisar error. |
| 413 | Archivo mayor a 8 MiB. |
| 415 | Content-Type no admitido. |
| 422 | Archivo o datos inválidos. Corregir y reenviar. |
| 429 | Límite de solicitudes. Respetar Retry-After. |
| 502/503 | Fuente o servicio temporalmente no disponible. Reintentar con el mismo envio_id y contenido. |

Límites: 30 solicitudes por minuto por conexión y 60 por IP en este receptor, sujetos también a los límites generales del servidor. No enviar la clave como parámetro de URL ni incluirla en capturas o registros.

## Prueba de aceptación antes de publicar

1. KW envía una muestra JSON o XML y recibe estado=validado con los mismos IDs y cantidades.
2. Premier verifica fotografías accesibles, precio, moneda, ubicación, oficina y asesor. Los ejemplos adjuntos son ficticios; example.com no representa fotografías reales.
3. Se concilian IDs con el catálogo actual para conservar enlaces y evitar anuncios duplicados, incluso cuando los identificadores de KW y KWMéxico sean diferentes.
4. Se define qué fuente gobierna cada propiedad y se ajustan buscador, perfil comprador, reportes y programación según el alcance. La lectura actual de KWMéxico no se sustituye automáticamente.
5. En un entorno controlado se prueban alta, cambio de precio/foto, baja, reactivación y reenvío sin duplicación. Se compara un inventario completo por ID y cantidad.
6. Premier habilita la publicación y se comprueba en el portal con IDs reales, además del acuse HTTP. Se acuerdan monitoreo y horario con el proveedor.

## Material para entregar

Enviar a Ricardo este documento y los archivos ejemplo-propiedades.json y ejemplo-propiedades.xml. La clave exclusiva se entrega por un canal privado al responsable técnico. No enviar claves generales de Supabase ni del sincronizador existente.

## Operación interna de Premier

La configuración se guarda en propiedades_feed_config; la clave se almacena únicamente como hash SHA-256. propiedades_feed_envios registra ID, fecha, hash y resultado; no conserva archivos ni datos personales del contacto. Las dos tablas y la función propiedades_feed_recibir solo permiten uso desde service_role.

Para lectura por URL, el administrador configura url_feed y, si aplica, authorization_feed (valor completo de Authorization, por ejemplo Bearer o Basic). Son datos privados del servidor. No se acepta una URL arbitraria enviada por el proveedor en el cuerpo. La programación debe llamar al receptor autenticado y comprobar ok, estado y publicado, no solamente HTTP 200.

La publicación permanece deshabilitada hasta completar la prueba de aceptación. No cambiar publicacion_habilitada sin conciliar IDs y revisar las consultas que actualmente filtran fuente=kwmexico. Los reportes diarios actuales de KWMéxico no incluyen automáticamente el nuevo feed.

Para rotar la clave, generar 32 bytes aleatorios, usar prefijo kwp_feed_ y guardar el SHA-256 del valor completo en token_hash. Entregar el valor original por separado. activo=false revoca toda la conexión. Conservar el historial de acuses para investigar errores o reintentos.


