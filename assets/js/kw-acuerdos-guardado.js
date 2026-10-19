/* Los acuerdos se guardan listos para firmar; los contratos conservan sus pasos. */
(function () {
  'use strict';
  document.body.classList.add('kw-acuerdos-guardado');
  let guardando = false;
  const actualizarOriginal = actualizarVisibilidadBotones;
  actualizarVisibilidadBotones = function () {
    actualizarOriginal();
    ['btn-finalizar', 'fab-finalizar'].forEach(id => {
      const boton = document.getElementById(id);
      if (boton) boton.style.display = 'none';
    });
    ['btn-guardar', 'fab-guardar'].forEach(id => {
      const boton = document.getElementById(id);
      if (boton) {
        boton.innerHTML = 'Guardar';
        boton.disabled = guardando;
      }
    });
  };

  async function guardarAcuerdo(nombre) {
    if (guardando || estadoActual === 'finalizado') return;
    guardando = true;
    actualizarVisibilidadBotones();
    const cerrarCarga = window.kwUI.cargando('Guardando acuerdo');
    let errorGuardado = null;
    try {
      if (!window.kwSupabase) throw new Error('No se pudo conectar con la sesión.');
      const datos = datosActuales();
      if (!documentoActualId) {
        const usuario = await window.kwSupabase.auth.getUser();
        if (usuario.error) throw usuario.error;
        if (!usuario.data?.user) throw new Error('No hay sesión activa.');
        const respuesta = await window.kwSupabase.from('documentos_guardados').insert({
          user_id: usuario.data.user.id, tipo_documento: TIPO_DOCUMENTO,
          nombre_archivo: nombre || nombreArchivoDoc(), datos
        }).select('id').single();
        if (respuesta.error) throw respuesta.error;
        documentoActualId = respuesta.data.id;
      } else {
        const revisionNueva = await materializarRevisionLocal(datos);
        if (!revisionNueva) {
          const respuesta = await window.kwSupabase.from('documentos_guardados')
            .update({ datos }).eq('id', documentoActualId);
          if (respuesta.error) throw respuesta.error;
        }
      }
      // Se conserva el ID si falla la conexión para reintentar sin duplicar.
      const finalizado = await window.kwSupabase.rpc('finalizar_documento', { p_id: documentoActualId });
      if (finalizado.error) throw finalizado.error;
      folioActual = finalizado.data;
      estadoActual = 'finalizado';
      modoEdicionRevision = false;
      documentoRevisionOriginal = null;
      revisionMaterializadaId = null;
      updatePreview();
      bloquearFormulario(true);
      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('doc', documentoActualId);
      window.history.replaceState(null, '', url);
    } catch (error) {
      errorGuardado = error;
    } finally {
      guardando = false;
      actualizarVisibilidadBotones();
      cerrarCarga();
    }
    if (errorGuardado) {
      setGuardarMsg(errorGuardado.message || 'No se pudo guardar el acuerdo. Intenta de nuevo.', 'error');
    } else {
      setGuardarMsg('Acuerdo guardado.', 'ok');
      cargarListaDocumentos();
    }
  }

  guardarComoNuevo = guardarAcuerdo;
  guardarDocumento = function () {
    if (guardando) return;
    if (!documentoActualId) { abrirModalNombre(); return; }
    return guardarAcuerdo();
  };

  renderListaDocumentos = function () {
    const consulta = (document.getElementById('buscador-input').value || '').trim().toLowerCase();
    const coincide = row => !consulta || [row.nombre_archivo, row.folio, fmtFechaCorta(row.updated_at)]
      .some(valor => String(valor || '').toLowerCase().includes(consulta));
    const grupos = agruparDocumentos(documentosCache).map(grupo => {
      const originalCoincide = coincide(grupo.original);
      const revisiones = grupo.revisiones.filter(coincide);
      return originalCoincide || revisiones.length
        ? { original: grupo.original, revisiones: originalCoincide ? grupo.revisiones : revisiones } : null;
    }).filter(Boolean);
    const contenedor = document.getElementById('lista-borradores');
    pintarColumnaLista(contenedor, grupos, 'Aún no tienes acuerdos guardados.');
    contenedor.querySelectorAll('[title="Borrador"], [title="Finalizado"]').forEach(el => {
      el.title = 'Guardado';
    });
    contenedor.querySelectorAll('.lista-revision-meta').forEach(el => {
      el.textContent = el.textContent.replace(/Finalizado|Borrador/g, 'Guardado');
    });
  };

  function preparar() {
    const titulo = document.querySelector('#columna-borradores .lista-columna-title');
    if (titulo) titulo.textContent = 'Guardados';
    document.querySelectorAll('.fab-label-guardar').forEach(el => { el.textContent = 'Guardar'; });
    document.getElementById('fab-guardar')?.setAttribute('title', 'Guardar');
    actualizarVisibilidadBotones();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', preparar);
  else preparar();
})();
