function fmtFechaHora(iso) {
  if (!iso) return '';
  try {
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return '';
    return fecha.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
      + ' · ' + fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}


async function cargarListaDocumentos() {
  const contB = document.getElementById('lista-borradores');
  const contF = document.getElementById('lista-finalizados');
  contB.innerHTML = '<div class="kw-lista"><div class="kw-fila"><div class="kw-fila-cabeza"><div class="kw-skel kw-skel-circle" style="width:11px;height:11px;"></div><div class="kw-fila-texto"><div class="kw-skel kw-skel-line kw-skel-w70"></div><div class="kw-skel kw-skel-line kw-skel-sm kw-skel-w40" style="margin-top:7px;"></div></div><div class="kw-skel kw-skel-circle"></div></div></div><div class="kw-fila"><div class="kw-fila-cabeza"><div class="kw-skel kw-skel-circle" style="width:11px;height:11px;"></div><div class="kw-fila-texto"><div class="kw-skel kw-skel-line kw-skel-w50"></div><div class="kw-skel kw-skel-line kw-skel-sm kw-skel-w30" style="margin-top:7px;"></div></div><div class="kw-skel kw-skel-circle"></div></div></div><div class="kw-fila"><div class="kw-fila-cabeza"><div class="kw-skel kw-skel-circle" style="width:11px;height:11px;"></div><div class="kw-fila-texto"><div class="kw-skel kw-skel-line kw-skel-w60"></div><div class="kw-skel kw-skel-line kw-skel-sm kw-skel-w40" style="margin-top:7px;"></div></div><div class="kw-skel kw-skel-circle"></div></div></div></div>';
  contF.innerHTML = '<div class="kw-lista"><div class="kw-fila"><div class="kw-fila-cabeza"><div class="kw-skel kw-skel-circle" style="width:11px;height:11px;"></div><div class="kw-fila-texto"><div class="kw-skel kw-skel-line kw-skel-w70"></div><div class="kw-skel kw-skel-line kw-skel-sm kw-skel-w40" style="margin-top:7px;"></div></div><div class="kw-skel kw-skel-circle"></div></div></div><div class="kw-fila"><div class="kw-fila-cabeza"><div class="kw-skel kw-skel-circle" style="width:11px;height:11px;"></div><div class="kw-fila-texto"><div class="kw-skel kw-skel-line kw-skel-w50"></div><div class="kw-skel kw-skel-line kw-skel-sm kw-skel-w30" style="margin-top:7px;"></div></div><div class="kw-skel kw-skel-circle"></div></div></div><div class="kw-fila"><div class="kw-fila-cabeza"><div class="kw-skel kw-skel-circle" style="width:11px;height:11px;"></div><div class="kw-fila-texto"><div class="kw-skel kw-skel-line kw-skel-w60"></div><div class="kw-skel kw-skel-line kw-skel-sm kw-skel-w40" style="margin-top:7px;"></div></div><div class="kw-skel kw-skel-circle"></div></div></div></div>';
  try {
    if (!window.kwSupabase) throw new Error('No se pudo conectar con la sesión.');
    const { data: userData, error: userError } = await window.kwSession.usuario(window.kwSupabase);
    if (userError || !userData || !userData.user) throw new Error('No hay sesión activa.');

    const { data, error } = await window.kwSupabase
      .from('documentos_guardados')
      .select('id, nombre_archivo, created_at, updated_at, folio, estado, revision')
      .eq('user_id', userData.user.id)
      .eq('tipo_documento', TIPO_DOCUMENTO)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    documentosCache = data || [];
    renderListaDocumentos();
  } catch (err) {
    const msg = `<div class="lista-vacio" style="color:#ff6b6b;">${escapeHtml(err.message || 'Ocurrió un error al cargar tus documentos.')}</div>`;
    contB.innerHTML = msg;
    contF.innerHTML = msg;
  }
}

function renderListaDocumentos() {
  const q = (document.getElementById('buscador-input').value || '').trim().toLowerCase();

  const coincide = (row) => {
    if (!q) return true;
    const nombre = (row.nombre_archivo || '').toLowerCase();
    const folio = (row.folio || '').toLowerCase();
    const fecha = fmtFechaCorta(row.updated_at).toLowerCase();
    return nombre.includes(q) || folio.includes(q) || fecha.includes(q);
  };

  const grupos = agruparDocumentos(documentosCache)
    .map((grupo) => {
      const originalCoincide = coincide(grupo.original);
      const revisionesCoinciden = grupo.revisiones.filter(coincide);
      if (!originalCoincide && !revisionesCoinciden.length) return null;
      return {
        original: grupo.original,
        revisiones: originalCoincide ? grupo.revisiones : revisionesCoinciden
      };
    })
    .filter(Boolean);

  const borradores = grupos.filter(grupo => grupo.original.estado !== 'finalizado' || grupo.revisiones.some(r => r.estado !== 'finalizado')); 
  const finalizados = grupos.filter(grupo => grupo.original.estado === 'finalizado');

  pintarColumnaLista(document.getElementById('lista-borradores'), borradores, 'Aún no tienes borradores de este tipo.');
  pintarColumnaLista(document.getElementById('lista-finalizados'), finalizados, 'Aún no tienes documentos finalizados de este tipo.');
}

function numeroRevisionDe(row) {
  return Number(row && row.revision) || 0;
}

function fechaListaMs(row) {
  const valor = Date.parse((row && row.updated_at) || '');
  return Number.isFinite(valor) ? valor : 0;
}

function agruparDocumentos(rows) {
  const grupos = [];
  const originalesPorFolio = new Map();
  const usados = new Set();

  rows.forEach((row) => {
    if (numeroRevisionDe(row) !== 0 || !row.folio) return;
    if (!originalesPorFolio.has(row.folio)) originalesPorFolio.set(row.folio, row);
  });

  rows.forEach((row) => {
    if (numeroRevisionDe(row) !== 0 || usados.has(row.id)) return;
    const revisiones = row.folio
      ? rows.filter((posible) => numeroRevisionDe(posible) > 0 && posible.folio === row.folio)
      : [];
    revisiones.sort((a, b) => numeroRevisionDe(b) - numeroRevisionDe(a) || fechaListaMs(b) - fechaListaMs(a));
    usados.add(row.id);
    revisiones.forEach((revision) => usados.add(revision.id));
    grupos.push({ original: row, revisiones });
  });

  // Si existiera una revisión antigua sin su original visible, se conserva
  // como fila independiente para no perder el acceso al documento.
  rows.forEach((row) => {
    if (usados.has(row.id)) return;
    const original = row.folio ? originalesPorFolio.get(row.folio) : null;
    if (original) return;
    usados.add(row.id);
    grupos.push({ original: row, revisiones: [] });
  });

  grupos.sort((a, b) => {
    const ultimoA = Math.max(fechaListaMs(a.original), ...a.revisiones.map(fechaListaMs));
    const ultimoB = Math.max(fechaListaMs(b.original), ...b.revisiones.map(fechaListaMs));
    return ultimoB - ultimoA;
  });
  return grupos;
}

function cerrarMenusLista() {
  if (window.kwUI && window.kwUI.cerrarMenusLista) window.kwUI.cerrarMenusLista();
}

function pintarColumnaLista(cont, grupos, vacioTexto) {
  cerrarMenusLista();
  if (!grupos.length) {
    cont.innerHTML = `<div class="lista-vacio">${escapeHtml(vacioTexto)}</div>`;
    return;
  }
  cont.innerHTML = '<div class="kw-lista">'
    + grupos.map((grupo, i) => {
      const row = grupo.original;
      const listo = row.estado === 'finalizado';
      const numeroRevision = numeroRevisionDe(row);
      const tieneRevisiones = row.estado === 'finalizado' && grupo.revisiones.length > 0;
      const grupoId = 'lista-revisiones-' + String(row.id || i).replace(/[^a-zA-Z0-9_-]/g, '');
      const metaPartes = [];
      if (row.folio) metaPartes.push('Folio ' + escapeHtml(row.folio));
      metaPartes.push(numeroRevision === 0 ? 'Original' : 'Revisión ' + numeroRevision);
      if (tieneRevisiones) metaPartes.push(grupo.revisiones.length + (grupo.revisiones.length === 1 ? ' revisión' : ' revisiones'));
      metaPartes.push('Creado ' + fmtFechaHora(row.created_at || row.updated_at));
      const menuAbrir = tieneRevisiones
        ? `<button type="button" class="kw-menu-op lista-menu-abrir" data-doc-id="${escapeHtml(row.id)}" role="menuitem">Abrir original</button>`
        : '';
      const botonAbrirOriginal = tieneRevisiones
        ? `<button type="button" class="lista-abrir-original" data-doc-id="${escapeHtml(row.id)}">Abrir original</button>`
        : '';
      const menuEliminar = !listo && numeroRevision === 0
        ? `<button type="button" class="kw-menu-op lista-menu-eliminar" data-doc-id="${escapeHtml(row.id)}" role="menuitem">Eliminar</button>`
        : '';
      const revisionesHtml = tieneRevisiones ? `
        <div class="lista-revisiones cerrada" id="${escapeHtml(grupoId)}" aria-hidden="true">
          <div class="lista-revisiones-contenido">
          ${grupo.revisiones.map((revision) => {
            const revisionLista = numeroRevisionDe(revision);
            const revisionListaFinalizada = revision.estado === 'finalizado';
            const revisionMeta = [
              revision.folio ? 'Folio ' + escapeHtml(revision.folio) : '',
              revisionListaFinalizada ? 'Finalizado' : 'Borrador',
              'Creado ' + fmtFechaHora(revision.created_at || revision.updated_at)
            ].filter(Boolean).join(' · ');
            return `
          <div class="lista-revision-item" data-doc-id="${escapeHtml(revision.id)}" role="button" tabindex="0">
            <span class="kw-fila-punto ${revisionListaFinalizada ? 'verde' : 'ambar'}" title="${revisionListaFinalizada ? 'Finalizado' : 'Borrador'}"></span>
            <span class="lista-revision-texto">
              <span class="lista-revision-titulo">Revisión ${revisionLista}</span>
              <span class="lista-revision-meta">${revisionMeta}</span>
            </span>
            <svg class="lista-revision-flecha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
          </div>`;
          }).join('')}
          </div>
        </div>` : '';
      return `
    <div class="lista-grupo ${tieneRevisiones ? 'tiene-revisiones' : ''} kw-aparece-fila" data-group-id="${escapeHtml(grupoId)}" style="animation-delay:${Math.min(i,8)*30}ms;">
      <div class="kw-fila lista-item lista-item-original" data-doc-id="${escapeHtml(row.id)}">
        <div class="kw-fila-cabeza doc-fila">
        ${tieneRevisiones
          ? `<button type="button" class="lista-revision-toggle" aria-expanded="false" aria-controls="${escapeHtml(grupoId)}" title="Mostrar revisiones"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg></button>`
          : '<span class="lista-revision-toggle-placeholder" aria-hidden="true"></span>'}
        <span class="kw-fila-punto ${listo ? 'verde' : 'ambar'}" title="${listo ? 'Finalizado' : 'Borrador'}"></span>
        <span class="kw-fila-texto lista-item-texto">
          <span class="kw-fila-titulo">${escapeHtml(row.nombre_archivo || 'Documento sin nombre')}</span>
          <span class="lista-item-meta">${metaPartes.join(' · ')}</span>
        </span>
        <span class="kw-acciones">
          ${botonAbrirOriginal}
          <span class="lista-item-menu-ancla">
            <button type="button" class="lista-item-menu-trigger" title="Opciones" aria-label="Opciones" aria-expanded="false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
            </button>
            <div class="kw-menu lista-item-menu" role="menu" hidden>
              ${menuAbrir}
              <button type="button" class="kw-menu-op lista-menu-copiar" data-doc-id="${escapeHtml(row.id)}" role="menuitem">Hacer una copia</button>
              ${menuEliminar}
            </div>
          </span>
        </span>
        </div>
      </div>
      ${revisionesHtml}
    </div>`;
    }).join('') + '</div>';

  Array.from(cont.querySelectorAll('.lista-item-original')).forEach((el) => {
    const grupo = grupos.find((item) => item.original.id === el.dataset.docId);
    el.addEventListener('click', (e) => {
      if (e.target.closest('.lista-item-menu-ancla') || e.target.closest('.lista-revision-toggle') || e.target.closest('.lista-abrir-original')) return;
      if (grupo && grupo.revisiones.length) {
        alternarRevisionesLista(el.closest('.lista-grupo'));
      } else {
        location.assign(location.pathname + '?doc=' + encodeURIComponent(el.dataset.docId));
      }
    });
  });
  Array.from(cont.querySelectorAll('.lista-abrir-original')).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      location.assign(location.pathname + '?doc=' + encodeURIComponent(btn.dataset.docId));
    });
  });
  Array.from(cont.querySelectorAll('.lista-revision-toggle')).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      alternarRevisionesLista(btn.closest('.lista-grupo'));
    });
  });
  Array.from(cont.querySelectorAll('.lista-revision-item')).forEach((el) => {
    const abrir = () => location.assign(location.pathname + '?doc=' + encodeURIComponent(el.dataset.docId));
    el.addEventListener('click', abrir);
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      abrir();
    });
  });
  Array.from(cont.querySelectorAll('.lista-item-menu-trigger')).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = btn._kwListaMenu || btn.parentElement.querySelector('.lista-item-menu');
      btn._kwListaMenu = menu;
      const abrir = menu.hidden;
      cerrarMenusLista();
      if (abrir) {
        if (window.kwUI && window.kwUI.abrirMenuLista) window.kwUI.abrirMenuLista(btn, menu);
        else menu.hidden = false;
      } else {
        menu.hidden = true;
      }
      btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    });
  });
  Array.from(cont.querySelectorAll('.lista-menu-abrir')).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); cerrarMenusLista();
      location.assign(location.pathname + '?doc=' + encodeURIComponent(btn.dataset.docId));
    });
  });
  Array.from(cont.querySelectorAll('.lista-menu-copiar')).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); cerrarMenusLista();
      abrirModalCopia(btn.dataset.docId);
    });
  });
  Array.from(cont.querySelectorAll('.lista-menu-eliminar')).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); cerrarMenusLista();
      abrirModalEliminarDoc(btn.dataset.docId);
    });
  });
}

function alternarRevisionesLista(grupoEl) {
  if (!grupoEl) return;
  const panel = grupoEl.querySelector('.lista-revisiones');
  const boton = grupoEl.querySelector('.lista-revision-toggle');
  if (!panel || !boton) return;
  const abrir = panel.classList.contains('cerrada');
  panel.classList.toggle('cerrada', !abrir);
  panel.setAttribute('aria-hidden', abrir ? 'false' : 'true');
  grupoEl.classList.toggle('expandida', abrir);
  boton.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  boton.setAttribute('title', abrir ? 'Ocultar revisiones' : 'Mostrar revisiones');
}

