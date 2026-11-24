# Prospectos: piloto privado y Gmail

Ruta: https://kweb.com.mx/hub/prospectos-gmail.html

El piloto esta habilitado unicamente para la cuenta verificada dani.guerrero@kwmexico.mx. La autorizacion se guarda por identificador de cuenta en private.prospectos_piloto. Ningun otro rol de la plataforma, incluidos otros master, obtiene acceso por su rol. Las tablas prospectos_bandeja y prospectos_reglas aplican RLS por usuario y segundo factor. No se modifico la tabla prospectos de los formularios publicos.

Al vincular Gmail con permiso de lectura, Prospectos revisa mensajes nuevos de OmniMLS, JamesEdition e Inmuebles24. Extrae nombre, correo, telefono, interes, mensaje del cliente y origen. No guarda el correo completo ni sus adjuntos. El ID del mensaje evita crear el mismo prospecto mas de una vez. Las reglas iniciales cubren los tres portales; se pueden editar desde Reglas de deteccion.

Supabase revisa Gmail cada cinco minutos, aunque Prospectos este cerrado. Abrir el apartado tambien revisa de inmediato y existe Sincronizar ahora para una lectura manual. Gmail History API permite ponerse al dia desde el ultimo cursor; si Google ya vencio ese historial, se recuperan los mensajes coincidentes de los ultimos siete dias.

## Configurar Google una vez

1. En Google Cloud, usar un proyecto administrado por el propietario y habilitar Gmail API.
2. Configurar la pantalla de consentimiento. Para este piloto privado puede usarse una aplicacion externa en modo Pruebas, agregando como usuario de prueba la cuenta Gmail que se vinculara. No publicar para todos los asesores antes de revisar la verificacion requerida por Google.
3. Declarar el permiso https://www.googleapis.com/auth/gmail.readonly. Es lectura del buzon, no un permiso limitado por remitente.
4. Usar el cliente OAuth web existente de KWPremier en el proyecto. La función acepta únicamente el ID configurado en `GOOGLE_CLIENT_ID`. Registrar exactamente esta URI de redirección:

   https://iloetojomzqtadkithtv.supabase.co/functions/v1/prospectos-gmail

5. En Prospectos, abrir Configuracion de Gmail, introducir el ID y secreto del cliente y guardar. No enviar el secreto por chat ni guardarlo en GitHub.
6. Pulsar Vincular Gmail y completar personalmente el consentimiento de Google. La cuenta vinculada puede ser distinta del correo de inicio de sesion de KWEB; solo el propietario del piloto puede realizarlo.

Por solicitud del propietario, el piloto reutiliza el cliente OAuth existente de KWPremier. La revocación de Gmail podría afectar otras autorizaciones Google de la misma cuenta; antes de ampliar el uso a más cuentas se debe evaluar separar el cliente. Como el permiso Gmail está pendiente de verificación, Google puede mostrar una advertencia y limitar a los usuarios autorizados durante el piloto.

## Seguridad y operacion

- La Edge Function verifica JWT, MFA, pertenencia al piloto y vigencia de auth.sessions para todos los POST. Su GET publico solo redirige el callback a una ruta fija, sin intercambiar credenciales.
- El flujo OAuth usa estado aleatorio con hash, expiracion de diez minutos, vinculo a usuario y sesion, consumo atomico de un solo uso y PKCE S256.
- El callback entrega el codigo en un fragmento con nombres propios; la pagina lo retira inmediatamente de la URL. No inicia ni cambia la sesion de KWEB.
- El secreto del cliente, verificador PKCE y refresh token se cifran con AES-256-GCM y datos asociados al usuario y finalidad. El navegador nunca recibe las credenciales guardadas.
- La clave de cifrado se deriva con HKDF de PROSPECTOS_TOKEN_KEY, si se configura, o del secreto interno DATA_GATEWAY_SECRET con separacion de finalidad. Rotar esa clave requiere volver a configurar/vincular Gmail. No reutilizar el secreto en clientes publicos.
- El RPC prospectos_gmail_backend solo admite service_role. Las tablas de credenciales y estados estan en private, sin permisos para anon ni authenticated.
- prospectos_gmail_import_backend solo admite service_role y vuelve a comprobar el piloto y la vigencia de la sesion antes de leer reglas, mover el cursor o insertar datos deduplicados.
- prospectos_gmail_sync_accounts e import_job son solo para service_role; el cron lee unicamente cuentas conectadas del piloto activo. El trabajo programado se autentica con WEBHOOK_SECRET de Edge Functions y kw_webhook_secret de Vault.
- Desvincular elimina las credenciales de KWEB e intenta revocarlas en Google. Si Google no confirma, la pantalla informa que debe retirarse tambien el acceso desde la cuenta Google. Los prospectos guardados se conservan.
- No se usan contrasenas de Gmail, no se envian mensajes ni se procesan adjuntos. La nota solo conserva el texto de mensaje del cliente, sin direcciones de correo, telefonos ni enlaces del cuerpo.

## Verificacion

Tests: prospectos-db.test.mjs (RLS, MFA, ACL, estado atomico, sesion revocada), prospectos-gmail.test.mjs (cifrado, PKCE, callback fijo, repeticion de codigo, denegacion) y prospectos-browser.test.mjs (captura, reglas, configuracion, callback, otro master denegado, escritorio y movil con drawer.js).

La vinculación con una cuenta Google real requiere que el propietario guarde el secreto OAuth en Configuración de Gmail y complete el consentimiento de Google. La sincronización en segundo plano comienza después del consentimiento; las pruebas automatizadas usan respuestas simuladas de Google.

