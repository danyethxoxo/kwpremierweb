# Seguridad y verificacion en dos pasos

## Puesta en produccion

La version segura usa un correo alternativo verificado y liga la aprobacion al
`session_id` de Supabase. Un codigo aprobado en un navegador no habilita otro.

Orden de despliegue:

1. Ejecutar `supabase/sql/085_mfa_correo_alternativo_seguro.sql` en SQL Editor.
2. Desplegar `supabase/functions/mfa-correo/index.ts` con JWT verification activa.
3. Confirmar que existen los secrets `RESEND_API_KEY` y `EMAIL_FROM`.
4. Si se usa otro dominio, configurar `MFA_ALLOWED_ORIGINS` como lista separada
   por comas. El valor predeterminado permite GitHub Pages y desarrollo local.
5. Probar con una cuenta normal antes de exigir MFA a mas usuarios.

La migracion conserva a los usuarios de la version anterior usando de forma
temporal su correo de acceso. Cada persona puede cambiarlo por uno alternativo
desde Perfil.

## Pruebas minimas

- Una cuenta sin MFA puede entrar normalmente.
- Activar MFA exige un correo distinto al usado para iniciar sesion.
- Un codigo vence en cinco minutos, funciona una vez y se bloquea tras cinco
  intentos; solo se permiten cinco envios por hora.
- Copiar el token a otro navegador no autoriza ese segundo `session_id`.
- Una consulta REST o RPC antes de verificar devuelve que se requiere el
  segundo paso.
- Desactivar o cambiar el correo requiere una sesion que ya completo MFA.
- El cliente nunca recibe el correo completo ni errores internos de Resend.

## Recomendaciones adicionales

- Hacer MFA obligatorio para Master y Admin despues del periodo de adopcion.
- Activar alertas de Supabase y Resend por picos de autenticacion o envio.
- Revisar trimestralmente roles, usuarios inactivos, politicas RLS y funciones
  `SECURITY DEFINER`.
- Mantener secretos solo en Supabase; rotarlos si aparecen en logs o commits.
- Rotar o eliminar de inmediato las cuentas `prueba2` a `prueba5`: sus antiguas
  contrasenas estaban en el historial Git. El script de carga ahora las recibe
  mediante `KW_TEST_USERS_JSON` y `KW_TEST_MASTER_JSON`.
- Configurar proteccion de rama, revision antes de merge y escaneo de secretos
  y dependencias en GitHub.
- Servir el sitio con CSP, HSTS, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy` y `Permissions-Policy`. GitHub Pages no permite controlar
  todos los encabezados; para ello usar un proxy o alojamiento configurable.
- Definir un procedimiento de respuesta: revocar sesiones, desactivar cuentas,
  rotar secretos, preservar registros y notificar a afectados.
- Probar restauraciones de respaldo. Un respaldo que nunca se restaura no es
  una estrategia de recuperacion comprobada.

Para SMS hace falta un proveedor transaccional y proteccion contra SIM swapping.
No debe enviarse desde el navegador. Si se agrega, debe conservar los mismos
limites, verificacion por sesion y recuperacion administrativa que este flujo.
