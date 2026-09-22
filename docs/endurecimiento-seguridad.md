# Endurecimiento de seguridad, 22 septiembre 2026

Estado: implementado y probado en el repositorio local. No desplegado ni
ejecutado contra la base de produccion. Se requiere un despliegue coordinado;
subir solamente los HTML dejaria al sitio buscando una funcion inexistente.

## Hallazgos y cambios

| Area | Resultado en el codigo | Activacion pendiente |
| --- | --- | --- |
| Limites por usuario/IP | Contadores atomicos persistentes en Postgres, compartidos por todos los procesos Edge, respuesta 429 con Retry-After, cierre ante fallos del limitador | SQL 088 y despliegue de todas las funciones |
| Acceso directo a datos | Gateway que reenvia el JWT del usuario; conserva RLS, comprueba MFA y no acepta una URL de destino arbitraria | Frontend y SQL 089, en ese orden |
| CORS | Lista exacta de dominios por ALLOWED_ORIGINS, rechazo de origen ajeno y Vary: Origin | Desplegar funciones |
| Credenciales | Retirado secreto de webhook de 038; triggers leen Vault, funciones leen entorno; .env ignorado y escaner en CI | Rotar secretos y ejecutar 091 |
| Inyeccion SQL | Consultas parametrizadas Supabase/PostgREST; sin concatenar entradas en SQL; limites de cuerpo/estructura y permisos de RPC | Desplegar funciones y SQL 090 |
| XSS | Escape de comillas en helpers de HTML; enlaces seguros en notificaciones, accesos y calendario; retiro de renderizador HTML inseguro sin uso | Publicar frontend |
| Inputs | Correos, UUID, contrasenas, tamano de textos/JSON, URLs de imagen HTTPS; validaciones en Edge y triggers DB | SQL 090 y funciones |
| Contrasenas | Hash administrado por Supabase Auth; nueva politica minima de 12 caracteres y maximo 72 bytes en formularios/administracion | Replicar requisitos en Auth hospedado |
| MFA | Comprobacion antes de operaciones Edge privilegiadas y acceso a Storage; cambio de hash de contrasena revoca dispositivos, sesiones MFA y codigos desde DB | SQL 089/090 y funciones |
| Archivos sensibles | Firmas e incidencias privados; enlaces temporales de 5 minutos; compatibilidad con rutas antiguas de incidencias | Frontend y SQL 089 |
| Calendario | La lectura interna exige usuario autenticado y MFA aplicable | Frontend y funcion calendar-events |
| HTTPS/encabezados | HTTPS requerido en funciones; redirect del sitio; proxy opcional con HSTS, nosniff, politica de referentes, permisos y CSP parcial | Configurar proxy del dominio |
| Respaldos | pg_dump por TLS verificado, compresion y cifrado age sin archivo intermedio en texto plano | Instalar age, configurar destinatario y CA, probar restauracion |
| Dependencias | Supabase 2.117.0 fijado, integridad SRI del CDN, XML parser actualizado, locks y pruebas CI | Publicar cambios |

## Limites iniciales

Ventanas de 60 segundos. Los limites globales se comparten entre funciones.

- IP global: 1200; por funcion: 180, excepto los valores de cada endpoint.
- Usuario global: 600; por funcion: 60.
- Gateway: 300 por usuario y 600 por IP.
- Administracion de usuarios: 20 por usuario; invitaciones y correos: 10.
- MFA: 30 peticiones por usuario, ademas de sus limites de codigo/envio previos.
- Integracion de propiedades: 120 por llave de API verificada.
- Formularios publicos: 10 envios por IP y, si hay sesion, tambien por usuario.
  Se acepta un formulario por solicitud; los lotes no pueden evadir ese cupo.

Las IP se guardan como HMAC, no como direcciones en texto plano. La tabla es
privada y los clientes no pueden elegir ni reiniciar sus contadores. Si esta
habilitado pg_cron, 088 instala limpieza horaria. En otro caso hay que programar
`select public.security_prune_rates()` cada hora desde un servicio autorizado.

`TRUSTED_IP_HEADER` usa `x-forwarded-for` y toma el ultimo salto, no un prefijo
arbitrario que un cliente pueda anteponer. El ingress de produccion debe
sobrescribir ese encabezado o agregar la IP real del cliente. Antes de activar,
verificar con dos conexiones controladas que representan clientes distintos y
con un encabezado falso que no se puede reiniciar el cupo. Si el ultimo salto
identifica un proxy comun, configurar un encabezado de cliente que ese ingress
garantice sobrescribir. No confiar ciegamente en `cf-connecting-ip` recibido
directamente del cliente. IP ausente/invalida usa un cupo comun restrictivo.

Estos limites cubren Edge Functions y Data API a traves del gateway. Auth,
Storage, URLs ya firmadas y Realtime tienen rutas separadas: aplicar tambien
limites del proveedor/WAF. No se presenta este cambio como proteccion DDoS total.

## Secretos encontrados

