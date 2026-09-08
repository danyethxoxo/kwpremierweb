(function (global) {
  'use strict';

  var adaptador = null;
  var raiz = null;
  var panel = null;
  var btnDocumento = null;
  var btnHistorial = null;
  var btnFirma = null;
  var btnDictamen = null;
  var viendoHistorica = false;

  function esc(valor) {
    var d = document.createElement('div');
    d.textContent = valor == null ? '' : String(valor);
    return d.innerHTML;
  }

  function nombreRevision(numero) {
    numero = Number(numero) || 0;
    return numero === 0 ? 'Original' : 'Revisión ' + numero;
  }

  function folio(folioValor, revision) {
    if (!folioValor) return '';
    return 'Folio: ' + folioValor + ' · ' + nombreRevision(revision);
  }

  function fecha(valor) {
    if (!valor) return 'Sin fecha';
    var d = new Date(valor);
    if (isNaN(d.getTime())) return 'Sin fecha';
    return d.toLocaleDateString('es-MX', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function ponerCargando(texto) {
    panel.innerHTML = '<div class="kw-revision-vacio"><span class="kw-revision-spinner"></span>' +
      esc(texto || 'Cargando revisiones…') + '</div>';
  }

  function activar(nombre) {
    var historial = nombre === 'historial';
    raiz.classList.toggle('kw-revision-modo-historial', historial);
    panel.hidden = !historial;
    btnDocumento.classList.toggle('activo', !historial);
    btnHistorial.classList.toggle('activo', historial);
    btnDocumento.setAttribute('aria-selected', historial ? 'false' : 'true');
    btnHistorial.setAttribute('aria-selected', historial ? 'true' : 'false');
  }

  async function cargarHistorial() {
    if (!adaptador || !adaptador.id()) return;
    activar('historial');
    ponerCargando();

    try {
      var respuesta = await global.kwSupabase.rpc('listar_revisiones_documento', {
        p_id: adaptador.id()
      });
      if (respuesta.error) throw respuesta.error;
      var versiones = Array.isArray(respuesta.data) ? respuesta.data : [];
      if (!versiones.length) {
        panel.innerHTML = '<div class="kw-revision-vacio">Todavía no hay versiones para mostrar.</div>';
        return;
      }

      panel.innerHTML = '<div class="kw-revision-encabezado">' +
        '<strong>Historial del documento</strong>' +
        '<span>' + versiones.length + (versiones.length === 1 ? ' versión' : ' versiones') + '</span>' +
        '</div><div class="kw-revision-lista">' +
        versiones.map(function (v) {
          var actual = v.es_actual === true;
          var estado = v.estado === 'finalizado' ? 'Finalizada' : 'En edición';
          return '<article class="kw-revision-item' + (actual ? ' actual' : '') +
            '" data-revision="' + Number(v.revision || 0) + '" role="button" tabindex="0">' +
            '<div class="kw-revision-linea"><strong>' + esc(nombreRevision(v.revision)) + '</strong>' +
            (actual ? '<span class="kw-revision-actual">Última versión</span>' : '') + '</div>' +
            '<div class="kw-revision-meta">' + esc(fecha(v.finalizado_at || v.updated_at)) +
            ' · ' + esc(estado) + '</div>' +
          '</article>';
        }).join('') + '</div>';

      panel.querySelectorAll('.kw-revision-item[data-revision]').forEach(function (tarjeta) {
        function abrir() {
          var numero = Number(tarjeta.dataset.revision);
          var version = versiones.find(function (v) { return Number(v.revision) === numero; });
          if (version) abrirVersion(version);
        }
        tarjeta.addEventListener('click', abrir);
        tarjeta.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          abrir();
        });
      });
    } catch (err) {
      panel.innerHTML = '<div class="kw-revision-vacio error">' +
        esc(err.message || 'No se pudo cargar el historial.') + '</div>';
    }
  }

  function abrirVersion(version) {
    viendoHistorica = version.es_actual !== true;
    activar('documento');
    adaptador.abrir({
      id: adaptador.id(),
      nombre_archivo: version.nombre_archivo,
      updated_at: version.updated_at,
      datos: version.datos || {},
      folio: version.folio,
      estado: version.estado || 'finalizado',
      revision: Number(version.revision) || 0
    });
    setTimeout(refrescar, 0);
  }

  async function abrirActual() {
    activar('documento');
    if (!viendoHistorica || !adaptador || !adaptador.id()) return;
    try {
      var respuesta = await global.kwSupabase
        .from('documentos_guardados')
        .select('id, nombre_archivo, updated_at, datos, folio, estado, revision')
        .eq('id', adaptador.id())
        .single();
      if (respuesta.error) throw respuesta.error;
      viendoHistorica = false;
      adaptador.abrir(respuesta.data);
      setTimeout(refrescar, 0);
    } catch (err) {
      if (global.kwUI && global.kwUI.alert) {
        global.kwUI.alert(err.message || 'No se pudo recuperar la última revisión.');
      }
    }
  }

  async function realizarCambios() {
    if (!adaptador || !adaptador.id() || adaptador.estado() !== 'finalizado' || viendoHistorica) return;
    var boton = document.getElementById('btn-copia');
    if (boton) boton.disabled = true;
    try {
      var respuesta = await global.kwSupabase.rpc('crear_revision_documento', {
        p_id: adaptador.id()
      });
      if (respuesta.error) throw respuesta.error;
      viendoHistorica = false;
      adaptador.revisionCreada(Number(respuesta.data) || 1);
      refrescar();
    } catch (err) {
      if (global.kwUI && global.kwUI.alert) {
        await global.kwUI.alert(err.message || 'No se pudo iniciar la revisión.');
      }
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  function prepararBotonCambios() {
    var boton = document.getElementById('btn-copia');
    if (!boton || boton.dataset.kwRevision) return;
    boton.dataset.kwRevision = '1';
    boton.removeAttribute('onclick');
    boton.classList.add('kw-btn-revision');
    boton.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' +
      'Realizar cambios';
    boton.addEventListener('click', realizarCambios);
  }

  function refrescar() {
    if (!adaptador || !raiz) return;
    prepararBotonCambios();
    prepararAccionesExternas();
    var terminado = adaptador.estado() === 'finalizado';
    btnHistorial.hidden = !adaptador.id() || !terminado;
    if (!terminado && raiz.classList.contains('kw-revision-modo-historial')) activar('documento');

    if (btnFirma) btnFirma.style.display = terminado && !viendoHistorica ? 'inline-flex' : 'none';
    if (btnDictamen) btnDictamen.style.display = terminado && !viendoHistorica ? 'inline-flex' : 'none';

    var boton = document.getElementById('btn-copia');
    if (boton) {
      boton.style.display = terminado && !viendoHistorica ? 'flex' : 'none';
    }

    var insignia = raiz.querySelector('.kw-revision-insignia');
    if (insignia) {
      insignia.textContent = adaptador.folio() ?
        adaptador.folio() + ' · ' + nombreRevision(adaptador.revision()) : '';
      insignia.hidden = !adaptador.folio();
    }
  }

  function iconoFirma() {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M16 3h5v5"/><path d="M21 3l-7 7"/><path d="M13 5H6a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-7"/>' +
      '<path d="M7 16c2-3 3 2 5-1 1.2-1.8 2.2.5 4-1"/></svg>';
  }

  function iconoEnlace() {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/>' +
      '<path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/></svg>';
  }

  function prepararAccionesExternas() {
    var fila = raiz && raiz.querySelector('.desktop-btn-row');
    var cambios = document.getElementById('btn-copia');
    if (!fila || !cambios) return;

    if (!document.getElementById('btn-firma-digital')) {
      btnFirma = document.createElement('button');
      btnFirma.type = 'button';
      btnFirma.id = 'btn-firma-digital';
      btnFirma.className = 'btn-download kw-btn-firma';
      btnFirma.innerHTML = iconoFirma() + '<span>Firma digital</span>';
      btnFirma.addEventListener('click', function () {
        if (!global.downloadPDF || btnFirma.disabled) return;
        btnFirma.disabled = true;
        btnFirma.classList.add('cargando');
        btnFirma.querySelector('span').textContent = 'Preparando…';
        try {
          global.downloadPDF({ destino: 'firma' });
        } catch (err) {
          btnFirma.disabled = false;
          btnFirma.classList.remove('cargando');
          btnFirma.querySelector('span').textContent = 'Firma digital';
          if (global.kwUI && global.kwUI.alert) global.kwUI.alert(err.message || 'No se pudo preparar el documento.');
        }
        setTimeout(function () {
          if (!document.body.contains(btnFirma)) return;
          btnFirma.disabled = false;
          btnFirma.classList.remove('cargando');
          btnFirma.querySelector('span').textContent = 'Firma digital';
        }, 8000);
      });
      fila.insertBefore(btnFirma, cambios);
    } else {
      btnFirma = document.getElementById('btn-firma-digital');
    }

    if (!document.getElementById('btn-enlazar-dictamen')) {
      btnDictamen = document.createElement('button');
      btnDictamen.type = 'button';
      btnDictamen.id = 'btn-enlazar-dictamen';
      btnDictamen.className = 'btn-download kw-btn-dictamen';
      btnDictamen.innerHTML = iconoEnlace() + '<span>Enlazar dictamen</span>';
      btnDictamen.addEventListener('click', abrirSelectorDictamen);
      fila.insertBefore(btnDictamen, cambios);
    } else {
      btnDictamen = document.getElementById('btn-enlazar-dictamen');
    }
  }

  function asegurarModalDictamen() {
    var modal = document.getElementById('kw-modal-dictamen');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'kw-modal-dictamen';
    modal.className = 'kw-enlace-modal';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="kw-enlace-dialogo" role="dialog" aria-modal="true" aria-labelledby="kw-enlace-titulo">' +
        '<div class="kw-enlace-cabecera"><div><h3 id="kw-enlace-titulo">Enlazar con un dictamen</h3>' +
        '<p>El expediente mostrará la información actual de este documento.</p></div>' +
        '<button type="button" class="kw-enlace-cerrar" aria-label="Cerrar">×</button></div>' +
        '<div class="kw-enlace-busqueda"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
        '<input type="search" placeholder="Buscar por folio, inmueble, cliente o asesor"></div>' +
        '<div class="kw-enlace-lista"></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.querySelector('.kw-enlace-cerrar').addEventListener('click', function () { modal.hidden = true; });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });
    return modal;
  }

  function pintarDictamenes(modal, filas, filtro) {
    var q = String(filtro || '').trim().toLowerCase();
    var visibles = filas.filter(function (d) {
      return !q || [d.folio, d.inmueble, d.cliente, d.asesor_nombre].join(' ').toLowerCase().indexOf(q) !== -1;
    });
    var lista = modal.querySelector('.kw-enlace-lista');
    if (!visibles.length) {
      lista.innerHTML = '<div class="kw-enlace-vacio">No hay dictámenes que coincidan.</div>';
      return;
    }
    lista.innerHTML = visibles.map(function (d) {
      return '<button type="button" class="kw-enlace-item' + (d.enlazado ? ' actual' : '') + '" data-id="' + esc(d.id) + '">' +
        '<span class="kw-enlace-item-titulo">' + esc(d.inmueble || 'Expediente sin dirección') + '</span>' +
        '<span class="kw-enlace-item-meta">' + esc(d.folio || 'Borrador sin folio') + ' · ' +
          esc(d.cliente || 'Sin cliente') + ' · ' + esc(d.asesor_nombre || 'Sin asesor') + '</span>' +
        (d.enlazado ? '<span class="kw-enlace-actual">Enlazado actualmente</span>' : '') +
      '</button>';
    }).join('');
    lista.querySelectorAll('[data-id]').forEach(function (item) {
      item.addEventListener('click', async function () {
        lista.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
        try {
          var r = await global.kwSupabase.rpc('enlazar_documento_dictamen', {
            p_documento_id: adaptador.id(),
            p_dictamen_id: item.dataset.id
          });
          if (r.error) throw r.error;
          modal.hidden = true;
          btnDictamen.classList.add('enlazado');
          btnDictamen.querySelector('span').textContent = 'Dictamen enlazado';
          if (global.kwUI && global.kwUI.alert) {
            await global.kwUI.alert('El documento quedó enlazado. Su información ya aparece dentro del expediente.');
          }
        } catch (err) {
          lista.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
          if (global.kwUI && global.kwUI.alert) {
            await global.kwUI.alert(err.message || 'No se pudo enlazar el dictamen.');
          }
        }
      });
    });
  }

  async function abrirSelectorDictamen() {
    if (!adaptador || !adaptador.id() || adaptador.estado() !== 'finalizado') return;
    var modal = asegurarModalDictamen();
    var lista = modal.querySelector('.kw-enlace-lista');
    var input = modal.querySelector('input');
    modal.hidden = false;
    input.value = '';
    lista.innerHTML = '<div class="kw-enlace-vacio"><span class="kw-revision-spinner"></span>Cargando dictámenes…</div>';
    try {
      var r = await global.kwSupabase.rpc('listar_dictamenes_para_enlazar', {
        p_documento_id: adaptador.id()
      });
      if (r.error) throw r.error;
      var filas = Array.isArray(r.data) ? r.data : [];
      pintarDictamenes(modal, filas, '');
      input.oninput = function () { pintarDictamenes(modal, filas, input.value); };
      input.focus();
      if (btnDictamen) {
        var ligado = filas.some(function (d) { return d.enlazado === true; });
        btnDictamen.classList.toggle('enlazado', ligado);
        btnDictamen.querySelector('span').textContent = ligado ? 'Dictamen enlazado' : 'Enlazar dictamen';
      }
    } catch (err) {
      lista.innerHTML = '<div class="kw-enlace-vacio error">' + esc(err.message || 'No se pudieron cargar los dictámenes.') + '</div>';
    }
  }

  function prepararFormularioFijo() {
    if (!raiz || raiz.dataset.kwFormularioFijo) return;
    var acciones = raiz.querySelector('.desktop-btn-row');
    if (!acciones) return;
    raiz.dataset.kwFormularioFijo = '1';
    raiz.classList.add('kw-form-fija');

    var mensaje = raiz.querySelector('#guardar-msg');
    var desplazable = document.createElement('div');
    desplazable.className = 'kw-form-scroll';

    Array.prototype.slice.call(raiz.children).forEach(function (hijo) {
      if (hijo.classList.contains('kw-revision-tabs') ||
          hijo.classList.contains('kw-revision-panel') ||
          hijo === acciones || hijo === mensaje) return;
      desplazable.appendChild(hijo);
    });

    var pie = document.createElement('div');
    pie.className = 'kw-form-acciones';
    pie.appendChild(acciones);
    if (mensaje) pie.appendChild(mensaje);

    raiz.insertBefore(desplazable, panel ? panel.nextSibling : raiz.firstChild);
    raiz.appendChild(pie);
  }

  function iniciar(nuevoAdaptador) {
    adaptador = nuevoAdaptador;
    raiz = document.getElementById('acuerdos-form-col');
    if (!raiz || raiz.dataset.kwRevisiones) return;
    raiz.dataset.kwRevisiones = '1';

    var tabs = document.createElement('div');
    tabs.className = 'kw-revision-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.innerHTML =
      '<button type="button" class="kw-revision-tab activo" data-kw-revision-documento role="tab">Documento</button>' +
      '<button type="button" class="kw-revision-tab" data-kw-revision-historial role="tab">Revisiones</button>' +
      '<span class="kw-revision-insignia" hidden></span>';
    raiz.insertBefore(tabs, raiz.firstChild);

    panel = document.createElement('section');
    panel.className = 'kw-revision-panel';
    panel.hidden = true;
    raiz.insertBefore(panel, tabs.nextSibling);

    btnDocumento = tabs.querySelector('[data-kw-revision-documento]');
    btnHistorial = tabs.querySelector('[data-kw-revision-historial]');
    btnDocumento.addEventListener('click', abrirActual);
    btnHistorial.addEventListener('click', cargarHistorial);

    prepararFormularioFijo();
    prepararBotonCambios();
    refrescar();
  }

  global.kwRevisiones = {
    iniciar: iniciar,
    refrescar: refrescar,
    realizarCambios: realizarCambios,
    nombre: nombreRevision,
    folio: folio
  };
})(window);
