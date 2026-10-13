# Mapa de Propiedades

Dependencias locales, descargadas después de mostrar las primeras tarjetas:

- Leaflet 1.9.4: https://github.com/Leaflet/Leaflet/tree/v1.9.4 (BSD-2-Clause, `leaflet-LICENSE`).
- Leaflet.markercluster 1.5.3: https://github.com/Leaflet/Leaflet.markercluster/tree/v1.5.3 (MIT, `markercluster-LICENSE`).

Archivos de distribución obtenidos de jsDelivr con versiones fijas. No incluyen claves ni telemetría propia.

El fondo usa `https://tile.openstreetmap.org/{z}/{x}/{y}.png` con atribución visible, Referer y caché del navegador. Solo solicita las imágenes de la vista abierta, sin descargas anticipadas ni modo sin conexión. Su política es https://operations.osmfoundation.org/policies/tiles/. Para cambiar de proveedor, configurar `data-tiles` en `#prop-mapa` y actualizar la atribución en `propiedades-mapa.js` según su licencia.

Los pines provienen de coordenadas sincronizadas, sin geocodificar direcciones ni asignar ubicaciones supuestas. La consulta autenticada comparte filtros y RLS con las tarjetas, devuelve solo ID/latitud/longitud y limita la respuesta a 12,000 puntos. Cuando se alcanza el límite, la interfaz pide acotar la búsqueda. Las fotos y los detalles se consultan al abrir una ficha. La zona elegida también restringe el listado y se elimina con Quitar zona del mapa o Limpiar filtros.

La pluma genera polígonos de 3 a 200 vértices, sin cruces; Buscar dentro envía el polígono y su rectángulo de cobertura. PostgreSQL valida el contenido y usa su operador nativo punto-en-polígono, además de RLS. No basta con filtrar el rectángulo. Los contornos administrativos proceden de `assets/data/limites-mx`, con sus metadatos, atribución y transformación documentados. No se construyen contornos administrativos a partir de los pines. El buscador espera 450 ms después de la última edición para actualizar ambos resultados y descarta respuestas anteriores.

Las pruebas de navegador usan imágenes locales simuladas y no hacen solicitudes automatizadas al servidor de mapas.