1. `supabase/sql/038_notificar_email_jwt.sql` contenia un secreto de webhook
   privado. Se retiro del archivo, pero persiste en el historial. ROTAR
   `WEBHOOK_SECRET` tanto en Edge Secrets como en Vault. No reutilizarlo.
2. Dos versiones historicas de `herramientas/prueba-carga-mixta.mjs` contenian
   cuatro credenciales de prueba. Rotar/eliminar esas cuentas, revocar sesiones
   y comprobar si alguna contrasena fue reutilizada.
3. El escaneo completo de 5097 blobs de codigo propio encontro diez ubicaciones
   historicas: ocho de las credenciales de prueba y dos del secreto de webhook.
   No se reproducen valores en este informe. El escaneo actual queda sin hallazgos.

La clave `sb_publishable_...` del navegador es publica por diseno. Moverla a un
`.env` de compilacion no la vuelve secreta: el usuario seguira recibiendola.
Las claves privadas de servicio, Google, Resend y weetrust permanecen en el
entorno del servidor. Los triggers SQL usan Supabase Vault porque Postgres no
lee las variables del entorno de las Edge Functions. Nunca publicar .env,
exportaciones, llaves age privadas o secretos como archivos de GitHub Pages.

El escaner es una defensa por patrones conocidos, no una certificacion de que
no pueda existir ningun secreto. Activar tambien secret scanning/push protection
en GitHub y revisar alertas. Reescribir historia es una operacion separada: no
sustituye la rotacion y requiere coordinar todos los clones.

## Orden de despliegue

Probar primero en un proyecto de ensayo con las migraciones anteriores hasta
087 y con las funciones reales. Los tests locales usan Postgres embebido y
simulan servicios externos; no certifican el estado de la base hospedada.

1. Respaldar DB y archivos y probar recuperacion. Inventariar politicas/vistas
   adicionales creadas fuera del repositorio, pues 089 habilita RLS en todas
   las tablas public y 090 revoca acceso anonimo a vistas internas.
2. Rotar las credenciales expuestas. Crear en Vault `kw_webhook_secret` y
   `kw_sync_secret`, cada uno con al menos 32 caracteres aleatorios; reflejar
   esos valores en `WEBHOOK_SECRET` y `SYNC_SECRET` de Edge Secrets. Actualizar
   cualquier cron/integracion que use SYNC_SECRET. No pegar valores en Git.
3. Ejecutar `088_security_gateway.sql`. Desde el SQL Editor privado, consultar
   `select gateway_secret from private.security_config where id;` y guardar
   ese valor solamente como Edge Secret `DATA_GATEWAY_SECRET`. No copiarlo a
   tickets, logs, capturas o al frontend. Configurar ALLOWED_ORIGINS con los
   dominios propios exactos; localhost solo en proyectos de desarrollo.
4. Desplegar TODAS las funciones incluyendo `data-gateway` y `_shared/` mediante
   CLI (`supabase functions deploy --project-ref <proyecto>`). No basta pegar
   cada index.ts en el Dashboard: ahora importa modulos compartidos. Respetar
   verify_jwt de config.toml: los webhooks y el gateway tienen autenticacion
   propia; las funciones de usuario conservan verificacion JWT.
5. Publicar el frontend completo, incluidos los assets con version 20260922.
   Confirmar las consultas del navegador a `/functions/v1/data-gateway/...`.
   No activar todavia 089 si el frontend servido sigue usando REST directo.
6. Ejecutar `089_security_enforcement.sql`, `090_security_validation.sql` y
   `091_webhook_secrets_vault.sql`, en ese orden. Cada archivo es transaccional
   e idempotente; no reescribe contratos ni elimina registros de negocio.
7. Replicar las opciones de `supabase/config.toml` en Auth hospedado. El archivo
   por si solo no actualiza produccion: minimo 12 caracteres, registro publico
   deshabilitado, confirmacion de correo/cambio, reautenticacion para cambio de
   contrasena, limites de login/recuperacion y proteccion de claves filtradas
   cuando este disponible. Mantener invitaciones administrativas funcionando.
8. Inscribir a todas las cuentas privilegiadas en MFA. Las cuentas antiguas
   sin fila en mfa_metodos conservan el periodo de adopcion de 086; este cambio
   no las declara inscritas ni sustituye ese alta. Para cerrar ese periodo hay
   que coordinar la inscripcion/recuperacion y comprobar que nadie quede fuera.
9. Verificar IP confiable, SMTP, Google, weetrust, lecturas publicas, roles,
   recuperacion de cuenta y eventos de firma. Confirmar que consultas directas
   REST con clave publica/JWT y sin secreto del gateway devuelven 403.

Las consultas anonimas a las vistas publicas siguen funcionando por el gateway.
La clave de servicio se usa para verificar identidad y contadores; las consultas
de negocio del gateway usan la clave anon + JWT del usuario, nunca service_role.
No desactivar RLS para solucionar problemas de despliegue.

## HTTPS y dominio

