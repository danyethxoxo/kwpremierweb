# Objetivo: 200 peticiones simultaneas de KWEB

Fecha: 20 de noviembre de 2026. Estado: mejoras de codigo publicadas; capacidad completa de produccion aun no certificada.

## Objetivo verificable

Separar tres escenarios: busquedas de inventario con filtros iguales y diferentes, validacion de sesiones ya iniciadas y acceso nuevo con contrasena. Medir cada escenario con 5, 25, 50, 100 y 200 participantes. No equiparar 200 conexiones de un pool a 200 usuarios ni a 200 consultas por segundo.

Aceptacion propuesta: errores inesperados inferiores al 1 %, p95 inferior a 3 segundos para paginas ya calculadas y validaciones de sesion, p95 inferior a 5 segundos para filtros no calculados. Confirmar tambien resultados, revocacion, MFA y uso de recursos. Cortar la prueba si supera los umbrales; no continuar aumentando carga sobre un sistema degradado.

## Infraestructura actual y propuesta

El propietario confirmo Free. La documentacion oficial describe Nano con CPU compartida y hasta 0.5 GB de memoria. Se observaron max_connections=60 y shared_buffers=224 MiB. Esto no fija por si solo el numero de peticiones HTTP: PostgREST reutiliza conexiones.

Punto de partida recomendado para dimensionar produccion: organizacion Pro y proyecto KWEB con compute Small (2 GB). Estimacion para un unico proyecto activo: USD 25 de plan + aproximadamente USD 15 de compute - USD 10 de credito = aproximadamente USD 30 al mes, antes de impuestos o excedentes. Micro puede costar menos, pero no se ha probado que sea suficiente para la mezcla real solicitada. Small tampoco representa una garantia de 200 peticiones: la prueba determina si basta o si se necesita mas capacidad.

No se cambio el plan, compute ni facturacion. El otro proyecto de la organizacion, ajjitec, se encontro pausado y no se modifico. Confirmar presupuesto total en el panel antes de contratar o reactivar proyectos. Cambiar de Free a Pro no garantiza cambiar automaticamente un Nano existente: seleccionar el compute requerido expresamente y prever la interrupcion anunciada por Supabase.

Fuentes oficiales consultadas:
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/compute-and-disk
- https://supabase.com/docs/guides/auth/rate-limits

## Reduccion de carga publicada

- Se conservan las caches de catalogos y paginas y la agrupacion de limites persistentes.
- data-gateway y mfa-correo validan criptograficamente los tokens mediante getClaims. El proyecto publica una llave ES256. La instancia de cliente se reutiliza para aprovechar la cache JWKS. Los tokens simetricos antiguos conservan la verificacion de respaldo del SDK.
- No se usa una simple decodificacion como prueba de autenticidad. Se comprueban proyecto emisor, rol autenticado e identificadores. Nunca se usan roles de user_metadata para autorizar.
- En cada peticion se comprueba la sesion en auth.sessions y que el usuario no este eliminado o suspendido. Los RPC de identidad son exclusivos de service_role. MFA y permisos siguen comprobados en cada peticion. No se cachean permisos ni identidad.
- Las interrupciones transitorias de Auth se responden como servicio no disponible, no como una contrasena incorrecta.
- mfa-correo admite hasta 1200 peticiones por IP/minuto dentro del limite global, manteniendo 30 por usuario. No cambia los limites nativos de contrasena, recuperacion o envio de codigos de Supabase Auth.

Los limites nativos de Auth por IP importan especialmente si muchas personas comparten una red. Revisar su configuracion real antes de un ensayo masivo de contrasenas. Subir de plan no los elimina. No desactivar protecciones ni enviar correos de prueba a asociados reales.

El correo de verificacion es otra dependencia: el plan actual de Resend no esta confirmado. Si es Free, su cuota oficial es de 100 correos diarios y no permitiria 200 codigos nuevos en un dia, aunque Supabase aumente de capacidad. Resend publica un limite inicial de 10 peticiones por segundo por equipo; los picos de codigos requieren controlar y reintentar envios sin duplicarlos. No se cambiaron cuotas, planes ni la logica de envio de correos en este trabajo. Fuentes: https://resend.com/pricing y https://resend.com/docs/api-reference/rate-limit .

## Pruebas realizadas

1. Deno: 200 consultas y 200 validaciones de sesion concurrentes, con firmas ES256 reales generadas para el fixture y servicios de base de datos simulados. Sin lecturas repetidas de /auth/v1/user. Se rechazan firmas alteradas, emisor distinto, rol incorrecto, sesiones revocadas y falta de MFA. No mide capacidad del servidor real ni compara contrasenas.
2. Produccion: conectividad/CORS, hasta 200 peticiones concurrentes; 760 peticiones totales sin errores. En el escalon 200 se emitieron 400 peticiones, p95 de 539 ms. No ejecuta consultas autenticadas ni inicia sesiones.
3. Base de datos: los RPC reconocen una sesion vigente, no exponen secretos de Auth y no pueden ejecutarse directamente por anon/authenticated.
4. Verificacion de acceso real: cuatro origenes oficiales aceptados, dominio ajeno rechazado, Auth health disponible, portal entregado y JWT alterado rechazado.

Pendiente: ensayo completo de inventario y sesiones autenticadas sobre la infraestructura elegida, con identidades sinteticas y una ventana controlada. No hay un entorno aislado de Supabase disponible en la configuracion actual. No se crearon cuentas de asociados ni se emitieron codigos o correos masivos.

## Herramientas

`node herramientas/verificar-acceso.mjs` ejecuta el chequeo de acceso real sin credenciales privadas. El workflow kweb-acceso lo ejecuta en cambios relevantes y manualmente; no se creo una programacion periodica.

`npm run test:edge` incluye la regresion de 200 solicitudes concurrentes. Los tests y checks Deno resuelven tslib 2.8.1 a la distribucion oficial vendorizada de npm (con licencia adjunta), para no aceptar silenciosamente el cambio de hash del CDN. No se borro ni debilito el lock existente. Este mapa corresponde a la verificacion local/CI, no modifica los imports de los servicios ya publicados.

`node herramientas/probar-concurrencia.mjs` lee una configuracion JSON por stdin, nunca por argumentos del shell. Modos: conectividad, inventario, sesion. El modo sesion renueva metadatos de las sesiones de prueba y requiere aislar notificaciones en staging. Los modos autenticados exigen sesiones de prueba del mismo proyecto y rechazan produccion salvo habilitacion explicita. No imprime tokens, correos ni contrasenas.

Ejemplo sin credenciales, solo conectividad:

```json
{"api":"https://iloetojomzqtadkithtv.supabase.co","modo":"conectividad","niveles":[5,25,50,100,200]}
```

Para el ensayo autenticado se proporcionan `sesiones` con token y dispositivo de cuentas sinteticas, junto con filtros representativos. No pegar esos datos en chats, guardarlos en el repositorio ni usar sesiones de usuarios reales. Las pruebas de contrasena son un escenario adicional: no estan implementadas en este generador de lectura/validacion.
