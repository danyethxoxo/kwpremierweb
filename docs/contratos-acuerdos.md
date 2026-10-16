# Base de contratos y acuerdos

Renta es la referencia aprobada para todos los contratos y acuerdos. La interfaz se comparte; cada documento aporta sus campos y contenido.

Para el papel, vista previa y PDF de los tres contratos, la referencia aprobada es Comercial. `kw-contrato-documento.css` define el mismo papel Carta, márgenes, tipografía, encabezado y pie. `kw-contrato-documento.js` pagina y actualiza las hojas sin reemplazarlas, y exporta esas mismas hojas a PDF o al puente de firmas. No mantener generadores de impresión ni medidas independientes en Renta o Profeco. Los anexos de Profeco conservan sus saltos explícitos y el contenido de cada contrato se mantiene en su propia plantilla.

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

El logo se define una sola vez en `kw-documentos-shell.js` (`marca` y `aplicarMarca`): caja de 98 x 38 px, a 72 px del borde izquierdo y 30 px del superior de la hoja. `kw-pdf-vector.js` aplica las mismas coordenadas físicas al exportar. No definir medidas distintas por plantilla. En los tres contratos, `marcaContrato` y `marcaPara(img)` ajustan la posición horizontal a 64 px para alinear el logo con el inicio del cuerpo del texto, también en miniaturas y PDF. El logo de empresa se alinea con el final del mismo cuerpo.

Renta y Comercial permiten un logo opcional de la empresa del asesor mediante `kw-logo-empresa-v2.js`, disponible también en Mi perfil. El control comparte `kw-logo-empresa.css`: solo muestra "Subir logo" con ícono; al subirlo, lo sustituye por una miniatura con una × accesible para eliminarlo. No mostrar ayudas permanentes ni mensajes de éxito. Usa una caja de 107.8 x 41.8 px (10 % mayor que el logo de KW Premier) a 64 px del borde derecho y 30 px del superior, conservando proporciones y transparencia. Se normaliza como PNG y se guarda en una ruta nueva dentro de la carpeta propia del bucket `perfiles`; la cuenta conserva solo su URL en `user_metadata.kw_logo_empresa_url` (preferencia visual, nunca autorización). Cada contrato guarda una copia PNG en `datos.logo_empresa`; los documentos anteriores sin esa clave conservan su encabezado original, aunque cambie el perfil. El PDF incluye la copia del documento. Los finalizados bloquean el control y las revisiones vuelven a habilitarlo. PROFECO no incorpora esta opción.

Comercial admite de uno a seis clientes. `datos.clientes` conserva los datos individuales; las claves históricas del primer cliente se mantienen para compatibilidad. Los borradores anteriores sin ese arreglo abren con un cliente. Las declaraciones y firmas se generan por cliente, y solo se guardan los clientes activos del selector.

`kw-documentos-campos.js` comparte los catálogos de estados civiles, inmuebles comerciales, estados mexicanos y divisas MXN/USD/EUR, el formato de importes y la lectura del perfil de la cuenta. El autocompletado de un nuevo documento solo llena campos vacíos y deja editable lo capturado. La divisa se guarda en el borrador y se refleja en número y letra en el documento. Los importes conservan un valor numérico sin separadores en Comercial.

Comercial mantiene representante y MCA como datos fijos del documento, sin campos editables. Sus acciones siguen el flujo de Renta: Guardar al crear, Finalizar tras guardar, Descargar y Copiar al finalizar. Los mensajes se muestran en ventanas centrales. `data-kw-paso="5"` configura el incremento de los controles numéricos sin impedir la captura manual de decimales.

Verificar escritorio y móvil: listado, formulario, fuentes, pie fijo, regreso al listado, guardado y reapertura, revisiones y PDF. Al modificar un recurso compartido, actualizar su versión en las 12 plantillas.

## Experiencia com?n de los tres contratos

`kw-contratos-experiencia.css` y `kw-contratos-experiencia.js` completan el armaz?n compartido de Renta, Comercial y Profeco. Usar la URL base para la lista, `?nuevo=1` para crear y `?doc=ID` para abrir un documento guardado. Las tablas de borradores y finalizados tienen desplazamiento interno.

El formulario comparte separador, regreso a la lista y pie de acciones. Profeco conserva sus secciones y abre inicialmente solo Generales. La vista previa incluye bordes de hoja y miniaturas navegables; las miniaturas quedan fuera de la exportaci?n PDF y reaccionan al evento `kw-contrato-render`. El encabezado impreso conserva ?nicamente el logo, sin la etiqueta del tipo de contrato.

Antes de guardar manualmente un borrador incompleto, mostrar los campos pendientes y permitir Guardar o Cancelar. Cancelar no persiste datos ni borra lo capturado. Usar el aviso central de ?xito de Renta para guardar y finalizar, sin mensajes adicionales al descargar o copiar. El autocompletado del perfil emite `input` con `detail.origen = perfil` para no marcar cambios manuales al abrir Comercial.

Renta termina la primera hoja al finalizar la clausula Segunda y comienza la segunda con la clausula Tercera. Las firmas van juntas en una hoja exclusiva, en dos columnas, con espacio vertical para firmar. La separacion entre parrafos de Renta es de 8 px, con la misma letra y contenido.
