(function () {
  'use strict';
  var panel = document.getElementById('prop-mapa-panel');
  if (!panel) return;
  var lista = document.getElementById('lista');
  var btnMapa = document.getElementById('prop-vista-mapa');
  var btnLista = document.getElementById('prop-vista-lista');
  var btnZona = document.getElementById('prop-mapa-zona');
  var btnQuitar = document.getElementById('prop-zona-quitar');
  var btnReintentar = document.getElementById('prop-mapa-reintentar');
  var estado = document.getElementById('prop-mapa-estado');
  var cargador = document.getElementById('prop-mapa-cargando');
  var mapa, grupos, bibliotecas, zona = null, filtros = null, clave = '', revision = 0, controlador;
  var fichaControlador, fichaRevision = 0;
  var fichas = new Map();
  var btnFiltros = document.getElementById('prop-filtros-expandir');
  function expandirFiltros(abierto) {
    document.getElementById('filtros').classList.toggle('prop-filtros-abiertos', abierto);
    btnFiltros.setAttribute('aria-expanded', String(abierto));
    btnFiltros.textContent = abierto ? 'Ocultar filtros' : 'Mostrar filtros';
  }
  btnFiltros.onclick = function () { expandirFiltros(btnFiltros.getAttribute('aria-expanded') !== 'true'); };

  function recurso(url, css) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement(css ? 'link' : 'script');
      if (css) { el.rel = 'stylesheet'; el.href = url; } else el.src = url;
      var timer = setTimeout(function () { el.remove(); reject(new Error('Tiempo de carga del mapa agotado')); }, 15000);
      el.onload = function () { clearTimeout(timer); resolve(); };
      el.onerror = function () { clearTimeout(timer); el.remove(); reject(new Error('No se pudo cargar el mapa')); };
      document.head.appendChild(el);
    });
  }
  function cargarBibliotecas() {
    if (!bibliotecas) {
      bibliotecas = Promise.all([
        recurso('/assets/vendor/mapa/leaflet.css?v=1.9.4', true),
        recurso('/assets/vendor/mapa/MarkerCluster.css?v=1.5.3', true),
        (async function () {
          if (!window.L) await recurso('/assets/vendor/mapa/leaflet.js?v=1.9.4');
          if (!window.L.markerClusterGroup) await recurso('/assets/vendor/mapa/leaflet.markercluster.js?v=1.5.3');
        })()
      ]).catch(function (error) { bibliotecas = null; throw error; });
    }
    return bibliotecas;
  }
  function iniciarMapa() {
    if (mapa) return;
    // La rueda sigue desplazando la pagina. El zoom se controla con botones,
    // teclado o gesto de dos dedos en el mapa.
    mapa = L.map('prop-mapa', {scrollWheelZoom: false, maxZoom: 19, minZoom: 2, worldCopyJump: true});
    mapa.setView([23.6, -102.5], 5);
    var marco = document.getElementById('prop-mapa');
    var url = marco.dataset.tiles || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    var capa = L.tileLayer(url, {
      maxZoom: 19, updateWhenIdle: true, keepBuffer: 1,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(mapa);
    capa.on('tileerror', function () { marco.setAttribute('aria-description', 'El fondo del mapa no esta disponible temporalmente. Los pines siguen activos.'); });
    mapa.on('moveend', function () { btnZona.disabled = false; });
    mapa.on('popupclose', function () { ++fichaRevision; if (fichaControlador) fichaControlador.abort(); });
    if (window.ResizeObserver) new ResizeObserver(function () { if (!panel.hidden) mapa.invalidateSize({pan: false}); }).observe(marco);
  }
  function texto(etiqueta, contenido, clase) {
    var el = document.createElement(etiqueta);
    el.textContent = contenido;
    if (clase) el.className = clase;
    return el;
  }
  function urlSegura(valor) {
    return valor ? window.kwSecurity.safeUrl(valor, false) : '';
  }
  function pintarFicha(p) {
    var caja = document.createElement('div'); caja.className = 'prop-mapa-ficha';
    var foto = urlSegura(p.miniatura_url || (p.imagenes || [])[0] || '');
    if (foto) {
      var img = document.createElement('img'); img.src = foto; img.alt = ''; img.decoding = 'async';
      img.addEventListener('error', function () { img.remove(); }, {once: true}); caja.appendChild(img);
    }
    caja.appendChild(texto('h3', p.titulo || 'Propiedad'));
    caja.appendChild(texto('p', window.fmtPrecio(p.precio, p.moneda, p.operacion), 'prop-mapa-precio'));
    caja.appendChild(texto('p', [p.colonia, p.municipio, p.estado].filter(Boolean).join(', ')));
    var datos = [];
    if (p.recamaras) datos.push(p.recamaras + ' rec.');
    if (p.banos) datos.push(p.banos + ' baños');
    if (p.m2_construccion) datos.push(p.m2_construccion + ' m²');
    if (datos.length) caja.appendChild(texto('p', datos.join(' · ')));
    var enlace = p.enlace_kw || (p.fuente_id ? 'https://www.kwmexico.mx/propiedades/' + encodeURIComponent(p.fuente_id) : location.origin + '/propiedad.html?id=' + encodeURIComponent(p.id));
    enlace = window.kwSitioAsesor.personalizar(enlace, window.sitioAsesor);
    enlace = urlSegura(enlace);
    if (enlace) {
      var a = texto('a', 'Ver propiedad'); a.href = enlace; a.target = '_blank'; a.rel = 'noopener noreferrer'; caja.appendChild(a);
    }
    return caja;
  }
  async function abrirFicha(marker, id) {
    if (fichaControlador) fichaControlador.abort();
    var popup = marker.getPopup();
    var r = ++fichaRevision;
    var inicial = document.createElement('div'); inicial.className = 'kw-loader'; inicial.setAttribute('aria-label', 'Cargando propiedad');
    inicial.innerHTML = '<div class="circle uno"></div><div class="circle dos"></div><div class="circle tres"></div>';
    popup.setContent(inicial);
    fichaControlador = new AbortController();
    var timer = setTimeout(function () { if (r === fichaRevision) fichaControlador.abort(); }, 12000);
    try {
      var p = fichas.get(id) || (window.propiedadesPaginaActual || {})[id];
      if (!p) {
        var respuesta = await window.kwSupabase.from('propiedades_inventario')
          .select('id,fuente_id,titulo,precio,moneda,operacion,colonia,municipio,estado,recamaras,banos,m2_construccion,miniatura_url,imagenes,enlace_kw')
          .eq('id', id).abortSignal(fichaControlador.signal).maybeSingle();
        if (respuesta.error || !respuesta.data) throw new Error('No se pudo consultar la propiedad');
        p = respuesta.data;
      }
      if (r !== fichaRevision || !popup.isOpen()) return;
      if (fichas.size >= 50) fichas.delete(fichas.keys().next().value);
      fichas.set(id, p);
      popup.setContent(pintarFicha(p));
    } catch (error) {
      if (r !== fichaRevision || !popup.isOpen()) return;
      var aviso = texto('div', '', 'prop-mapa-ficha');
      aviso.appendChild(texto('p', 'No pudimos cargar esta propiedad.'));
      var btn = texto('button', 'Reintentar'); btn.type = 'button'; btn.onclick = function () { abrirFicha(marker, id); };
      aviso.appendChild(btn); popup.setContent(aviso);
    } finally { clearTimeout(timer); }
  }
  function cargando(valor) {
    cargador.hidden = !valor;
    panel.setAttribute('aria-busy', String(valor));
  }
  function claveFiltros(valor) {
    var copia = Object.assign({}, valor); delete copia.orden;
    return JSON.stringify(copia);
  }
  async function actualizar(forzar) {
    if (panel.hidden) return;
    filtros = window.filtrosServidorActuales();
    var nuevaClave = claveFiltros(filtros);
    if (!forzar && clave === nuevaClave) { if (mapa) mapa.invalidateSize({pan: false}); return; }
    var r = ++revision;
    if (controlador) controlador.abort();
    if (grupos && mapa) { mapa.removeLayer(grupos); grupos = null; }
    cargando(true); btnReintentar.hidden = true; btnZona.disabled = true;
    estado.textContent = '';
    controlador = new AbortController();
    var timer = setTimeout(function () { if (r === revision) controlador.abort(); }, 15000);
    try {
      var consulta = window.kwSupabase.rpc('propiedades_inventario_mapa', {p_filtros: filtros}).abortSignal(controlador.signal);
      var resultados = await Promise.all([cargarBibliotecas(), consulta]);
      if (r !== revision || panel.hidden) return;
      var respuesta = resultados[1];
      if (respuesta.error) throw respuesta.error;
      var datos = respuesta.data;
      if (!datos || !Array.isArray(datos.puntos)) throw new Error('Respuesta de mapa incompleta');
      iniciarMapa(); mapa.invalidateSize({pan: false});
      var puntos = datos.puntos.filter(function (p) { return Array.isArray(p) && typeof p[0] === 'string' && Number.isFinite(p[1]) && Number.isFinite(p[2]) && Math.abs(p[1]) <= 85.05112878 && Math.abs(p[2]) <= 180; });
      var limites = puntos.map(function (p) { return [p[1], p[2]]; });
      if (limites.length) mapa.fitBounds(limites, {padding: [35,35], maxZoom: 15, animate: false});
      var capa = L.markerClusterGroup({
        maxClusterRadius: 48, showCoverageOnHover: false, animate: false, removeOutsideVisibleBounds: true,
        iconCreateFunction: function (grupo) { return L.divIcon({html: String(grupo.getChildCount()), className: 'prop-mapa-grupo', iconSize: [42,42]}); }
      });
      grupos = capa; mapa.addLayer(capa);
      var icono = L.divIcon({className: '', html: '<div class="prop-mapa-pin"></div>', iconSize: [24,28], iconAnchor: [12,28], popupAnchor: [0,-26]});
      // Repartir el trabajo entre cuadros para mantener la interfaz utilizable.
      for (var i = 0; i < puntos.length; i += 150) {
        if (r !== revision || panel.hidden) return;
        capa.addLayers(puntos.slice(i, i + 150).map(function (p) {
          var marker = L.marker([p[1], p[2]], {icon: icono, title: 'Ver propiedad', keyboard: true});
          marker.bindPopup('', {maxWidth: 260, minWidth: 220});
          marker.on('popupopen', function () { abrirFicha(marker, p[0]); });
          return marker;
        }));
        await new Promise(function (resolve) { requestAnimationFrame(resolve); });
      }
      if (r !== revision || panel.hidden) return;
      clave = nuevaClave;
      var sinUbicacion = Math.max(0, Number(datos.total) - Number(datos.ubicadas));
      estado.textContent = puntos.length.toLocaleString('es-MX') + ' propiedades en el mapa' + (sinUbicacion ? ' · ' + sinUbicacion + ' sin coordenadas, disponibles en Lista' : '');
      if (Number(datos.ubicadas) > puntos.length) estado.textContent += ' · Hay más resultados: filtra o busca en una zona para verlos.';
      if (!puntos.length) estado.textContent = 'No hay propiedades con coordenadas para estos filtros. Puedes revisar la Lista o quitar la zona.';
      btnZona.disabled = false;
    } catch (error) {
      if (r !== revision || panel.hidden) return;
      clave = ''; estado.textContent = 'No pudimos cargar el mapa. Puedes reintentar o seguir consultando la Lista.';
      btnReintentar.hidden = false;
    } finally { clearTimeout(timer); if (r === revision) cargando(false); }
  }
  function elegirVista(verMapa) {
    panel.hidden = !verMapa; lista.hidden = verMapa;
    btnMapa.setAttribute('aria-pressed', String(verMapa)); btnLista.setAttribute('aria-pressed', String(!verMapa));
    if (verMapa) actualizar();
    else { ++revision; if (controlador) controlador.abort(); cargando(false); }
  }
  function quitarZona(aplicar) {
    zona = null; btnQuitar.hidden = true;
    if (aplicar !== false) window.aplicarFiltros();
  }
  btnLista.onclick = function () { elegirVista(false); };
  btnMapa.onclick = function () { elegirVista(true); };
  btnReintentar.onclick = function () { actualizar(true); };
  btnQuitar.onclick = function () { quitarZona(); };
  btnZona.onclick = function () {
    if (!mapa) return;
    var b = mapa.getBounds();
    // Normalizar el desplazamiento horizontal del mapa al dominio geografico.
    var oeste = Math.max(-180, b.getWest()), este = Math.min(180, b.getEast());
    if (oeste >= este) { mapa.setView([23.6,-102.5],5); return; }
    zona = [Math.max(-85.05112878,b.getSouth()), oeste, Math.min(85.05112878,b.getNorth()), este];
    btnQuitar.hidden = false; window.aplicarFiltros();
  };
  window.addEventListener('kw-propiedades-filtradas', function () {
    if (window.matchMedia('(max-width: 1023px)').matches) expandirFiltros(false);
    actualizar();
  });
  window.kwPropiedadesMapa = Object.freeze({zona: function () { return zona ? zona.slice() : null; }, quitarZona: quitarZona});
})();
