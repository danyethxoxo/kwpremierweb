# Diseño de KW Premier

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
