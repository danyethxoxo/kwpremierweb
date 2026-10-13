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

1. **Estado de Supabase.** Confirmar que las migraciones de seguridad y las
   funciones desplegadas corresponden al commit que se va a publicar. Las
   carpetas `supabase/sql/` y `supabase/migrations/` no deben ejecutarse como
   una sola lista improvisada: hay prefijos repetidos y el repositorio conserva
   el historial manual. Antes de agregar migraciones nuevas se debe comparar el
   historial real del proyecto hospedado y dejar una sola secuencia registrada.
2. **Auth.** Verificar registro publico desactivado, contrasena minima de 12,
   confirmacion de correo, cambio seguro, limites de Auth, proteccion contra
   contrasenas filtradas si esta disponible y MFA obligatorio para Master/Admin.
3. **Secretos.** Rotar los secretos que alguna vez aparecieron en el historial
   Git, revocar sesiones de las cuentas de prueba antiguas y confirmar que
   `WEBHOOK_SECRET`, `SYNC_SECRET`, `DATA_GATEWAY_SECRET`, Resend y Weetrust
   solo existan en Secrets/Vault. Nunca pegarlos en un ticket o en el codigo.
4. **Respaldos.** Ejecutar `herramientas/respaldo.sh` con `pg_dump`, TLS
   verificado, `age` y un destinatario fuera de la computadora. Respaldar por
   separado los archivos de Storage y hacer una restauracion de prueba.
5. **Dominio.** Poner `deployment/security-headers-worker.mjs` delante de
   GitHub Pages, con TLS Full (strict), y repetir `npm run production:check`.
   GitHub Pages por si solo no permite controlar todos esos encabezados.
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
