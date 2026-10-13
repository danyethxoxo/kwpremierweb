# Mapa de Propiedades

Dependencias locales, descargadas solo al abrir la vista Mapa:

- Leaflet 1.9.4: https://github.com/Leaflet/Leaflet/tree/v1.9.4 (BSD-2-Clause, `leaflet-LICENSE`).
- Leaflet.markercluster 1.5.3: https://github.com/Leaflet/Leaflet.markercluster/tree/v1.5.3 (MIT, `markercluster-LICENSE`).

Archivos de distribución obtenidos de jsDelivr con versiones fijas. No incluyen claves ni telemetría propia.

El fondo usa `https://tile.openstreetmap.org/{z}/{x}/{y}.png` con atribución visible, Referer y caché del navegador. Solo solicita las imágenes de la vista abierta, sin descargas anticipadas ni modo sin conexión. Su política es https://operations.osmfoundation.org/policies/tiles/. Para cambiar de proveedor, configurar `data-tiles` en `#prop-mapa` y actualizar la atribución en `propiedades-mapa.js` según su licencia.

Los pines provienen de coordenadas sincronizadas, sin geocodificar direcciones ni asignar ubicaciones supuestas. La consulta autenticada comparte filtros y RLS con las tarjetas, devuelve solo ID/latitud/longitud y limita la respuesta a 12,000 puntos. Cuando se alcanza el límite, la interfaz pide acotar la búsqueda. Las fotos y los detalles se consultan al abrir una ficha. La zona elegida también restringe la Lista y se elimina con Quitar zona del mapa o Limpiar filtros.

Las pruebas de navegador usan imágenes locales simuladas y no hacen solicitudes automatizadas al servidor de mapas.
