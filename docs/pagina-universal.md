# Página Universal

La referencia aprobada es Firmas Digitales. La distribución para nuevas pantallas está en `hub/pagina-universal.html`: tiene vista de listado y vista de formulario. Es una referencia visual autenticada, sin persistencia ni registros ficticios.

## Crear un apartado

1. Copiar `hub/pagina-universal.html` a la ruta del nuevo módulo.
2. Cambiar el título, los filtros, las columnas o los campos. Conservar el armazón y las clases compartidas.
3. Sustituir el script de demostración por el flujo real, con sus permisos, carga y guardado. La referencia no guarda datos.
4. Cargar el CSS del módulo antes de `kw-pagina-universal.css`. Dejar en el CSS local únicamente lo específico del módulo.
5. Revisar escritorio y móvil, los estados vacío/error/carga y las acciones con el menú lateral cargado.

## Piezas obligatorias

| Función | Clase o archivo |
| --- | --- |
| Activar la distribución | `body.kw-pagina-universal` |
| Armazón | `.kw-universal-shell.kw-lateral-shell` |
| Barra lateral | `.kw-universal-panel.kw-lateral` |
| Área principal | `.kw-universal-principal.kw-lateral-principal` |
| Encabezado | `.kw-universal-encabezado.kw-page-encabezado.kw-acciones-firmas` |
| Acciones | `.kw-page-acciones`, en orden engranaje, campana, acción principal |
| Acción principal | `button.btn-nuevo-doc#btn-nuevo` |
| Campana | Una sola caja `#notif-bell-slot`; reutilizada por `drawer.js` |
| Menú de herramientas | `.kw-menu-ancla`, `.kw-btn-icono[data-kw-menu-universal]`, `.kw-menu` |
| Tabla | `.kw-universal-tabla-marco.kw-universal-contenido` y `table.kw-universal-tabla` |
| Tabla con muchos campos | Añadir `.horizontal`; conservar scroll dentro del marco |
| Primera columna fija | `.col-fija` en su encabezado y celdas |
| Formulario | `.kw-universal-formulario`, `.kw-universal-form-grid` y `.field` |
| Campo de ancho completo | `.field.ancho` |
| Carga | `.kw-loader` y sus tres círculos; sin textos de carga |

## Medidas de la referencia

- Barra lateral: 292 px en escritorio; logo y switch en cabecera de 58 px.
- Área principal: 18 px de relleno; encabezado con 12 px de separación al contenido.
- Engranaje: 34 × 34 px, dibujo de 18 px.
- Campana: 40 × 40 px. Separación entre acciones: 8 px.
- Acción principal: relleno de 9 × 16 px, tipografía de 13 px, ícono de 15 px, borde redondeado de 999 px.
- Tabla: radio `--r-tarjeta`, borde y sombra de la paleta compartida.
- Formulario: dos columnas en escritorio y una en móvil. El área de contenido desplaza; el encabezado permanece en su lugar en escritorio.

No crear otra versión de estos botones, cambiar sus tamaños desde el módulo ni duplicar la campana. Las mejoras universales se hacen en las piezas compartidas. Migrar pantallas anteriores solamente cuando se solicite; esta base no cambia sus permisos ni sus flujos.
