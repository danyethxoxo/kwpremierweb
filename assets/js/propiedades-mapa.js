(function () {
  'use strict';
  var panel = document.getElementById('prop-mapa-panel');
  if (!panel) return;
  var btnZona = document.getElementById('prop-mapa-zona');
  var btnQuitar = document.getElementById('prop-zona-quitar');
  var btnReintentar = document.getElementById('prop-mapa-reintentar');
  var btnUbicacion = document.getElementById('prop-mapa-mi-ubicacion');
  var errorUbicacion = document.getElementById('prop-mapa-ubicacion-error');
  var ubicacionPersonal, localizando = false;
  var inicioPreparado = false, inicioCancelado = false, inicioPromesa;
  var estado = document.getElementById('prop-mapa-estado');
  var mapa, grupos, bibliotecas, zona = null, filtros = null, clave = '', revision = 0, controlador;
  var fichaControlador, fichaRevision = 0;
  var fichas = new Map();
  var pines = new Map(), propiedadPendiente = null;
  var dibujo, contorno, clavePendiente = '';
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
        recurso('/assets/js/propiedades-entorno.js?v=20261020metro1'),
        (async function () {
          if (!window.L) await recurso('/assets/vendor/mapa/leaflet.js?v=1.9.4');
        })()
      ]).catch(function (error) { bibliotecas = null; throw error; });
    }
    return bibliotecas;
  }
  function iniciarMapa() {
    if (mapa) return;
    mapa = L.map('prop-mapa', {scrollWheelZoom: true, maxZoom: 19, minZoom: 2, zoomSnap:.25, worldCopyJump: true});
    mapa.setView([22.8, -102.2], 5);
    dibujo = window.kwCrearDibujoMapa(mapa, function (puntos) {
      var lat = puntos.map(function (p) { return p[1]; }), lng = puntos.map(function (p) { return p[0]; });
      zona = [Math.min.apply(null,lat),Math.min.apply(null,lng),Math.max.apply(null,lat),Math.max.apply(null,lng)];
      btnQuitar.hidden = false; window.aplicarZonaMapa();
    });
    var marco = document.getElementById('prop-mapa');
    window.kwFondoEntorno(mapa, marco);
    var gps = L.control({position:'topleft'});
    gps.onAdd = function () {
      var caja = L.DomUtil.create('div','leaflet-bar prop-mapa-gps');
      caja.appendChild(btnUbicacion);
      btnUbicacion.hidden = false;
      L.DomEvent.disableClickPropagation(caja);
      L.DomEvent.disableScrollPropagation(caja);
      return caja;
    };
    gps.addTo(mapa);
    btnUbicacion.disabled = false;
    mapa.on('moveend', function () { btnZona.disabled = false; });
    mapa.on('dragstart', function () { inicioCancelado = true; });
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
    caja.dataset.propiedadId = p.id; caja.propiedadMapa = p;
    var encabezado = document.createElement('div'); encabezado.className = 'prop-mapa-ficha-cabecera';
    encabezado.appendChild(texto('span', window.etiquetaOperacion(p), 'prop-mapa-operacion'));
    var acciones = document.createElement('div'); acciones.className = 'prop-acciones';
    var toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'prop-acciones-toggle';
    toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-haspopup','menu');toggle.setAttribute('aria-label','Más opciones de esta propiedad');
    var menuId = 'prop-mapa-menu-' + String(p.id);toggle.setAttribute('aria-controls',menuId);
    toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>';
    toggle.onclick = function (e) { window.alternarAccionesPropiedad(e,toggle); };
    var menu = document.createElement('div');menu.className='prop-acciones-menu';menu.id=menuId;menu.setAttribute('role','menu');menu.hidden=true;
    [['Copiar link','copiarLinkPropiedad'],['Compartir propiedad','compartirPropiedad'],['Descargar ficha técnica','abrirFichaPropiedad']].forEach(function (opcion) {
      var btn = texto('button',opcion[0],'prop-accion');btn.type='button';btn.setAttribute('role','menuitem');
      btn.onclick=function(e){window[opcion[1]](e,btn);};menu.appendChild(btn);
    });
    acciones.append(toggle,menu);encabezado.appendChild(acciones);caja.appendChild(encabezado);
    var foto = urlSegura(p.miniatura_url || (p.imagenes || [])[0] || '');
    if (foto) {
      var img = document.createElement('img'); img.src = foto; img.alt = ''; img.decoding = 'async';
      img.addEventListener('error', function () { img.remove(); }, {once: true}); caja.appendChild(img);
    }
    caja.appendChild(texto('h3', p.titulo || 'Propiedad', 'prop-mapa-titulo'));
    caja.appendChild(texto('p', window.fmtPrecio(p.precio, p.moneda, p.operacion), 'prop-mapa-precio'));
    caja.appendChild(texto('p', [p.colonia, p.municipio, p.estado].filter(Boolean).join(', ')));
    var datos = [];
    if (p.recamaras) datos.push(p.recamaras + ' rec.');
    if (p.banos) datos.push(p.banos + ' baños');
    if (p.m2_construccion) datos.push(p.m2_construccion + ' m²');
    if (datos.length) caja.appendChild(texto('p', datos.join(' · ')));
    var pie = document.createElement('div');pie.className='prop-mapa-ficha-pie';
    if(p.market_center)pie.appendChild(texto('span',window.nombreMarketCenter(p.market_center),'prop-mapa-market-center'));
    if(p.asesor_nombre){
      var asesor = texto('span',p.asesor_nombre,'prop-mapa-asesor');
      if(/^\d+$/.test(p.asesor_kw_id||'')){
        var slug=p.asesor_nombre.trim().toLocaleLowerCase('es-MX').replace(/\s+/g,'-');
        var link=texto('a',p.asesor_nombre);link.href='https://kw.com/es-419/agent/'+encodeURIComponent(slug)+'/'+p.asesor_kw_id;
        link.target='_blank';link.rel='noopener noreferrer';asesor.replaceChildren(link);
      }
      pie.appendChild(asesor);
    }
    caja.appendChild(pie);
    var enlace = p.enlace_kw || (p.fuente_id ? 'https://www.kwmexico.mx/propiedades/' + encodeURIComponent(p.fuente_id) : location.origin + '/propiedad.html?id=' + encodeURIComponent(p.id));
    enlace = window.kwSitioAsesor.personalizar(enlace, window.sitioAsesor);
    enlace = urlSegura(enlace);
    if (enlace) {
      var a = texto('a', 'Ver propiedad', 'prop-mapa-enlace'); a.href = enlace; a.target = '_blank'; a.rel = 'noopener noreferrer'; caja.appendChild(a);
    }
    return caja;
  }
  async function abrirFicha(marker, id) {
    if (fichaControlador) fichaControlador.abort();
    var popup = marker.getPopup();
    var r = ++fichaRevision;
    var inicial = document.createElement('div'); inicial.className = 'prop-mapa-ficha-vacia';
    popup.setContent(inicial);
    fichaControlador = new AbortController();
    var timer = setTimeout(function () { if (r === fichaRevision) fichaControlador.abort(); }, 12000);
    try {
      var p = fichas.get(id) || (window.propiedadesPaginaActual || {})[id];
      if (!p) {
        var respuesta = await window.kwSupabase.from('propiedades_inventario')
          .select('id,fuente,fuente_id,titulo,operacion,operaciones_filtro,estatus,tipo,precio,moneda,recamaras,banos,estacionamientos,m2_construccion,m2_terreno,calle,colonia,municipio,estado,cp,pais,imagenes,miniatura_url,caracteristicas,asesor_id,asesor_nombre,market_center,updated_at,enlace_kw,asesor_kw_id')
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
      var btn = texto('button', 'Reintentar', 'prop-mapa-reintento'); btn.type = 'button'; btn.onclick = function () { abrirFicha(marker, id); };
      aviso.appendChild(btn); popup.setContent(aviso);
    } finally { clearTimeout(timer); }
  }
  function cargando(valor) {
    if(valor)window.mostrarCargadorPropiedades('mapa');else window.ocultarCargadorPropiedades('mapa');
    panel.setAttribute('aria-busy', String(valor));
  }
  function claveFiltros(valor) {
    var copia = Object.assign({}, valor); delete copia.orden;
    return JSON.stringify(copia);
  }
  function precioPin(valor, moneda) {
    var precio = Number(valor);
    if (!Number.isFinite(precio) || precio <= 0) return 'Consultar';
    var escala = precio >= 1000000 ? 1000000 : precio >= 1000 ? 1000 : 1;
    var cantidad = precio / escala;
    var numero = cantidad.toLocaleString('es-MX', {maximumFractionDigits: escala === 1 || cantidad >= 100 ? 0 : 2});
    return (moneda && moneda !== 'MXN' ? moneda + ' ' : '$') + numero + (escala === 1000000 ? 'M' : escala === 1000 ? 'K' : '');
  }
  async function actualizar(forzar) {
    if (panel.hidden || !inicioPreparado) return;
    filtros = window.filtrosServidorActuales();
    if (!puedeConsultar(filtros)) {
      if (controlador) controlador.abort();
      ++revision; clave = ''; clavePendiente = '';
      if (grupos && mapa) mapa.removeLayer(grupos);
      grupos = null; pines.clear(); estado.textContent='';cargando(false);
      return;
    }
    var nuevaClave = claveFiltros(filtros);
    if (!forzar && clave === nuevaClave) { if (mapa) mapa.invalidateSize({pan: false}); return; }
    if (!forzar && clavePendiente === nuevaClave) return;
    clavePendiente = nuevaClave;
    var r = ++revision;
    if (controlador) controlador.abort();
    if (grupos && mapa) { mapa.removeLayer(grupos); grupos = null; }
    pines.clear();
    cargando(true); btnReintentar.hidden = true; btnZona.disabled = true;
    estado.textContent = '';
    controlador = new AbortController();
    var timer = setTimeout(function () { if (r === revision) controlador.abort(); }, 15000);
    try {
      var consulta = window.kwSupabase.rpc('propiedades_inventario_mapa', {p_filtros: filtros}).abortSignal(controlador.signal);
      var geografia = window.kwGeografiaMapa.resolver(filtros).catch(function () { return {features:[],nombres:[],error:true}; });
      var resultados = await Promise.all([cargarBibliotecas(), consulta, geografia]);
      if (r !== revision || panel.hidden) return;
      var respuesta = resultados[1];
      if (respuesta.error) throw respuesta.error;
      var datos = respuesta.data;
      if (!datos || !Array.isArray(datos.puntos)) throw new Error('Respuesta de mapa incompleta');
      var primeraVista = !mapa;
      iniciarMapa(); mapa.invalidateSize({pan: false});
      var puntos = datos.puntos.filter(function (p) { return Array.isArray(p) && typeof p[0] === 'string' && Number.isFinite(p[1]) && Number.isFinite(p[2]) && Math.abs(p[1]) <= 85.05112878 && Math.abs(p[2]) <= 180; });
      var limites = puntos.map(function (p) { return [p[1], p[2]]; });
      var lugar = resultados[2], etiqueta = document.getElementById('prop-mapa-lugar');
      if (contorno) { mapa.removeLayer(contorno); contorno = null; }
      if (lugar.features.length) {
        contorno = L.geoJSON({type:'FeatureCollection',features:lugar.features}, {style:{color:'#8a0000',weight:2,fillOpacity:.06},interactive:false}).addTo(mapa);
      }
      etiqueta.textContent = dibujo.poligono() ? 'Zona dibujada: los filtros se aplican dentro del contorno.' : lugar.nombres.length ? lugar.nombres.join(' · ') + ' · Contorno INEGI simplificado' : lugar.ambiguo ? 'Hay municipios con el mismo nombre. Elige el estado para mostrar su contorno.' : lugar.error ? 'El contorno no está disponible temporalmente; los resultados siguen activos.' : '';
      if (dibujo.poligono()) mapa.fitBounds(dibujo.poligono().map(function (p) { return [p[1],p[0]]; }), {padding:[20,20],maxZoom:16,animate:false});
      else if (zona) mapa.fitBounds([[zona[0],zona[1]],[zona[2],zona[3]]],{animate:false});
      else if (contorno) mapa.fitBounds(contorno.getBounds(), {padding:[20,20],maxZoom:15,animate:false});
      else if (limites.length && !primeraVista && (filtros.texto || filtros.colonia || filtros.municipio || filtros.estado)) mapa.fitBounds(limites, {padding: [35,35], maxZoom: 15, animate: false});
      var todos = !!(filtros.zona || filtros.poligono || filtros.texto || filtros.operacion || filtros.tipo || filtros.minimo || filtros.maximo || (inicioCancelado && (filtros.estado || filtros.colonia || filtros.municipio)) || filtros.marketCenter || filtros.asesor || filtros.recamaras || filtros.banos || filtros.estacionamientos || filtros.m2Min || filtros.m2Max);
      var capa = L.featureGroup(), candidatos = [], destacado;
      function mostrarPines() {
        if (!mapa.hasLayer(capa)) return;
        var celdas = new Set(), visibles = new Set(), limitesVista = mapa.getBounds().pad(.15);
        var espacio = mapa.getZoom() >= 15 ? 45 : 85;
        candidatos.forEach(function (pin) {
          if (!limitesVista.contains(pin.getLatLng())) return;
          var punto = mapa.project(pin.getLatLng(), mapa.getZoom());
          var celda = Math.floor(punto.x / espacio) + ':' + Math.floor(punto.y / espacio);
          if (todos || mapa.getZoom() >= 18 || pin === destacado || pin.isPopupOpen() || !celdas.has(celda)) {
            celdas.add(celda); visibles.add(pin);
          }
        });
        capa.eachLayer(function (pin) { if (!visibles.has(pin)) capa.removeLayer(pin); });
        visibles.forEach(function (pin) { if (!capa.hasLayer(pin)) capa.addLayer(pin); });
      }
      capa.addLayers = function (marcadores) { candidatos.push.apply(candidatos, marcadores); mostrarPines(); };
      capa.zoomToShowLayer = function (pin, listo) {
        destacado = pin;
        if (mapa.getZoom() < 16 || !mapa.getBounds().contains(pin.getLatLng())) mapa.setView(pin.getLatLng(), Math.max(16,mapa.getZoom()), {animate:false});
        mostrarPines(); listo();
      };
      mapa.on('moveend zoomend', mostrarPines);
      capa.on('remove', function () { mapa.off('moveend zoomend', mostrarPines); });
      grupos = capa; mapa.addLayer(capa);
      var iconos = {};
      // Repartir el trabajo entre cuadros para mantener la interfaz utilizable.
      for (var i = 0; i < puntos.length; i += 150) {
        if (r !== revision || panel.hidden) return;
        capa.addLayers(puntos.slice(i, i + 150).map(function (p) {
          var tipo = ['venta','renta','mixto'].indexOf(p[3]) !== -1 ? p[3] : 'sin-operacion';
          var titulo = tipo === 'renta' ? 'Ver propiedad en renta' : tipo === 'venta' ? 'Ver propiedad en venta' : tipo === 'mixto' ? 'Ver propiedad en venta y renta' : 'Ver propiedad: operación por confirmar';
          var moneda = /^[A-Z]{3}$/.test(p[5] || '') ? p[5] : 'MXN';
          var precio = precioPin(p[4], moneda);
          var iconoClave = tipo + ':' + precio;
          if (!iconos[iconoClave]) {
            var etiqueta = texto('span', precio, 'prop-mapa-pin prop-mapa-pin-' + tipo);
            var ancho = Math.max(66, precio.length * 7 + 22);
            iconos[iconoClave] = L.divIcon({className:'prop-mapa-precio-icono', html:etiqueta.outerHTML, iconSize:[ancho,32], iconAnchor:[ancho/2,36], popupAnchor:[0,-36]});
          }
          titulo += ': ' + (Number(p[4]) > 0 ? window.fmtPrecio(p[4], moneda, tipo) : 'Precio por confirmar');
          var marker = L.marker([p[1], p[2]], {icon: iconos[iconoClave], operacion: tipo, precio: Number(p[4]), moneda: moneda, title: titulo, keyboard: true, riseOnHover:true});
          marker.bindPopup('', {maxWidth: 260, minWidth: 220, autoPanPaddingTopLeft: [10,75], autoPanPaddingBottomRight: [10,10]});
          marker.on('popupopen', function () { abrirFicha(marker, p[0]); });
          pines.set(p[0], marker);
          return marker;
        }));
        await new Promise(function (resolve) { requestAnimationFrame(resolve); });
      }
      if (r !== revision || panel.hidden) return;
      clave = nuevaClave;
      var sinUbicacion = Math.max(0, Number(datos.total) - Number(datos.ubicadas));
      estado.textContent = puntos.length.toLocaleString('es-MX') + (puntos.length===1 ? ' propiedad en el mapa' : ' propiedades en el mapa') + (sinUbicacion ? ' · ' + sinUbicacion + ' sin coordenadas, disponibles en el listado' : '');
      var porConfirmar = puntos.filter(function (p) { return !p[3]; }).length;
      if (porConfirmar) estado.textContent += ' · ' + porConfirmar + ' con operación por confirmar (gris)';
      if (Number(datos.ubicadas) > puntos.length) estado.textContent += ' · Hay más resultados: filtra o busca en una zona para verlos.';
      if (!puntos.length) estado.textContent = 'No hay propiedades con coordenadas para estos filtros. Puedes revisar el listado o quitar la zona.';
      btnZona.disabled = false;
      if (propiedadPendiente) ubicar(propiedadPendiente);
    } catch (error) {
      if (r !== revision || panel.hidden) return;
      clave = ''; estado.textContent = 'No pudimos cargar el mapa. Puedes reintentar o seguir consultando el listado.';
      btnReintentar.hidden = false;
    } finally { clearTimeout(timer); if (r === revision) { clavePendiente = ''; cargando(false); } }
  }
  function quitarZona(aplicar) {
    if (dibujo) dibujo.borrar();
    zona = null; btnQuitar.hidden = true;
    if (aplicar !== false) window.aplicarZonaMapa();
  }
  function ubicar(id) {
    propiedadPendiente = String(id);
    if (clavePendiente && panel.getAttribute('aria-busy') === 'true' && !pines.has(propiedadPendiente)) return;
    var marker = pines.get(propiedadPendiente);
    propiedadPendiente = null;
    panel.scrollIntoView({block: 'nearest', inline: 'nearest'});
    if (!marker || !grupos) {
      estado.textContent = 'La ubicación de esta propiedad no está disponible en el mapa actual.';
      return;
    }
    var capaActual = grupos;
    grupos.zoomToShowLayer(marker, function () {
      requestAnimationFrame(function () {
        if (grupos === capaActual && pines.get(String(id)) === marker) marker.openPopup();
      });
    });
  }

  function localizar(inicial) {
    if (!mapa || localizando) return Promise.resolve(null);
    return new Promise(function (resolve) {
    var finalizado = false, espera;
    errorUbicacion.hidden = true;
    function terminar(mensaje, posicion) {
      if (finalizado) return;
      finalizado = true; clearTimeout(espera);
      localizando = false;
      btnUbicacion.disabled = false;
      btnUbicacion.removeAttribute('aria-busy');
      btnUbicacion.title = 'Mi ubicación';
      if (mensaje && !inicial) { errorUbicacion.textContent = mensaje; errorUbicacion.hidden = false; }
      resolve(posicion || null);
    }
    if (!navigator.geolocation) { terminar('Tu navegador no permite obtener la ubicación.'); return; }
    var permisos = document.permissionsPolicy || document.featurePolicy;
    if (permisos && !permisos.allowsFeature('geolocation')) {
      terminar('La ubicación está bloqueada por la configuración del sitio.'); return;
    }
    localizando = true;
    btnUbicacion.disabled = true;
    btnUbicacion.setAttribute('aria-busy', 'true');
    btnUbicacion.title = 'Obteniendo ubicación';
    espera = setTimeout(function () { terminar('La ubicación tardó demasiado. Inténtalo de nuevo.'); },20000);
    try {
      navigator.geolocation.getCurrentPosition(function (posicion) {
        if (finalizado) return;
        if (inicial && inicioCancelado) { terminar(); return; }
        var lat = posicion.coords.latitude, lng = posicion.coords.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85.05112878 || Math.abs(lng) > 180) {
          terminar('No pudimos ubicarte en el mapa. Inténtalo de nuevo.'); return;
        }
        var precision = Number(posicion.coords.accuracy);
        if (!Number.isFinite(precision) || precision < 0) precision = 0;
        if (ubicacionPersonal) mapa.removeLayer(ubicacionPersonal);
        var circulo = L.circle([lat,lng], {radius:precision, color:'#2672d8',weight:1,opacity:.4,fillOpacity:.08,interactive:false});
        var pin = L.circleMarker([lat,lng], {radius:8,color:'#fff',weight:3,fillColor:'#2672d8',fillOpacity:1,bubblingMouseEvents:false});
        pin.bindTooltip('Tu ubicación' + (precision ? ' · Precisión aproximada: ' + Math.ceil(precision).toLocaleString('es-MX') + ' m' : ''), {direction:'top'});
        ubicacionPersonal = L.layerGroup([circulo,pin]).addTo(mapa);
        if (inicial) mapa.setView([lat,lng],12,{animate:false});
        else if (precision > 0) mapa.fitBounds(circulo.getBounds(), {padding:[36,36],maxZoom:16,animate:false});
        else mapa.setView([lat,lng],16,{animate:false});
        terminar(null,{lat:lat,lng:lng});
      }, function (error) {
        terminar(error.code === 1 ? 'Permite el acceso a tu ubicación en el navegador para usar esta opción.' : error.code === 3 ? 'La ubicación tardó demasiado. Inténtalo de nuevo.' : 'No pudimos obtener tu ubicación. Revisa el GPS e inténtalo de nuevo.');
      }, {enableHighAccuracy:true,timeout:15000,maximumAge:60000});
    } catch (_) { terminar('No pudimos obtener tu ubicación. Revisa los permisos del navegador.'); }
    });
  }
  function puedeConsultar(f) {
    return !!(f.zona || f.poligono || f.texto || [f.estado,f.municipio,f.colonia].some(function(v){return Array.isArray(v)?v.length:!!v;}));
  }
  async function areaDePosicion(p) {
    var ciudad = await window.kwGeografiaMapa.porCoordenadas(p.lat,p.lng).catch(function(){return null;});
    if (ciudad) return ciudad;
    var b=L.latLng([p.lat,p.lng]).toBounds(30000);
    return {zona:[Math.max(-85.05112878,b.getSouth()),Math.max(-180,b.getWest()),Math.min(85.05112878,b.getNorth()),Math.min(180,b.getEast())]};
  }
  function prepararInicio(f) {
    if (!inicioPromesa) inicioPromesa=(async function(){
      await cargarBibliotecas();iniciarMapa();
      if (puedeConsultar(f)) {inicioPreparado=true;return f;}
      var p=await localizar(true);
      var area=p&&!inicioCancelado?await areaDePosicion(p):null;
      inicioPreparado=true;
      if(area&&area.zona&&!inicioCancelado){zona=area.zona;btnQuitar.hidden=false;}
      return area&&!inicioCancelado?Object.assign({},f,area):f;
    })().catch(function(){inicioPreparado=true;btnReintentar.hidden=false;return f;});
    return inicioPromesa;
  }
  btnUbicacion.onclick = function () {
    localizar(false).then(async function(p){
      if(p&&!puedeConsultar(window.filtrosServidorActuales())) {
        var area=await areaDePosicion(p);
        if(!puedeConsultar(window.filtrosServidorActuales())) {
          if(area.zona){zona=area.zona;btnQuitar.hidden=false;}
          window.aplicarCiudadMapa(area);
        }
      }
    });
  };
  btnReintentar.onclick = function () { actualizar(true); };
  btnQuitar.onclick = function () { quitarZona(); };
  btnZona.onclick = function () {
    if (!mapa) return;
    inicioCancelado = true;
    if (dibujo) dibujo.borrar();
    var b = mapa.getBounds();
    // Normalizar el desplazamiento horizontal del mapa al dominio geografico.
    var oeste = Math.max(-180, b.getWest()), este = Math.min(180, b.getEast());
    if (oeste >= este) { mapa.setView([23.6,-102.5],5); return; }
    zona = [Math.max(-85.05112878,b.getSouth()), oeste, Math.min(85.05112878,b.getNorth()), este];
    btnQuitar.hidden = false; window.aplicarZonaMapa();
  };
  window.addEventListener('kw-propiedades-filtradas', function () {
    requestAnimationFrame(function () { setTimeout(actualizar, 0); });
  });
  window.kwPropiedadesMapa = Object.freeze({prepararInicio:prepararInicio,puedeConsultar:puedeConsultar,cancelarInicio:function(){inicioCancelado=true;inicioPreparado=true;},ubicar: ubicar, zona: function () { return zona ? zona.slice() : null; }, poligono: function () { return dibujo ? dibujo.poligono() : null; }, quitarZona: quitarZona});
  if (document.querySelector('#lista .prop-card, #lista .estado-msg')) actualizar();
})();
