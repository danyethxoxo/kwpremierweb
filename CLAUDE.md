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

Todas las pantallas se ven igual porque usan las mismas piezas, no porque
cada una copie el aspecto de la de al lado. Las piezas viven en
`assets/css/kw-ui.css` (formas y medidas) y `assets/css/kw-claro.css`
(colores). **Antes de escribir estilos nuevos en el `<style>` de una
página, buscar si ya existe la pieza**: si existe, se usa; si no existe y
va a servir en más de una pantalla, se agrega allá y no aquí.

En el `<style>` de cada página se quedan nada más las cosas que solo esa
pantalla tiene (el visor del editor de firmas, el ancho de una columna),
y siempre con un comentario que diga por qué no puede salir de la pieza
compartida.

### El armazón de una pantalla

```html
<body>
  <header class="kw-header">…</header>   <!-- lupa y campanita, nada más -->
  <main class="kw-page">
    <div class="kw-page-encabezado con-acciones">
      <h1 class="kw-page-titulo">Nombre de la pantalla</h1>
      <div class="kw-page-acciones"> … </div>
    </div>
    …
  </main>
</body>
```

- **El header no es una barra.** Es la lupa de un lado y la campanita del
  otro, flotando sobre el contenido; los pone `drawer.js`. Ninguna
  pantalla se arma el suyo, ni le mete título, botones ni un buscador
  fijo. El menú lateral (el riel) también lo pone `drawer.js`.
- **El título va siempre en el mismo lugar**, dentro de
  `.kw-page-encabezado`, a `--tope-pegado` (62px) del tope. Si la
  pantalla tiene botones arriba, van en `.kw-page-acciones`, a la
  derecha del mismo renglón.
- **La búsqueda es la lupa.** Cada pantalla deja su campo de filtrar en
  el HTML con `.kw-campo-filtro`, y `drawer.js` lo esconde y le pasa lo
  que se escriba arriba.

### Tarjetas y renglones: el color va en el contorno, y se enciende al pasar el mouse

Es la regla que gobierna todo lo que se puede picar:

- **En reposo**, la tarjeta es blanca como todas las demás. Lo único de
  color es el contorno (al 34% del tono) y el filo del cuadro del ícono.
  Diez tarjetas rellenas de color a la vez se leen como una alarma, no
  como un orden.
- **Al pasar el mouse**, se enciende: entra el baño de color desde la
  esquina de abajo a la izquierda (`--tinte`), el contorno sube al 62%,
  y el cuadro del ícono se rellena del tono con el dibujo en blanco.
- **El color lo manda el ícono**, con `:has()`. Así vive en un solo
  lugar y no en dos que tarde o temprano se separan:

  ```css
  .hover-card:has(.icon-drive) { --tinte: …; --pastel: …; --tono: …; }
  ```

  Los tres van juntos: `--tinte` es el baño del fondo, `--pastel` el
  cuadro del ícono y `--tono` el trazo y el contorno. Salen de la paleta
  de `kw-claro.css` (rojo, rosa, menta, cielo, lavanda, crema, turquesa,
  durazno, oliva, índigo); no se inventan hexadecimales sueltos.
- Los renglones de una lista (`.kw-fila` con `.kw-fila-icono`) hacen lo
  mismo y por el mismo camino.

### Las piezas que ya existen

| Para | Pieza |
| --- | --- |
| Título de pantalla, con o sin botones | `.kw-page-encabezado` / `.con-acciones` / `.kw-page-acciones` |
| Tarjeta que se pica | `.hover-card` |
| Renglón de lista, con su cuadro de ícono | `.kw-fila` / `.kw-fila-icono.tipo-*` |
| Los datos de adentro de un renglón | `.kw-datos` + `.kw-dato`, y `.en-columnas` si son muchos |
| Botón que es nada más un ícono | `.kw-btn-icono` |
| Menú que cuelga de un botón | `.kw-menu-ancla` + `.kw-menu` + `.kw-menu-op` |
| Filtros | `.kw-filtros-caja` + `.kw-filtros` + `.kw-campo-filtro` |
| Campo de fecha o número, y el par de un rango | `.kw-fecha` / `.kw-rango` + `.kw-campo-rango` |
| Cuántos hay de cada cual, arriba, que además filtran | `.kw-resumen` + `.kw-conteo` |
| Desplegables | `<select>` a secas: `kw-ui.js` lo convierte |
| Pestañas | `.kw-tabs` / `.kw-tab`, y `.planas` para las de puro texto |
| Lista vacía | `.kw-vacio` |
| Bajar una lista a Excel | `window.kwXlsx.descargar(…)`, de `kw-xlsx.js` |

Detalles que se repiten y conviene no volver a discutir:

- **Los desplegables no son el `<select>` gris del navegador.** Se deja
  el `<select>` en el HTML y `kw-ui.js` lo convierte solo. Para un menú
  armado a mano (el de asignar DT en el ABC Tracker), el mismo look:
  tarjeta blanca, borde suave, esquinas redondeadas y sombra.
- **Los filtros van en su tarjeta** (`.kw-filtros-caja`), con el borde
  azul: no son lo que se viene a mirar, son con lo que se busca. El
  guinda se guarda para la marca y para lo que la pantalla hace.
- **El botón principal de la pantalla va en guinda y con texto**
  ("Nuevo dictamen", "Nuevo documento"). Todo lo demás que se hace cada
  tanto se junta en el engrane (`.kw-btn-icono` + `.kw-menu`), que se
  pone azul al pasar el mouse. Cuatro botones al hilo tapan al único que
  se usa a diario.
- **Las tarjetas son sólidas, no vidrio.** El vidrio esmerilado con blur
  es de cuando el fondo del sitio era oscuro; sobre el lienzo claro solo
  deja verse lo que pasa por debajo.
- **Nada de negritas para adornar.** Las etiquetas de estado ya saltan
  por su color; en negritas la lista entera grita.
- **Nada se queda flotando encima del contenido.** En una pantalla que
  es una lista larga, la que rueda es la lista y no la página: la tabla
  se lleva el alto que sobra y se desplaza por dentro, así los filtros,
  los botones y el encabezado se quedan quietos sin tener que encimarse
  sobre nada. El alto sale del acomodo (`flex` desde el `<body>`), no de
  una cuenta con números mágicos, y solo en pantalla ancha: en el
  celular una zona con scroll propio dentro de una página que también
  rueda es de lo peor que se puede hacer.
- **Lo que sí tenga que pegarse** al rodar se pega a `--tope-pegado` y se
  ve como parte de lo suyo: redondeado solo de arriba, sin sombra ni
  aire. La sombra aparece solo cuando de veras se despegó.

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
