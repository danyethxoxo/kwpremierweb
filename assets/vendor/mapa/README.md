# Mapa de Propiedades

Dependencias locales, descargadas después de mostrar las primeras tarjetas:

- Leaflet 1.9.4: https://github.com/Leaflet/Leaflet/tree/v1.9.4 (BSD-2-Clause, `leaflet-LICENSE`).
- Leaflet.markercluster 1.5.3: https://github.com/Leaflet/Leaflet.markercluster/tree/v1.5.3 (MIT, `markercluster-LICENSE`).
- MapLibre GL JS 5.7.1: https://github.com/maplibre/maplibre-gl-js/tree/v5.7.1 (BSD-3-Clause, `maplibre-LICENSE`).
- MapLibre GL Leaflet 0.1.4: https://github.com/maplibre/maplibre-gl-leaflet (ISC, `leaflet-maplibre-LICENSE`).

Archivos de distribución obtenidos de jsDelivr con versiones fijas. No incluyen claves ni telemetría propia.

El fondo vectorial usa OpenFreeMap y un estilo Liberty personalizado, congelado en `assets/data/mapa/entorno.json`. `node herramientas/generar-estilo-mapa.mjs` permite regenerarlo. Destaca estaciones de Metro y tren, hospitales y parques; muestra educación y lugares culturales al acercarse, y reserva las paradas de autobús para un zoom mayor. Omite comercios genéricos, números de edificios y flechas. Nombres en español cuando existen. Atribución visible a OpenFreeMap, OpenMapTiles y OpenStreetMap. Referencias: https://openfreemap.org/quick_start/ y https://openmaptiles.org/docs/schema/.

Si el fondo vectorial no carga, se mantiene el fondo alternativo `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Solo se solicitan teselas de la vista abierta, sin descargas anticipadas ni modo sin conexión. Su política es https://operations.osmfoundation.org/policies/tiles/. `data-tiles` en `#prop-mapa` permite usar únicamente un fondo alternativo; actualizar su atribución en `propiedades-entorno.js` según su licencia.

Los pines provienen de coordenadas sincronizadas, sin geocodificar direcciones ni asignar ubicaciones supuestas. La consulta autenticada comparte filtros y RLS con las tarjetas y devuelve `[id,latitud,longitud,operación,precio,moneda]`, con un límite de 12,000 puntos. Las etiquetas muestran precios abreviados en K y M, conservan la moneda extranjera y muestran Consultar cuando no existe precio. El precio completo aparece al enfocar el pin y en la ficha. Rojo indica venta, naranja renta y un borde de ambos colores indica una oferta conjunta. Al alejarse se agrupan para evitar superposiciones. Cuando se alcanza el límite, la interfaz pide acotar la búsqueda. Las fotos y los detalles se consultan al abrir una ficha. La zona elegida también restringe el listado y se elimina con Quitar zona del mapa o Limpiar filtros.

La pluma permite dibujar a mano alzada con ratón, dedo o lápiz. Mantener pulsado y arrastrar traza el contorno; al soltar se cierra y busca automáticamente. El trazo se simplifica a un máximo de 180 vértices y se rechazan contornos sin superficie o con cruces. Escape, Cancelar o una interrupción del puntero restauran el movimiento y zoom del mapa sin aplicar el dibujo. PostgreSQL valida el contenido y usa su operador nativo punto-en-polígono, además de RLS. No basta con filtrar el rectángulo. Los contornos administrativos proceden de `assets/data/limites-mx`, con sus metadatos, atribución y transformación documentados. No se construyen contornos administrativos a partir de los pines.

Editar campos o quitar etiquetas no consulta propiedades: Aplicar filtros o Enter confirman los cambios. Las acciones explícitas del mapa actualizan la zona sobre los filtros ya aplicados, sin incorporar ediciones pendientes del formulario. La rueda hace zoom dentro del mapa; durante un trazo se bloquean el desplazamiento y el zoom para mantener sus coordenadas.

Al entrar sin una búsqueda explícita, se solicita ubicación al navegador antes de consultar inventario. Se identifica el estado y municipio mediante punto en polígono sobre los archivos locales de INEGI; CDMX incluye todas sus alcaldías. La primera consulta comparte esos filtros entre listado y mapa. Si no se puede identificar una jurisdicción se usa una zona de aproximadamente 30 km alrededor de la ubicación. Si no hay permiso o coordenadas, no se consulta todo México: se permite elegir una ciudad manualmente o usar el GPS. Una respuesta tardía de ubicación no sustituye una búsqueda manual.

Mover o acercar el mapa no consulta inventario. Buscar en esta zona aplica el rectángulo visible al listado y pines, suelta los filtros geográficos anteriores y mantiene precio, operación y características confirmadas. La pluma limita ambos resultados al polígono. Una nueva búsqueda de ubicación suelta la zona dibujada o visible anterior; cambiar solo precio u operación conserva esa zona.

El botón Mi ubicación vuelve a consultar la geolocalización y muestra un punto azul con su círculo de precisión. Si aún no existe un área de búsqueda, carga la ciudad detectada. Una nueva consulta reemplaza el marcador anterior. No guarda la posición en la base de datos ni mantiene seguimiento continuo. Permiso rechazado, GPS no disponible y tiempo agotado muestran mensajes breves con posibilidad de reintento.

Requiere HTTPS y permitir `geolocation=(self)` en la cabecera `Permissions-Policy` de `/propiedades.html`. El Worker `deployment/security-headers-worker.mjs` limita esta autorización a dicha página y mantiene cámara y micrófono bloqueados. Publicar el archivo en GitHub Pages no despliega el Worker de Cloudflare: actualizar también su código en el Worker activo o la regla equivalente que establece esa cabecera. Comprobar la cabecera real del dominio tras el despliegue.

Las pruebas de navegador usan imágenes locales simuladas. La prueba opcional `KW_MAPA_REAL=1` comprueba también el fondo vectorial y lugares reales en escritorio y móvil, solicitando únicamente la vista de Del Valle. Las pruebas de geolocalización usan coordenadas de prueba y permisos del contexto aislado del navegador, nunca la ubicación de la persona que ejecuta las pruebas.
