# Visor y unión de documentos

Copias locales de las mismas versiones que Firmas ya usaba desde jsDelivr, para evitar que el selector y el visor dependan de otra conexión en móvil.

- pdfjs-dist 3.11.174: `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/`, licencia Apache 2.0 en `pdfjs-LICENSE`.
- pdf-lib 1.17.1: `https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js`, licencia MIT en `pdf-lib-LICENSE.md`.

pdf-lib se carga solo al unir más de un archivo. pdf.js y su worker comparten origen. `kw-firmas-archivos.js` prepara las dimensiones de las hojas y dibuja las visibles en móvil; el archivo original y las coordenadas de firma no se alteran.
