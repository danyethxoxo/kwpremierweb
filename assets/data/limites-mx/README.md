# Contornos cartográficos de México

Fuente: INEGI, Marco Geoestadístico, diciembre de 2025. Descarga del 13 de octubre de 2026 mediante el [Servicio Web del Catálogo Único de Claves Geoestadísticas](https://www.inegi.org.mx/servicios/catalogounico.html).

Información de libre uso según los [términos del INEGI](https://www.inegi.org.mx/inegi/terminos.html). Se conservan los metadatos de las colecciones y propiedades de las entidades. Los archivos contienen una transformación de KW Premier, no realizada ni avalada por INEGI: simplificación Douglas-Peucker (estados 0.001 grados, municipios 0.0003 grados) y redondeo a cinco decimales para visualización. No sustituyen información para deslindes.

`indice.json` permite resolver nombres sin descargar todas las geometrías. Los estados están en `estados.geojson`; cada archivo de dos dígitos contiene los municipios de ese estado y solo se carga cuando se utiliza. Los nombres municipales repetidos requieren contexto de estado; no se elige una coincidencia arbitraria.

Para actualizar: `node herramientas/actualizar-limites-mapa.mjs`. El script reutiliza archivos municipales ya descargados; moverlos fuera de esta carpeta si se desea renovar la fuente completa. Las teselas del fondo no forman parte de esta descarga.