Verificado el 22/09/2026: GitHub Pages reporta `https_enforced: true`, HTTP
redirige 301 a HTTPS y la pagina HTTPS responde 200 con certificado aceptado.
No se observaron HSTS, CSP, nosniff ni Permissions-Policy en la respuesta real.

GitHub Pages no aplica archivos `_headers`. Se incluye
`deployment/security-headers-worker.mjs` para una ruta Worker de Cloudflare
sobre el dominio existente. Requiere dominio conectado, TLS Full (strict) y
despliegue/configuracion del proxy. No se cambio DNS ni se desplego ese Worker.
No activar includeSubDomains/preload sin inventariar los subdominios.

La CSP actual limita objetos, base, formularios y contenido HTTP; el proxy
agrega frame-ancestors. **No es todavia una CSP estricta contra todo XSS**:
el sitio conserva muchos scripts y controladores inline. Convertirlos a
modulos/listeners y probar una politica script-src estricta requiere una
migracion adicional. Las correcciones actuales se aplican al escape contextual
y a enlaces concretos; no equivalen a una auditoria exhaustiva de cada plantilla.

## Cifrado y firmas

Supabase hospedado declara cifrado de discos y respaldos en reposo, y TLS en
transito. Auth usa bcrypt para contrasenas. El codigo de este proyecto envia
contrasenas a Auth por HTTPS y no las guarda en tablas de negocio ni localStorage.
No se verificaron configuraciones internas del proveedor desde esta sesion.

Se conservaron los archivos firmados byte por byte; no se reescribieron PDFs
ni firmas. Bucket privado, RLS/MFA y URLs cortas controlan acceso. Una URL ya
firmada es un permiso temporal y puede seguir funcionando hasta vencer aunque
se cierre la sesion. weetrust tiene sus propias URLs y politicas de retencion.

El cifrado adicional por campo/archivo con claves administradas por la empresa
NO se implemento: necesita KMS, recuperacion/rotacion de claves y adaptar busqueda,
firma e intercambio con weetrust. Cifrar columnas directamente romperia esos
flujos y podria volver irrecuperables los contratos. El cifrado del proveedor
no protege frente a un administrador autorizado o a una cuenta comprometida.

`herramientas/respaldo.sh` ahora exige age + BACKUP_AGE_RECIPIENT y usa
PGSSLMODE=verify-full. Configurar PGSSLROOTCERT con la CA del proyecto. La clave
privada age debe mantenerse fuera del repositorio y separada del respaldo.
El dump contiene public, auth, storage y private, pero Storage solo aporta
metadatos: los archivos deben respaldarse por separado. Se comprobo sintaxis
del script y sus rutas de exito/error con herramientas simuladas; no se hizo
un respaldo/restauracion de produccion ni se simulo la criptografia de age.

## Verificacion reproducible

```
npm ci
npm test
npm run test:edge
npm run check:edge
npm run security:scan
npm audit --audit-level=high
node herramientas/scan-secrets.mjs --history
```

El ultimo comando debe informar los secretos historicos y salir con codigo 1
hasta que se decida sanear la historia. No ejecuta pruebas de carga contra
produccion. CI ejecuta solo el escaneo actual y las pruebas locales.

Pruebas incluidas: escape/URL XSS, rutas del gateway y preservacion de JWT/cuerpo,
sintaxis de todos los scripts inline, 088-091 repetidas dos veces, cuotas,
aislamiento por identidad, revocacion de permisos, bloqueo REST directo,
MFA en Storage, revocacion al cambiar contrasena, Vault tras rotacion,
CORS exacto, limites por bytes, JSON profundo, fallo del limitador y encabezados.

Verificaciones manuales despues del despliegue: asociado A no lee contratos de
B; liderazgo conserva su acceso previsto; sin MFA no se accede por Edge/REST/
Storage; altas y recuperacion funcionan; API de Command exige llave vigente;
webhook sin secreto falla; el webhook legitimo actualiza solo el documento
confirmado por weetrust; bucket de incidencias no entrega URLs publicas.

## Reversion operativa

Si falla una funcion nueva, conservar RLS y los buckets privados. Revertirla
junto con el frontend correspondiente. Si fuera imprescindible regresar al
acceso REST anterior, restaurar solo la funcion mfa_verificar_peticion de 085
(manteniendo MFA), consciente de que se pierde el cierre contra evasiones de
rate limit. No volver a publicar secretos ni restaurar buckets sensibles como
publicos. Conservar contadores y configuracion privada para investigar.

## Fuentes tecnicas

- [Supabase: seguridad de contrasenas](https://supabase.com/docs/guides/auth/password-security)
- [Supabase: seguridad de la Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase: limites de Auth](https://supabase.com/docs/guides/auth/rate-limits)
- [Supabase: configuracion CLI](https://supabase.com/docs/guides/local-development/cli/config)
- [Supabase: Vault](https://supabase.com/docs/guides/database/vault)
- [Supabase: medidas de cifrado y respaldos](https://supabase.com/downloads/docs/Supabase%2BDPA%2B250314.pdf)
