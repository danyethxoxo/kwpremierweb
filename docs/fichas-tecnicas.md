# Fichas técnicas de propiedades

La implementación compartida está en `assets/js/kw-ficha-propiedad.js`. Propiedades, Perfil comprador e Inicio cargan la misma versión.

- Redes: título por tipo y operación; colonia en una línea; municipio y estado en otra. Ciudad de México se presenta como CDMX. No sustituir una colonia ausente por la calle.
- Detalle: PDF de dos páginas. La primera incluye el título original completo, dirección, precio y divisa, dos fotos, superficies, características, descripción completa y contacto opcional del asesor. La segunda incluye el resto de las fotos seleccionadas y la ubicación si existen coordenadas válidas.
- Las fotos de Detalle se seleccionan todas inicialmente. Clásica y Mosaico conservan el límite de cuatro, y Redes el de una. El orden elegido determina las primeras dos fotos.
- `fotos-propiedad` devuelve todas las imágenes disponibles de KW México, sin el antiguo límite de doce. Los consumidores consultan esta galería al abrir la ficha, sin ampliar las consultas iniciales de los listados.
- El mapa se carga al elegir Detalle y conserva la atribución de OpenStreetMap. Si no se puede cargar, el PDF ofrece la ubicación mediante un enlace; no se inventan coordenadas. El pie permite abrir la propiedad en KW.
- La vista previa presenta ambas páginas. El PNG de Detalle contiene las dos páginas una debajo de la otra; el PDF tiene dos páginas independientes.
- El texto se ajusta al espacio disponible. Si una descripción excepcionalmente extensa no cabe íntegra, se impide la descarga y se informa del problema, evitando recortes silenciosos.

Verificación: `node --test tests/ficha-datos.test.mjs tests/ficha-titulo.test.mjs tests/ficha-fotos-browser.test.mjs tests/ficha-plantillas-browser.test.mjs tests/ficha-detalle-browser.test.mjs`.

Las pruebas de Detalle exportan el PDF y renderizan sus dos páginas con PDF.js para revisión visual. Incluyen escritorio, móvil, descripciones de más de mil caracteres, catorce fotos y coordenadas. Los artefactos de revisión se guardan en `outputs/fichas-tecnicas`.
