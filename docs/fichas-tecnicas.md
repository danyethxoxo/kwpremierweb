# Fichas técnicas de propiedades

La implementación compartida está en `assets/js/kw-ficha-propiedad.js`. Propiedades, Perfil comprador e Inicio cargan la misma versión.

- Redes: título por tipo y operación; colonia en una línea, o calle y número si falta la colonia; municipio y estado en otra. Ciudad de México se presenta como CDMX.
- Detalle: PDF de dos páginas. La primera incluye el título original completo, dirección, precio y divisa, dos fotos, superficies, características, descripción completa y contacto opcional del asesor. La segunda incluye el resto de las fotos seleccionadas y la ubicación si existen coordenadas válidas.
- Detalle permite seleccionar hasta catorce fotos: dos en la primera página y un máximo de doce en la segunda. Las primeras catorce se seleccionan inicialmente; es posible sustituirlas por otras de la galería. Clásica y Mosaico conservan el límite de cuatro, y Redes el de una.
- `fotos-propiedad` devuelve todas las imágenes disponibles de KW México, sin el antiguo límite de doce. Los consumidores consultan esta galería al abrir la ficha, sin ampliar las consultas iniciales de los listados.
- El mapa se carga al elegir Detalle a partir de teselas vectoriales de OpenFreeMap/OpenMapTiles con datos de OpenStreetMap. Calles, edificios, áreas verdes, lugares y etiquetas se dibujan directamente en la vista y en el PDF, con marcador pequeño y atribución visible. Si no se puede cargar, el PDF ofrece la ubicación mediante un enlace; no se inventan coordenadas.
- El contacto se presenta en una barra compacta de dos columnas: nombre completo y Asesor Inmobiliario a la izquierda; teléfono, correo y sitio web con sus iconos a la derecha. La opción Mostrar datos del asesor permite ocultarlo. No muestra el Market Center. El encabezado no añade tipo de ficha y el pie no lleva enlaces ni numeración.
- La vista previa presenta ambas páginas. El PNG de Detalle contiene las dos páginas una debajo de la otra; el PDF tiene dos páginas independientes.
- El texto se ajusta al espacio disponible. Si una descripción excepcionalmente extensa no cabe íntegra, se impide la descarga y se informa del problema, evitando recortes silenciosos.
- Los cuatro diseños exportan texto seleccionable y formas vectoriales. Detalle, Redes y Mosaico comparten el dibujo del canvas y PDF mediante el contexto vectorial de jsPDF; Clásica conserva su exportación vectorial previa. Las únicas imágenes incrustadas son fotografías. Las fuentes Poppins se incluyen en los PDF de los tres diseños que las utilizan.
- El logo usa contornos vectoriales derivados del arte existente, también disponibles en `assets/img/logo-kw-premier-vector.svg`. La variante blanca de Mosaico utiliza los mismos contornos.

Verificación: `node --test tests/ficha-datos.test.mjs tests/ficha-titulo.test.mjs tests/ficha-fotos-browser.test.mjs tests/ficha-plantillas-browser.test.mjs tests/ficha-detalle-browser.test.mjs`.

Las pruebas de Detalle exportan el PDF y renderizan sus dos páginas con PDF.js para revisión visual. Incluyen escritorio, móvil, descripciones de más de mil caracteres, catorce fotos y coordenadas. Los artefactos de revisión se guardan en `outputs/fichas-tecnicas`.

Las comprobaciones inspeccionan el texto y los operadores del PDF: Detalle contiene dos fotos en la primera página y doce en la segunda, Redes una, Mosaico cuatro y Clásica las fotografías seleccionadas. No se permiten imágenes adicionales para logo, mapa o páginas completas.

Para reconstruir el módulo vectorial: `npm ci --prefix herramientas/fichas --ignore-scripts` y `node herramientas/fichas/build.mjs`, desde la raíz. Las dependencias están fijadas en el archivo de bloqueo de ese directorio. `node herramientas/fichas/trazar-logo.cjs` actualiza los contornos si cambia el arte original. El módulo distribuido es `assets/vendor/fichas/vector.js`; conservar las licencias adjuntas.
