# Carga y estabilidad de KWEB

Cambios del 20 de noviembre de 2026 ante esperas de mas de un minuto con varios asesores conectados.

## Inventario

- Catalogos compartidos durante dos minutos y paginas de una misma busqueda durante 20 segundos.
- Cada llamada valida identidad y MFA antes de leer la cache. La tabla y los calculos estan en `private`, sin acceso directo de anon ni authenticated.
- La visibilidad compartida corresponde al inventario comun que ya permite la politica de consulta de inventario a usuarios autenticados. No usar esta cache para perfiles, documentos, notificaciones u otros datos por usuario.
- Un bloqueo por clave evita recalcular simultaneamente la misma consulta. Si hay una version anterior y otro proceso ya la esta renovando, se utiliza esa version mientras termina.
- Los contextos de catalogo solo incluyen los parametros que afectan a cada campo. Las escrituras o activaciones pueden tardar hasta la vigencia de la cache en reflejarse; no se cachean cambios de usuario ni permisos.
- Los calculos de texto se omiten cuando no hay conceptos y la normalizacion de negaciones solo se hace si existen negaciones.
- Se conservan filtros, paginacion y orden. El inicio recupera 20 propiedades recientes mediante indice.

## Servicios compartidos

Los controles por IP y por usuario se agrupan en dos llamadas a base de datos en lugar de cuatro. Mantienen los limites originales, el contador persistente y el rechazo por exceso. El RPC de lotes solo es ejecutable por service_role. Publicado en data-gateway y mfa-correo, conservando su configuracion JWT y el resto del codigo desplegado.

Los cuatro dominios oficiales de KWEB y KW Premier forman parte de la lista exacta de origenes aunque la variable historica ALLOWED_ORIGINS solo contenga Premier. Se verificaron las preconsultas reales del navegador en ambos servicios y el rechazo de dominios ajenos. Una configuracion incompatible durante el despliegue produjo rechazos 403 de KWEB y se corrigio en mfa-correo v23 y data-gateway v14.

La guardia de sesion ofrece reintentar despues de 25 segundos sin respuesta. Una respuesta tardia no autoriza el contenido. Volver a la ventana dentro de 15 segundos de una comprobacion correcta no repite la consulta; las APIs mantienen su autorizacion en cada solicitud. Las lecturas compartidas sin un limite propio tienen un corte de 20 segundos. Las notificaciones agrupan eventos cercanos y no vuelven a cargar su historial por cambios de ventana dentro de 30 segundos.

## Verificacion

- En la base de datos: 30 lecturas consecutivas de la misma pagina con cache en 621 ms en total. No equivale a una prueba de 30 navegadores concurrentes ni incluye red o renderizado.
- Catalogo de estados con cache: 12 ms en una comprobacion interna.
- Pagina inicial: 20 resultados; filtro de CDMX cotejado con la tabla de origen.
- Permisos: anon no ejecuta los RPC de inventario; authenticated no lee la cache ni ejecuta calculos privados directamente.
- Pruebas de servidor: autenticacion, MFA, limites, CORS, formularios y errores seguros. Pruebas de navegador: sesion detenida, reintento, respuestas tardias, notificaciones y errores parciales del inicio.
- Dos comprobaciones historicas de versiones fijas de scripts y una expectativa visual antigua de espacio entre widgets no forman parte de la validacion funcional de este cambio.

El CDN de tslib 2.8.1 no coincide con el hash del lock Deno existente. Los tests y checks usan ahora la distribucion oficial de npm de la misma version en tests/vendor, con licencia e import map versionados. No se borro el lock ni se modificaron las dependencias de los servicios publicados.

Estos cambios reducen carga y permiten recuperarse de errores; no garantizan disponibilidad absoluta. Revisar registros y capacidad de infraestructura si persisten esperas con la concurrencia real.

La ampliacion para el objetivo de 200 peticiones se documenta en `capacidad-200.md`. Incluye validacion criptografica con comprobacion de sesion vigente, pruebas concurrentes con servicios simulados y prueba real de conectividad. No se ha certificado todavia la capacidad completa con 200 accesos y consultas autenticadas sobre Free.
