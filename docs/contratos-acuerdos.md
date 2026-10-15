# Base de contratos y acuerdos

Renta es la referencia aprobada para todos los contratos y acuerdos. La interfaz se comparte; cada documento aporta sus campos y contenido.

- `assets/css/kw-documentos-shell.css`: estructura extraída de Renta, tipografía, listado, columnas, ventanas, estados de carga y navegación móvil. Es la fuente de estos estilos; no copiarlos a las plantillas.
- `assets/js/kw-documentos-shell.js`: montaje del armazón, pie fijo, transición de vistas, historial del navegador, selector móvil y solicitud de nombre.
- `assets/css/kw-documentos-form.css`: medidas, etiquetas y controles compartidos del formulario, así como el zoom.
- `assets/css/kw-revisiones.css` y `assets/js/kw-revisiones.js`: revisiones y acciones comunes. La preparación del pie delega en `kwDocumentosShell.prepararFormularioFijo`.

## Nuevo documento

Copiar únicamente el arranque de Comercial y definir su configuración, no su interfaz:

```js
kwDocumentosShell.montar({
  id: 'nuevo-documento',
  titulo: 'Nombre del contrato',
  acciones: [
    {id: 'guardar', texto: 'Guardar borrador', tipo: 'submit', accion: 'guardar'},
    {id: 'finalizar', texto: 'Finalizar', accion: 'finalizar'},
    {id: 'descargar', texto: 'Descargar', accion: 'descargar'}
  ]
});
```

Definir los campos dentro del formulario generado, el contenido del documento y su persistencia. El nombre se solicita al guardar, usando `kwDocumentosShell.pedirNombre`. No agregar un campo de nombre al formulario.

Los documentos anteriores conservan sus IDs y lógica de datos para no romper borradores, folios ni revisiones. Comparten los estilos extraídos y el montaje del pie. No volver a introducir estilos locales que compitan con la base.

Mantener el contenido legal y la paginación en archivos específicos del documento. No modificar Firmas Digitales ni el armazón de otras áreas para ajustar un contrato.

Verificar escritorio y móvil: listado, formulario, fuentes, pie fijo, regreso al listado, guardado y reapertura, revisiones y PDF. Al modificar un recurso compartido, actualizar su versión en las 12 plantillas.
