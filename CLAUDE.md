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

## Archivos compartidos y el caché

Las hojas y los scripts de `assets/` se enlazan con una versión pegada
al final (`kw-claro.css?v=20260829`). Es lo único que hace que el
navegador y el CDN de GitHub Pages se bajen la copia nueva: sin cambiar
ese número, quien ya visitó el sitio sigue viendo la versión anterior
aunque el archivo ya esté subido.

**Al tocar cualquier archivo de `assets/`, hay que subirle la versión en
todos los lugares que lo enlazan** (las páginas, y el `@import` que
kw-base.css le hace a kw-ui.css). Se usa la fecha del día.

Ya pasó de no hacerlo: nueve archivos se quedaron sirviendo copias de
hasta un mes atrás, así que cambios que se veían bien en local no
llegaban a nadie. Para revisarlo, comparar la versión que piden las
páginas contra la fecha del último cambio real de cada archivo
(`git log -1 -- assets/...`).

## Base de datos

Las migraciones viven en `supabase/sql/` y se corren a mano desde el SQL
Editor de Supabase, en orden. No hay proceso automático, así que cada archivo
debe poder volver a correrse sin romper nada (idempotente) y sin pisar lo que
la gente ya haya capturado desde el sitio.
