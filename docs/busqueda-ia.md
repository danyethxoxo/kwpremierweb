# Búsqueda por descripción
Primera etapa: Propiedades y formulario de Perfil comprador. El ACM queda fuera de esta entrega.

## Configuración
- Proyecto de Supabase existente. Secreto: GEMINI_API_KEY.
- Modelo predeterminado: gemini-3.5-flash-lite. La disponibilidad y cuota gratuita dependen de Google.
- GEMINI_SEARCH_MODEL permite fijar otro modelo explícitamente. No hay cambio automático a modelos de pago.
- Función interpretar-busqueda: secureServe valida sesión y MFA, origen y tamaño del cuerpo. Límites: 5 solicitudes por minuto y 30 por hora por usuario.
- verify_jwt=false permite la autenticación propia del middleware compartido; las búsquedas no son anónimas.

## Flujo
El texto separado de los datos del cliente se depura de correos y teléfonos. Solo ese texto se envía a Gemini; no se envían el formulario completo, el inventario ni conversaciones anteriores.
La respuesta se valida con una lista de campos y tipos. Las ubicaciones se comprueban contra el catálogo real antes de mostrar la propuesta. Una colonia ambigua requiere aclaración.
El asesor confirma la propuesta. En Propiedades se aplican los filtros y se conserva Market Center, asesor y estatus seleccionados. En Perfil comprador solo se completan los criterios indicados, sin guardar automáticamente ni cambiar los datos de contacto.
Las características adicionales son palabras clave o etiquetas. No son amenidades verificadas ni equivalen a una búsqueda semántica completa.
Una nueva descripción invalida la propuesta anterior. Una falla de red o cuota conserva el formulario y permite usar los filtros habituales.

## Comprobación
Tests: busqueda-ia.test.mjs y busqueda-ia-browser.test.mjs.
El modo comprobar requiere WEBHOOK_SECRET y utiliza un ejemplo fijo sin datos de clientes. Devuelve solo estado, criterios y modelo, nunca la clave. No acepta un texto de prueba arbitrario con esa credencial.
