# Buscador integrado de propiedades

El campo existente `f-buscar` interpreta la frase al pulsar Enter o Aplicar filtros. No hay un segundo formulario. El ejemplo «depa cerca de hospital» se resuelve sin gastar cuota de IA. Otras frases usan la función autenticada `interpretar-busqueda` y Gemini; una falla conserva la búsqueda textual y muestra ese estado.

Los criterios interpretados se intersectan con los filtros manuales; los límites de precio más restrictivos se conservan. Las descripciones completas, dirección, asesor e identificador forman parte del índice de texto. Los conceptos admiten expresiones equivalentes, con límites de tamaño y consultas parametrizadas. Los resultados, el mapa y la paginación usan la misma función de filtrado. La autorización y el segundo factor existentes se conservan.

## Hospitales

Por defecto, «cerca» admite un hospital a hasta 1,500 metros en línea recta según coordenadas, o una cercanía declarada explícitamente en la descripción. Las tarjetas distinguen esas evidencias; no se calcula tiempo de traslado. Un hospital mencionado sin cercanía no basta. Los hospitales específicos requieren aclarar la ubicación.

`datos/busqueda/hospitales-zmvm.json` contiene 787 puntos de referencia de hospitalización en operación según el conjunto [Hospitales públicos y privados en operación de la ZMVM](https://www.datos.cdmx.gob.mx/dataset/hospitales-publicos-y-privados-en-operacion-de-la-zmvm), Gobierno de la Ciudad de México, licencia CC-BY-4.0-ESP. Se descargó el 10 de noviembre de 2026; el conjunto corresponde a 2020. Se conservan nombre, CLUES y coordenadas, sin teléfonos ni datos de titulares. El catálogo es una referencia histórica, no una certificación de operación actual, y no cubre todos los hospitales del país. Fuera de su cobertura las coincidencias dependen de la descripción.

Los puntos se importaron en `propiedades_puntos_interes` mediante JSON de cliente y `INSERT ... ON CONFLICT`; solo el servicio administra el catálogo. Los usuarios autenticados tienen lectura. Los anuncios nuevos consultan el mismo catálogo automáticamente; el catálogo de hospitales requiere una nueva importación cuando haya una fuente actualizada.

Validación: pruebas de consultas con Postgres local, límites y recuperación de cuota, interpretación del ejemplo, conservación de filtros, búsqueda real con usuario autorizado y pruebas de navegador en 1366 y 390 píxeles. El componente del perfil comprador conserva su flujo independiente de completar campos.


## Tolerancia de escritura y asesores

El mismo campo admite dedazos frecuentes, plurales y nombres de asesores. Las consultas sencillas como «cass», «casas de Rodrigo», «todas las propiedades de Adriana» y «todas las propiedades de Adriana García» se resuelven localmente sin consumir IA. Las frases con presupuestos y condiciones adicionales conservan la interpretación estructurada.

Los asesores se comprueban contra el catálogo real del inventario. Un nombre solo incluye todas las coincidencias de esa palabra; cada apellido adicional exige también esa palabra en el mismo asesor. Se ignoran acentos y mayúsculas. Los nombres resueltos se pasan al filtro de asesor existente, por lo que la lista, la paginación y el mapa conservan los mismos resultados y permisos.

La corrección usa distancia de edición con transposiciones, limitada a uno o dos cambios según la longitud. Prioriza coincidencias exactas y no elige al azar entre correcciones empatadas. No se garantiza corregir cualquier error: si el nombre es ambiguo o no existe, se pide precisar y no se amplía a todas las propiedades. Se protegen las cifras, identificadores alfanuméricos, negaciones y palabras válidas cercanas a nombres de tipos.

Los catálogos de asesores y lugares se reutilizan durante cinco minutos. Las cargas globales de los filtros normales precargan este mismo caché; las cargas acotadas por estado, municipio o Market Center no lo sobrescriben. No se cambia el texto escrito ni se agregan resúmenes visibles.
