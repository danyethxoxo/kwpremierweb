# Auditoría de estabilidad de KWEB — 20 de noviembre de 2026

Se revisaron la carga inicial, las consultas de propiedades y mapa, la autorización de sesión, las listas de dictámenes, firmas, perfiles compradores, notificaciones y las páginas del portal. Las mejoras no requieren contratar más cómputo. No se modificaron planes, facturación ni cuotas de correo.

## Correcciones implementadas

| Área | Problema | Cambio |
| --- | --- | --- |
| Consultas generales | Ejecución lejos de la base y latencia acumulada | El navegador solicita la región de la base para todas las consultas del gateway. Las lecturas pueden intentar una vez la ruta automática ante un error transitorio. Las escrituras no se repiten automáticamente. |
| Redes de oficina | Los límites por IP sumaban a todos los usuarios | Presupuestos de red separados para usuarios cuya firma, sesión vigente y MFA ya se validaron. Se conservan los límites individuales, la revocación y los límites bajos para peticiones no autorizadas. |
| Mapa | Repetición del cálculo de los mismos filtros | Caché compartida de veinte segundos con coordinación entre consultas simultáneas; conserva autorización por petición, filtros y resultado. |
| Dictámenes | La entrada descargaba puntos, clientes, historial y contratos de todos los expedientes | Una consulta inicial de la lista; detalle por expediente al abrirlo, editarlo o generar su PDF. Se conservan todas las páginas del historial. Solicitudes simultáneas del mismo detalle comparten la descarga. |
| Dictámenes | Cada entrada de liderazgo podía iniciar conciliación de asesores | Se utiliza el catálogo mantenido por el trigger de la base; la sincronización explícita continúa disponible. |
| Notificaciones | Descarga de todo el historial al abrir cualquier página | Primera consulta de recientes sin leer. El historial completo, paginado, se obtiene al elegir Todas. |
| Sesión | Un fallo transitorio durante una revalidación ocultaba una página ya abierta | La página previamente autorizada permanece visible y ofrece Reintentar. La primera entrada continúa bloqueada hasta verificar la sesión; sesiones revocadas o vencidas siguen rechazadas. El servidor comprueba cada operación. |
| Móvil | Dos módulos competían por colocar la campana del inicio | La campana permanece en el encabezado móvil; en escritorio conserva su ubicación del dashboard. |
| Detección | La comprobación de acceso solo se ejecutaba manualmente o con cambios | Workflow de acceso programado cada quince minutos, sin credenciales privadas ni creación de cuentas. GitHub puede retrasar tareas programadas; no es un servicio de disponibilidad con SLA. |

## Evidencia de carga real

Archivo reproducible: [carga-mixta-plataforma-20261120.json](pruebas/carga-mixta-plataforma-20261120.json).

- 2,075 solicitudes autenticadas, cero errores: escalones de 25 y 50, después diez rondas de 200 simultáneas.
- Ocho rutas: propiedades recientes, propiedades filtradas, catálogo, mapa, notificaciones, perfiles compradores, firmas y dictámenes.
- Peor p95 de las rondas de 200: **4,347 ms**. Máximo del cliente: **4,516 ms**.
- Registros de Supabase: **2,075 respuestas HTTP 200 en us-west-2**, máximo de ejecución registrado de 4,064 ms.
- Ocho identidades sintéticas, desde una sola red. Sesiones cerradas y cuentas eliminadas al finalizar; verificación posterior: cero cuentas de prueba. El servicio temporal quedó sustituido por una respuesta 410 y exige JWT.

El primer intento tuvo seis rondas de 200 correctas y un corte de transporte completo en la siguiente. No se declaró aprobado y se conserva en [el primer informe](pruebas/carga-mixta-primer-intento-20261120.json). No aparecieron esas solicitudes fallidas en los registros de la función. La repetición sin terminal interactiva, con marcas de tiempo y clasificación de errores de transporte, completó las diez rondas. La evidencia no permite atribuir definitivamente el primer corte al proveedor ni al cliente.

Esta prueba mide consultas simultáneas, no doscientas personas completas. Las listas privadas de las identidades sintéticas estaban vacías. No certifica doscientos inicios por contraseña, envíos de códigos, escrituras, archivos o generación simultánea de PDF. Tampoco garantiza ausencia de fallas de Internet o de proveedores.

## Verificación de aplicación

- Auditoría aislada de 61 páginas en 1440, 768 y 320 píxeles, incluidas variantes de formularios nuevos: 219 capturas. Sin páginas ocultas ni desbordamiento horizontal. La incidencia de sintaxis encontrada en una variante móvil de Operatividad durante el ajuste de versiones se corrigió y se volvió a verificar.
- Regresiones de guardado y recuperación de borradores, detalle y PDF de dictámenes, notificaciones en escritorio/móvil, rutas de acceso, renovación de sesión, cancelación y reintento de consultas.
- Pruebas de seguridad de Edge: doce aprobadas, incluidas doscientas verificaciones concurrentes con servicios simulados. Se rechazan firmas alteradas, sesiones revocadas y falta de MFA.
- SQL de comprobación: límites de red, rechazo de RPC internos para anon/authenticated y equivalencia del mapa antes/después de la caché, incluso filtros nulos.
- Comprobación real de acceso: trece verificaciones correctas de CORS, Auth, portal y rechazo de JWT manipulado.
- Dependencia de desarrollo fast-xml-parser alineada con el lock existente. Auditoría npm: cero vulnerabilidades.

Las capturas y simulaciones son una revisión de interfaz, no una prueba de capacidad real ni de todas las combinaciones de permisos y datos existentes.

## Avisos y límites que siguen requiriendo seguimiento

Supabase no reportó avisos de salud en la revisión. Sus asesores sí mantienen recomendaciones preexistentes: 48 evaluaciones de funciones de autenticación por fila en políticas, ocho claves foráneas sin índice, 23 casos de políticas permisivas múltiples y un índice duplicado. No se eliminaron índices ni se reescribieron permisos masivamente durante esta intervención.

La vista dictamenes_con_asesor aparece como SECURITY DEFINER y contiene un filtro explícito de liderazgo. Debe revisarse por separado con datos y roles representativos antes de convertirla a SECURITY INVOKER, para conservar los nombres y permisos de las uniones. También permanecen avisos sobre funciones privilegiadas accesibles por RPC y protección de contraseñas filtradas desactivada. Un aviso de función privilegiada no demuestra por sí solo acceso indebido: requiere comprobar sus controles internos. [Referencia de Supabase sobre vistas](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view) y [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

El tamaño real de cómputo y Spend Cap quedaron sin verificar: el control del navegador se detuvo al no poder confirmar la URL de Chrome. No se cambió ninguna configuración financiera. No se afirma que el límite de gasto ya esté activo ni que Pro sea un límite absoluto de US$25.

Antes de una presentación: comprobar el resultado del workflow de acceso, ensayar con los filtros reales y mantener una sesión validada. Para certificar doscientos usuarios completos falta un entorno de ensayo con datos privados representativos y prueba de contraseñas/códigos según las cuotas reales del proveedor. No se enviaron correos a asociados durante esta auditoría.
