/* Los datos del editor son locales hasta pulsar Guardar. */
var kwRevisionGuardando = null;
function kwRevisionPendiente() { return modoEdicionRevision && !revisionMaterializadaId; }
async function materializarRevisionLocal(datos) {
  if (!modoEdicionRevision || !documentoRevisionOriginal || revisionMaterializadaId) return false;
  if (kwRevisionGuardando) return kwRevisionGuardando;
  kwRevisionGuardando = (async function () {
    const respuesta = await window.kwSupabase.rpc('guardar_revision_documento', {
      p_id: documentoRevisionOriginal.id, p_datos: datos
    });
    if (respuesta.error || !respuesta.data?.id) throw respuesta.error || new Error('No se pudo guardar la revisión.');
    revisionMaterializadaId = respuesta.data.id;
    documentoActualId = respuesta.data.id;
    revisionActual = respuesta.data.revision;
    folioActual = documentoRevisionOriginal.folio;
    estadoActual = 'borrador';
    actualizarVisibilidadBotones();
    updatePreview();
    return true;
  })();
  try { return await kwRevisionGuardando; } finally { kwRevisionGuardando = null; }
}
