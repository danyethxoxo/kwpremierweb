# Notas del proyecto

## Tipografía

**No usar el guión largo (em dash, `—`) en ningún lado**: ni en texto que se
ve en pantalla, ni en comentarios de código, ni en mensajes de commit. Se ve
mal en el sitio. En su lugar, según el caso:

- dos puntos, cuando lo que sigue explica lo anterior
- coma o punto y coma, cuando separa ideas
- paréntesis, cuando es un inciso
- un guión corto (`-`), si de plano hace falta un guión

Los separadores decorativos de bloques de comentario (`/* ── Título ── */`)
usan otro carácter (`─`, U+2500) y esos sí se quedan.

## Estilo visual

- Los desplegables no deben ser el `<select>` gris del navegador. El sitio
  tiene su propio componente: `assets/css/kw-ui.css` + `assets/js/kw-ui.js`,
  que convierte solo cada `<select>` de la página. Para menús armados a mano
  (por ejemplo el de asignar DT en el ABC Tracker), seguir el mismo look:
  tarjeta blanca, borde suave, esquinas redondeadas y sombra.
- Las pestañas usan `.kw-tabs` / `.kw-tab` del mismo archivo.

## Base de datos

Las migraciones viven en `supabase/sql/` y se corren a mano desde el SQL
Editor de Supabase, en orden. No hay proceso automático, así que cada archivo
debe poder volver a correrse sin romper nada (idempotente) y sin pisar lo que
la gente ya haya capturado desde el sitio.
