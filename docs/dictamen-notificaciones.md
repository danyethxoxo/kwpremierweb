# Dictamenes: avisos y correo

Al guardar un dictamen finalizado o cambiar su estado se crea un aviso informativo para liderazgo (master, admin y staff), incluido quien guardo. No se avisa de borradores ni se duplica al guardar el mismo estado. El asunto conserva Dictamen de expediente y el estatus; el cuerpo identifica al asesor y la direccion, sin saludar al asesor como si fuera el receptor. La campana tambien presenta asi los avisos antiguos.

Los avisos de tipo dictamen no disparan correo: el trigger de notificaciones los excluye y notificar-email tambien los omite como defensa adicional. Los demas tipos conservan su envio habitual.

Guardar y enviar (destinatario todos) envia los dos PDFs al asesor, MCA y MCA Assistant, ademas de Dani Guerrero, perfiles de liderazgo con puesto Technology Director y la PC asignada en asesores.coach_asignado. El asesor recibe su mensaje personal; los demas, una version informativa en tercera persona con el mismo asunto, direccion y boton Ver en la plataforma. Los correos repetidos se deduplican. Los modos manuales asesor, mca, mcaa, yo y otro conservan su alcance explicito.

La PC se busca por el correo del asesor en la base de asesores. Su asignacion se resuelve por correo o nombre exacto normalizado, admitiendo el catalogo de nombres de PC usado por Base de asesores. Una asignacion desconocida o vacia nunca se sustituye por todas las PC. El resultado del envio incluye un aviso cuando falta esa asignacion; no impide el envio a los otros destinatarios. Al implementar este cambio no habia asignaciones de coach en la base.

Pruebas: dictamen-liderazgo.test.mjs cubre destinatarios y exclusiones, dos PDFs por grupo, formato por audiencia y triggers SQL sin correos duplicados. dictamen-notificacion.test.mjs y notificaciones-ui.test.mjs cubren compatibilidad del historial, omision del webhook y campana en escritorio y movil. Las pruebas simulan el proveedor y no envian correo real.
