# Estado para abrir KW Premier a la empresa

Este documento separa lo que esta probado en el repositorio de lo que solo se
puede confirmar en Supabase, GitHub Pages, el proxy del dominio y el proveedor
de correo. La interfaz actual se conserva: los cambios de esta entrega son de
seguridad, validacion y operacion.

## Resultado de esta entrega

El repositorio remoto `origin/main` se tomo como fuente de verdad y se preparo
la rama `codex/prod-readiness` sin tocar la copia local de ninguna computadora.

Se agrego:

- `npm run release:check`: una sola orden para escaneo de secretos, pruebas,
  chequeo de Edge Functions, pruebas de MFA y auditoria de dependencias.
- `npm run production:check`: smoke test de solo lectura contra el dominio y
  el gateway. Comprueba HTTPS, encabezados, CORS, bloqueo de REST directo y
  rechazo de tokens falsos.
- `npm run migration:check`: detecta nombres invalidos, timestamps repetidos y
  cambios accidentales en los prefijos historicos duplicados.
- Encabezados adicionales en el Worker de seguridad, sin cambiar HTML ni CSS.
- El script de carga mixta ya no contiene un proyecto Supabase fijo y exige
  variables de entorno de pruebas. Tambien bloquea el dominio de produccion.
- En Cloudflare ya se desplego `kwpremier-security-headers`, se crearon las
  rutas `kwpremieroficial.com/*` y `www.kwpremieroficial.com/*`, se activo
  `Full (strict)` y se pusieron en proxy solo los cinco registros web. Los
  registros de correo y validacion permanecen `DNS only`.
- En Supabase se corrigio `public.dictamenes_con_asesor` para que use RLS como
  `security_invoker`, se activo el bloqueo de contrasenas filtradas y se retiro
  el listado publico del bucket `perfiles` sin quitar sus URLs publicas. Los
  helpers de rol anonimos se conservaron porque las politicas publicas los
  necesitan para devolver `false` sin sesion.

## Regla de salida

No se deben invitar usuarios de la empresa hasta que las dos ordenes siguientes
terminen sin pendientes:

```powershell
npm ci
npm run release:check
npm run production:check
```

`release:check` valida el codigo. `production:check` valida el estado publicado
que el codigo local no puede garantizar.

## Bloqueos externos que siguen siendo obligatorios

Estos puntos no se pueden certificar desde GitHub ni desde una PC sin acceso al
proyecto y a las cuentas operativas:

1. **Estado de Supabase.** La vista sensible ya no reporta errores en Security
   Advisor y el smoke test del gateway quedo en 18 correctas y 0 pendientes.
   Aun quedan advertencias intencionales de funciones publicas y varias
   advertencias de funciones privilegiadas que deben revisarse por modulo; no
   se revocaron masivamente porque eso romperia prospectos, MFA o acciones de
   usuarios autenticados. Las carpetas `supabase/sql/` y
   `supabase/migrations/` no deben ejecutarse como una sola lista improvisada:
   hay prefijos repetidos y el repositorio conserva el historial manual.
2. **Auth.** Registro publico desactivado, confirmacion de correo, cambios
   seguros, limites de Auth, proteccion contra contrasenas filtradas y MFA
   TOTP estan configurados. Falta completar la prueba funcional con cuentas
   reales de cada rol.
3. **Secretos.** Rotar los secretos que alguna vez aparecieron en el historial
   Git, revocar sesiones de las cuentas de prueba antiguas y confirmar que
   `WEBHOOK_SECRET`, `SYNC_SECRET`, `DATA_GATEWAY_SECRET`, Resend y Weetrust
   solo existan en Secrets/Vault. Nunca pegarlos en un ticket o en el codigo.
4. **Respaldos.** Ejecutar `herramientas/respaldo.sh` con `pg_dump`, TLS
   verificado, `age` y un destinatario fuera de la computadora. Respaldar por
   separado los archivos de Storage y hacer una restauracion de prueba.
5. **Dominio.** **Completado.** Cloudflare ejecuta
   `deployment/security-headers-worker.mjs` delante de GitHub Pages con TLS
   `Full (strict)`. Las dos rutas web y los cinco registros proxied quedaron
   comprobados; `npm run production:check` termino con 18 correctas y 0
   pendientes. GitHub Pages por si solo no permite controlar todos esos
   encabezados.
6. **Observabilidad.** Activar alertas de Supabase para errores, Auth, Storage,
   limites y capacidad; alertas del correo; y un responsable que revise los
   errores cada dia durante la primera semana.

## Piloto antes de abrir a todos

Despues de cerrar los bloqueos externos, usar primero dos cuentas reales de
roles distintos. Probar inicio de sesion, MFA, recuperar contrasena, crear y
editar un documento, adjuntar y descargar un archivo, firma, notificaciones,
calendario, prospecto publico y cierre de sesion. Confirmar tambien que la
cuenta A no puede leer ni descargar documentos de la cuenta B.

Abrir despues un piloto de 3 a 5 personas durante un dia laboral. Revisar
errores, tiempos de respuesta, correos y limites antes de invitar al resto.

## Impacto visual

No se cambiaron las pantallas, rutas, textos de negocio, colores ni estilos. El
Worker solo agrega encabezados HTTP cuando se despliegue; los navegadores no
deben mostrar una diferencia visual. Si alguna integracion externa necesita
incrustar la web en un iframe, hay que autorizarla explicitamente antes de
activar el Worker porque la politica de marcos queda restringida al mismo
dominio.
