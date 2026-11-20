# Búsquedas junto a la base de datos

20 de noviembre de 2026. Organización Pro confirmada. No se modificaron Compute,
facturación, cuotas ni datos de propiedades. El tamaño de Compute no fue confirmado.

## Resultado real

Después de agrupar la autorización y ejecutar el gateway en us-west-2:

| Concurrencia | Respuestas válidas | Errores | p95 | Máximo |
| --- | ---: | ---: | ---: | ---: |
| 5 | 5 | 0 | 1,821 ms | 1,821 ms |
| 25 | 25 | 0 | 1,707 ms | 1,823 ms |
| 50 | 50 | 0 | 966 ms | 1,085 ms |
| 200 | 200 | 0 | 2,535 ms | 2,604 ms |

Los registros de Supabase confirman 280 respuestas HTTP 200 de esa identidad y
ejecución en us-west-2. El máximo de ejecución de la función fue 2,175 ms; los
tiempos de la tabla incluyen la red del cliente externo.

Se usaron los mismos ocho filtros del ensayo anterior, con caché de producción
activa y límite de espera de 12 segundos. Una cuenta sintética y una oleada por
escalón; no representa 200 usuarios distintos, nuevas contraseñas ni carga sostenida.

El ensayo Pro previo con selección automática de región respondió 180 de 200 en
el escalón 200. La primera prueba de autorización agrupada con región automática
se detuvo en 25 solicitudes: 22 respuestas y 3 esperas agotadas. Agrupar llamadas
por sí solo no resolvió el problema. Los registros mostraron ejecución en Ohio
mientras la base se encuentra en Oregon. El ensayo regional fue satisfactorio;
no demuestra que no puedan ocurrir otras interrupciones.

## Cambio publicado

- Gateway: una llamada agrupa sesión vigente, límites por usuario y MFA. Se
  mantienen las comprobaciones en cada solicitud, los límites y las políticas RLS.
- La lectura del inventario usa x-region: us-west-2 desde kwSecureFetch.
- CORS admite ese encabezado. No se envía la región a servicios ajenos.
- Solo las lecturas tienen un intento alternativo sin región fija ante 502/503/504
  o fallo de transporte. No se reintentan escrituras, rechazos 401/403/429 ni cancelaciones.
- Las respuestas siguen sin cachearse en el navegador. No se cachean permisos.

Verificación: 12 pruebas Deno, prueba SQL transaccional de autorización y privilegios,
6 pruebas del cliente de seguridad, 3 del conductor, 4 pruebas de navegador de mapa
y 13 controles de acceso real. Las cuentas temporales fueron eliminadas y el
servicio de preparación volvió a respuesta 410 con verificación JWT.

Pendiente para certificar toda la plataforma: carga sostenida, combinaciones no
calculadas y acceso de 200 identidades. Mantener Spend Cap y verificar Micro en el
panel antes de cualquier cambio de capacidad; no se contrataron complementos.

Referencia: https://supabase.com/docs/guides/functions/regional-invocation
