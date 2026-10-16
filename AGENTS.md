# Diseño de KW Premier

## Textos de interfaz

Regla universal de avisos y ventanas: toda acción principal de confirmación (Guardar, Continuar, Aceptar, Confirmar, Finalizar, OK y equivalentes) usa fondo guinda sólido y texto blanco, incluyendo sus estados de interacción. Usar las piezas compartidas y `assets/css/kw-avisos.css`; no aplicar vidrio, gradientes, transparencias ni colores alternativos a estos botones. Cancelar y cerrar conservan jerarquía secundaria. No depender del texto del botón para reconocer su función: marcarlo con la clase de acción principal correspondiente.

Los avisos usan botones compactos, de ancho ajustado al texto, no expandido: 36 px de alto mínimo en escritorio, 40 px en móvil y separación de 8 px entre acciones. Unificar márgenes internos: 24 px en escritorio, 20 px en móvil, 12 px entre título y contenido, 20 px antes de las acciones. Mantener la jerarquía de título, contenido y botones. En el aviso de campos pendientes la acción se llama únicamente "Guardar".

Por indicación del usuario, mantener la interfaz simple y con el mínimo texto necesario. No agregar descripciones, ayudas permanentes, instrucciones obvias ni mensajes de éxito redundantes. Preferir etiquetas cortas y estados visuales: por ejemplo, un botón "Subir logo" que se sustituye por la miniatura con una acción de eliminar. Mostrar explicaciones solo cuando sean indispensables para completar una acción o resolver un error. Conservar nombres accesibles para controles con íconos.

## Contratos y acuerdos

Por indicacion del usuario, la referencia unica de contratos y acuerdos es `documentos/contratos/renta.html`.
Leer `docs/contratos-acuerdos.md`. Usar `kw-documentos-shell.css`, `kw-documentos-shell.js`, `kw-documentos-form.css` y `kw-revisiones.css`.
Solo cambian los campos, datos y contenido de cada documento. No crear distribuciones, fuentes, botones, pies, cargas ni ventanas propias del documento.
La vista previa y el PDF de los tres contratos toman Comercial como referencia, usando `kw-contrato-documento.css` y `kw-contrato-documento.js`; el formulario mantiene Renta como base.
Los tres contratos comparten tambi?n `kw-contratos-experiencia.css` y `kw-contratos-experiencia.js`: URLs de lista/nuevo/documento, tablas con scroll interno, miniaturas, pie de acciones y confirmaci?n de campos pendientes al guardar.
Esta regla sustituye Pagina Universal para los formularios y listados de contratos y acuerdos.

Para cada nuevo apartado, listado, formulario o configuración, usar **Página Universal**.

- Leer `docs/pagina-universal.md` y comenzar con `hub/pagina-universal.html`.
- Firmas Digitales es la referencia visual aprobada. Conservar su distribución, barra lateral, encabezado y acciones.
- Usar `assets/css/kw-pagina-universal.css` y `assets/js/kw-pagina-universal.js`; los botones comparten `kw-acciones-firmas.css`.
- No recrear estas piezas mediante estilos locales. Modificar solo campos, columnas y lógica del módulo.
- Mantener una sola caja `#notif-bell-slot`. Probar con `drawer.js` cargado.
- Validar escritorio y móvil. En tablas anchas, el scroll horizontal queda dentro del marco de la tabla.
- Usar la animación `.kw-loader`, sin textos de carga.
- La página de referencia no persiste datos: integrar y probar el guardado real antes de presentar un módulo como funcional.
- No migrar pantallas existentes que no formen parte del trabajo solicitado.
- No usar el carácter de guion largo en código, comentarios ni contenido.
- Guardar código, plantillas y SQL en UTF-8. Leer y enviar estos archivos con codificación UTF-8 explícita al desplegar.
- Los nuevos correos deben usar `supabase/functions/_shared/mailer.ts` (`plantillaCorreo` y `enviarCorreo`). Si un envío necesita llamar a Resend directamente, envolver su payload con `prepararCorreoUtf8` de `_shared/email-utf8.ts`. No agregar la leyenda "Te llega porque tienes cuenta en el portal de KW Premier."
