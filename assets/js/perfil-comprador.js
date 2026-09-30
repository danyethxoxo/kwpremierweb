(function () {
  'use strict';
  var form = document.getElementById('comprador-form');
  var lista = document.getElementById('clientes');
  var mensaje = document.getElementById('mensaje');
  var guardar = document.getElementById('guardar');
  var nuevo = document.getElementById('nuevo');
  var mas = document.getElementById('mas');
  var esFormulario = document.body.dataset.vistaComprador === 'formulario';
  var clienteEditar = new URLSearchParams(location.search).get('id');
  // La campana comparte el renglón de acciones, como en Firmas Digitales.
  function ubicarCampana() {
    var slot = document.getElementById('notif-bell-slot');
    var acciones = document.getElementById('comprador-acciones');
    if (slot && slot.parentNode !== acciones) acciones.prepend(slot);
  }
  var observadorHeader = new MutationObserver(ubicarCampana);
  observadorHeader.observe(document.body, { childList: true, subtree: true });
  ubicarCampana();
  var perfiles = [], editando = null, ocupado = false, cargando = false;
  var tipos = ['Casa','Departamento','Terreno','Oficina','Local comercial','Bodega','Duplex','Nave industrial','Edificio','Rancho'];
  var textos = ['nombre','telefono','correo','operacion','moneda','estado','municipio','colonias','notas'];
  var numeros = ['precio_min','precio_max','recamaras_min','banos_min','estacionamientos_min','superficie_min','umbral_match'];
  function formatearPresupuesto(valor) {
    var partes = String(valor).replace(/,/g,'').replace(/[^0-9.]/g,'').split('.');
    var entero = partes.shift().replace(/^0+(?=\d)/,'');
    var decimal = partes.length ? '.' + partes.join('').slice(0,2) : '';
    return entero.replace(/\B(?=(\d{3})+(?!\d))/g,',') + decimal;
  }
  ['precio_min','precio_max'].forEach(function (campo) {
    var input = form.elements[campo];
    input.addEventListener('input',function () {
      var antes = input.value, posicion = input.selectionStart;
      var caracteres = antes.slice(0,posicion).replace(/,/g,'').length;
      input.value = formatearPresupuesto(antes);
      var cursor = 0, contados = 0;
      while (cursor < input.value.length && contados < caracteres) { if (input.value[cursor] !== ',') contados++; cursor++; }
      input.setSelectionRange(cursor,cursor);
    });
    input.addEventListener('blur',function () {
      if (input.value) input.value = formatearPresupuesto(String(Number(input.value.replace(/,/g,''))));
    });
  });
  tipos.forEach(function (tipo) {
    var label = document.createElement('label'), input = document.createElement('input');
    input.type = 'checkbox'; input.name = 'tipos'; input.value = tipo;
    label.append(input, document.createTextNode(tipo)); document.getElementById('tipos').append(label);
  });
  var ubicaciones = [], inventarioMatches = null, errorMatches = false, sitioAsesor = '', cacheMatches = new Map();
  var etiquetas = [], entradaEtiqueta = document.getElementById('agregar-etiqueta');
  function pintarEtiquetas() {
    var caja = document.getElementById('etiquetas');
    caja.querySelectorAll('.etiqueta').forEach(function (el) { el.remove(); });
    etiquetas.forEach(function (texto,indice) {
      var chip = document.createElement('span'); chip.className = 'etiqueta'; chip.append(document.createTextNode(texto));
      var quitar = document.createElement('button'); quitar.type = 'button'; quitar.textContent = '×'; quitar.setAttribute('aria-label','Quitar ' + texto);
      quitar.addEventListener('click',function () { if (!ocupado) { etiquetas.splice(indice,1); pintarEtiquetas(); } });
      chip.append(quitar); caja.insertBefore(chip,entradaEtiqueta);
    });
    form.elements.notas.value = etiquetas.join('\n');
  }
  function agregarEtiqueta() {
    var texto = entradaEtiqueta.value.trim().replace(/\s+/g,' ');
    if (!texto) return;
    if (!etiquetas.some(function (t) { return normalizarBusqueda(t) === normalizarBusqueda(texto); })) {
      if (etiquetas.concat(texto).join('\n').length > 2000) throw new Error('Las etiquetas no pueden superar 2,000 caracteres.');
      etiquetas.push(texto);
    }
    entradaEtiqueta.value = ''; pintarEtiquetas();
  }
  entradaEtiqueta.addEventListener('keydown',function (e) {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); if (!ocupado) { try { agregarEtiqueta(); } catch (error) { avisar(error.message,true); } } }
  });
  function normalizarBusqueda(texto) { return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
  function prepararBusquedaUbicacion() {
    ['estado','municipio','colonias'].forEach(function (campo) {
      var select = form.elements[campo], caja = select.closest('.kw-select');
      if (!caja) return;
      var existente = caja.querySelector('.catalogo-buscar');
      if (existente) { existente.actualizarCatalogo(); return; }
      var btn = caja.querySelector('.kw-select-btn'), menu = caja.querySelector('.kw-select-menu');
      caja.classList.add('catalogo-select');
      var buscar = document.createElement('input'); buscar.type = 'text'; buscar.className = 'catalogo-buscar'; buscar.autocomplete = 'off';
      buscar.setAttribute('role','combobox'); buscar.setAttribute('aria-autocomplete','list'); buscar.setAttribute('aria-label','Buscar ' + campo);
      menu.id = 'comprador-ubicacion-' + campo; buscar.setAttribute('aria-controls',menu.id); btn.tabIndex = -1;
      var limpiar = document.createElement('button'); limpiar.type = 'button'; limpiar.className = 'catalogo-limpiar'; limpiar.textContent = '×'; limpiar.setAttribute('aria-label','Borrar ' + campo);
      function filtrar() {
        var texto = normalizarBusqueda(buscar.value);
        menu.querySelectorAll('.kw-select-opcion').forEach(function (op) { op.hidden = !normalizarBusqueda(op.textContent).includes(texto); });
        limpiar.hidden = !select.value && !buscar.value;
      }
      buscar.actualizarCatalogo = function () {
        var abierto = caja.classList.contains('abierto');
        buscar.setAttribute('aria-expanded',String(abierto)); buscar.disabled = select.disabled; limpiar.disabled = select.disabled;
        var opcion = select.options[select.selectedIndex]; buscar.placeholder = opcion ? opcion.textContent : 'Seleccionar';
        if (!abierto) buscar.value = '';
        filtrar();
      };
      function abrir() { if (!caja.classList.contains('abierto')) btn.click(); filtrar(); }
      buscar.addEventListener('click',function (e) { e.stopPropagation(); abrir(); });
      buscar.addEventListener('input',function (e) { e.stopPropagation(); abrir(); });
      buscar.addEventListener('keydown',function (e) {
        e.stopPropagation();
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault(); abrir(); var primera = menu.querySelector('.kw-select-opcion:not([hidden]):not([disabled])'); if (primera) primera.focus();
        } else if ((e.key === 'Escape' || e.key === 'Tab') && caja.classList.contains('abierto')) btn.click();
      });
      limpiar.addEventListener('click',function (e) { e.stopPropagation(); select.value = ''; buscar.value = ''; if (caja.classList.contains('abierto')) btn.click(); select.dispatchEvent(new Event('change',{bubbles:true})); buscar.actualizarCatalogo(); buscar.focus(); });
      select.addEventListener('change',function () { buscar.value = ''; buscar.actualizarCatalogo(); });
      menu.addEventListener('click',function (e) { if (e.target.closest('.kw-select-opcion')) buscar.focus(); });
      caja.append(buscar,limpiar); buscar.actualizarCatalogo();
    });
  }
  new MutationObserver(prepararBusquedaUbicacion).observe(form,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  function vista(editor) {
    document.getElementById('vista-formulario').hidden = !editor;
    document.getElementById('vista-clientes').hidden = editor;
    document.getElementById('abrir-cliente').hidden = editor;
    window.scrollTo(0, 0);
  }
  function actualizarPrecios() {
    var renta = form.elements.operacion.value === 'renta';
    document.getElementById('campo-precio-min').hidden = renta;
    document.getElementById('fila-presupuesto').classList.toggle('operacion-renta',renta);
    form.elements.precio_min.disabled = renta;
    document.getElementById('precio-max-titulo').textContent = renta ? 'Renta mensual máxima *' : 'Presupuesto máximo *';
  }
  function opciones(campo, valores, vacio) {
    var select = form.elements[campo], anterior = select.value;
    select.replaceChildren(new Option(vacio, ''));
    Array.from(new Set(valores.filter(Boolean))).sort(function (a,b) { return a.localeCompare(b,'es'); }).forEach(function (v) { select.add(new Option(v,v)); });
    if (anterior && !Array.from(select.options).some(function (o) { return o.value === anterior; })) select.add(new Option(anterior,anterior));
    select.value = anterior;
    select.dispatchEvent(new Event('change', { bubbles: false }));
  }
  var actualizandoUbicacion = false;
  function opcionesLugar(campo, filas, columna, estado, municipio) {
    var select = form.elements[campo], anterior = select.value, mapa = new Map();
    select.replaceChildren(new Option('Todas',''));
    filas.forEach(function (p) {
      if (!p[columna]) return;
      var clave = JSON.stringify([p.estado,p.municipio,columna === 'colonia' ? p.colonia : '']);
      mapa.set(clave,p);
    });
    Array.from(mapa.values()).sort(function (a,b) { return a[columna].localeCompare(b[columna],'es'); }).forEach(function (p) {
      var texto = [p[columna], columna === 'colonia' && !municipio ? p.municipio : '', !estado ? p.estado : ''].filter(Boolean).join(' · ');
      var option = new Option(texto,p[columna]); option.dataset.estado = p.estado; option.dataset.municipio = p.municipio;
      select.add(option);
    });
    if (anterior && !Array.from(select.options).some(function (o) { return o.value === anterior; })) select.add(new Option(anterior,anterior));
    select.value = anterior; select.dispatchEvent(new Event('change'));
  }
  function refrescarUbicacion() {
    if (actualizandoUbicacion) return;
    actualizandoUbicacion = true;
    var estado = form.elements.estado.value, municipio = form.elements.municipio.value;
    opciones('estado', ubicaciones.map(function (p) { return p.estado; }), 'Seleccionar ciudad');
    opcionesLugar('municipio', ubicaciones.filter(function (p) { return !estado || p.estado === estado; }), 'municipio',estado,municipio);
    opcionesLugar('colonias', ubicaciones.filter(function (p) { return (!estado || p.estado === estado) && (!municipio || p.municipio === municipio); }), 'colonia',estado,municipio);
    actualizandoUbicacion = false;
    window.kwUI.selects();
    prepararBusquedaUbicacion();
  }
  async function cargarUbicaciones() {
    try {
      var todas = [], desde = 0;
      while (true) {
        var res = await window.kwSupabase.from('propiedades_inventario').select('estado,municipio,colonia').eq('fuente','kwmexico').order('id').range(desde,desde+999);
        if (res.error) throw res.error;
        todas = todas.concat(res.data.filter(function (p) { return p.estado && p.estado.toLowerCase() !== 'antioquia'; }));
        if (res.data.length < 1000) break;
        desde += 1000;
      }
      ubicaciones = todas; refrescarUbicacion();
    } catch (e) { avisar('No se pudieron cargar las ubicaciones. Recarga para intentar de nuevo.',true); }
  }
  var revisionMatches = 0;
  async function cargarInventarioMatches() {
    if (esFormulario) return;
    var revision = ++revisionMatches;
    inventarioMatches = null; errorMatches = false; cacheMatches.clear(); pintar();
    if (!perfiles.length) { inventarioMatches = []; pintar(); return; }
    var estados = Array.from(new Set(perfiles.map(function (p) { return p.estado; })));
    var operaciones = Array.from(new Set(perfiles.map(function (p) { return p.operacion; })));
    var campos = 'id,fuente_id,titulo,descripcion,operacion,estatus,tipo,tipos_filtro,precio,moneda,recamaras,banos,estacionamientos,m2_construccion,m2_terreno,estado,municipio,colonia,imagenes,asesor_nombre,market_center,enlace_kw';
    function consulta(desde) {
      return window.kwSupabase.from('propiedades_inventario').select(campos)
        .eq('fuente','kwmexico').eq('estatus','publicada').in('estado',estados).in('operacion',operaciones).order('id').range(desde,desde+499);
    }
    try {
      var todas = [], desde = 0;
      while (true) {
        var lote = await consulta(desde); if (lote.error) throw lote.error;
        todas = todas.concat(lote.data || []);
        if (revision !== revisionMatches) return;
        if (!lote.data || lote.data.length < 500) break;
        desde += 500;
      }
      if (revision !== revisionMatches) return;
      inventarioMatches = todas; pintar();
    } catch (e) { if (revision !== revisionMatches) return; console.error('Error al cargar coincidencias:',e); errorMatches = true; pintar(); }
  }
  form.elements.estado.addEventListener('change', function () {
    if (actualizandoUbicacion) return;
    form.elements.municipio.value = ''; form.elements.colonias.value = ''; refrescarUbicacion();
  });
  form.elements.municipio.addEventListener('change', function () {
    if (actualizandoUbicacion) return;
    var opcion = form.elements.municipio.selectedOptions[0];
    if (opcion && opcion.dataset.estado) form.elements.estado.value = opcion.dataset.estado;
    form.elements.colonias.value = ''; refrescarUbicacion();
  });
  form.elements.colonias.addEventListener('change', function () {
    if (actualizandoUbicacion) return;
    var opcion = form.elements.colonias.selectedOptions[0];
    if (opcion && opcion.dataset.estado) {
      form.elements.estado.value = opcion.dataset.estado;
      var municipio = opcion.dataset.municipio;
      if (!Array.from(form.elements.municipio.options).some(function (o) { return o.value === municipio; })) form.elements.municipio.add(new Option(municipio,municipio));
      form.elements.municipio.value = municipio; refrescarUbicacion();
    }
  });
  form.elements.operacion.addEventListener('change', actualizarPrecios);
  ['recamaras_min','banos_min','estacionamientos_min','superficie_min'].forEach(function (key) {
    var input = form.elements[key], caja = document.createElement('div'); caja.className = 'cantidad';
    input.setAttribute('data-kw-no','');
    input.parentNode.insertBefore(caja,input); caja.append(input);
    [-1,1].forEach(function (signo) {
      var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = signo < 0 ? '−' : '+';
      btn.setAttribute('aria-label', (signo < 0 ? 'Disminuir ' : 'Aumentar ') + input.parentNode.parentNode.firstChild.textContent);
      btn.addEventListener('click', function () {
        if (ocupado) return;
        var paso = key === 'banos_min' ? .5 : key === 'superficie_min' ? 10 : 1;
        input.value = Math.max(0,Math.min(Number(input.max),Math.round(((Number(input.value)||0)+signo*paso)*100)/100));
        input.dispatchEvent(new Event('change',{bubbles:true}));
      });
      if (signo < 0) caja.prepend(btn); else caja.append(btn);
    });
  });
  function avisar(texto, error) { mensaje.textContent = texto; mensaje.classList.toggle('error', Boolean(error)); }
  function resetear() {
    form.reset(); editando = null;
    etiquetas = []; entradaEtiqueta.value = ''; pintarEtiquetas();
    document.getElementById('titulo-formulario').textContent = 'Nuevo perfil';
    guardar.textContent = 'Guardar perfil'; nuevo.textContent = 'Limpiar';
    actualizarPrecios(); refrescarUbicacion();
    form.elements.operacion.dispatchEvent(new Event('change'));
    form.elements.moneda.dispatchEvent(new Event('change'));
  }
  function datos() {
    agregarEtiqueta();
    var d = {};
    textos.forEach(function (key) { d[key] = form.elements[key].value.trim(); });
    numeros.forEach(function (key) { var valor = form.elements[key].value.replace(/,/g,''); d[key] = valor === '' ? null : Number(valor); });
    d.tipos = Array.from(form.querySelectorAll('input[name=tipos]:checked')).map(function (input) { return input.value; });
    d.avisos_campana = true;
    d.avisos_correo = true;
    if (d.operacion === 'renta') d.precio_min = null;
    if (!d.telefono && !d.correo) throw new Error('Registra al menos un teléfono o correo del cliente.');
    if (d.nombre.length < 2 || d.estado.length < 2) throw new Error('Completa el nombre y el estado.');
    if (!d.tipos.length) throw new Error('Selecciona al menos un tipo de inmueble.');
    if (!Number.isFinite(d.precio_max) || d.precio_max <= 0 || d.precio_max > 100000000000) throw new Error('Ingresa un presupuesto máximo válido, mayor que cero.');
    if (d.precio_min !== null && (!Number.isFinite(d.precio_min) || d.precio_min < 0 || d.precio_min > 100000000000)) throw new Error('Ingresa un presupuesto mínimo válido.');
    if (d.precio_min !== null && d.precio_min > d.precio_max) throw new Error('El presupuesto mínimo no puede superar al máximo.');
    return d;
  }
  function agregarTexto(padre, tag, texto) { var el = document.createElement(tag); el.textContent = texto; padre.append(el); return el; }
  function matchesCliente(cliente) {
    var clave = JSON.stringify(cliente);
    if (cacheMatches.has(clave)) return cacheMatches.get(clave);
    var resultados = (inventarioMatches || []).map(function (propiedad) { return { propiedad: propiedad, match: window.kwCompradorMatches.evaluar(cliente,propiedad) }; })
      .filter(function (r) { return r.match && r.match.porcentaje >= cliente.umbral_match; })
      .sort(function (a,b) { return b.match.porcentaje - a.match.porcentaje; });
    if (inventarioMatches) cacheMatches.set(clave,resultados);
    return resultados;
  }
  function pintarPropiedad(resultado, padre) {
    var p = resultado.propiedad, match = resultado.match;
    var card = document.createElement('article'); card.className = 'match-prop';
    var tono = Math.max(0,Math.min(120,(match.porcentaje-50)*2.4));
    card.style.setProperty('--match-color','hsl(' + tono + ', 58%, 40%)');
    var foto = document.createElement('div'); foto.className = 'match-foto';
    var enlace = p.enlace_kw || 'https://www.kwmexico.mx/propiedades/' + encodeURIComponent(p.fuente_id);
    enlace = window.kwSitioAsesor.personalizar(enlace,sitioAsesor);
    var link = document.createElement('a'); link.href = enlace; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', p.titulo || 'Ver propiedad');
    var urlFoto = p.imagenes && p.imagenes[0];
    if (urlFoto && /^https:\/\//i.test(urlFoto)) { var img = document.createElement('img'); img.src = urlFoto; img.loading = 'lazy'; img.alt = p.titulo || ''; img.addEventListener('error',function () { img.remove(); }); link.append(img); }
    foto.append(link); var badge = agregarTexto(foto,'span',p.operacion === 'renta' ? 'Renta' : 'Venta'); badge.className = 'match-badge';
    var body = document.createElement('div'); body.className = 'match-body';
    var precio = agregarTexto(body,'div',Number(p.precio) > 0 ? new Intl.NumberFormat('es-MX',{style:'currency',currency:p.moneda || 'MXN',maximumFractionDigits:0}).format(p.precio) : 'Precio a consultar'); precio.className = 'match-precio';
    var titulo = agregarTexto(body,'a',p.titulo); titulo.className = 'match-titulo'; titulo.style.display = 'block'; titulo.href = enlace; titulo.target = '_blank'; titulo.rel = 'noopener noreferrer';
    agregarTexto(body,'div',[p.colonia,p.municipio].filter(Boolean).join(', ')).className = 'match-ubic';
    agregarTexto(body,'div',[p.recamaras != null ? p.recamaras + ' rec.' : '',p.banos != null ? p.banos + ' baños' : '',p.m2_construccion ? p.m2_construccion + ' m²' : p.m2_terreno ? p.m2_terreno + ' m²' : ''].filter(Boolean).join(' · ')).className = 'match-datos';
    var pie = document.createElement('div'); pie.className = 'match-pie'; agregarTexto(pie,'span',p.market_center || ''); agregarTexto(pie,'span',p.asesor_nombre || ''); body.append(pie);
    var interior = document.createElement('div'); interior.className = 'match-giro';
    var frente = document.createElement('div'); frente.className = 'match-frente';
    var desglose = document.createElement('div'); desglose.className = 'match-atras'; desglose.inert = true;
    agregarTexto(desglose,'h3',match.porcentaje + '% de compatibilidad');
    var detalleCriterios = document.createElement('div'); detalleCriterios.className = 'match-criterios'; desglose.append(detalleCriterios);
    match.criterios.forEach(function (c) { agregarTexto(detalleCriterios,'p',(c.cumple ? '✓ ' : c.parcial ? '≈ ' : '— ') + c.nombre + ' · ' + c.detalle); });
    var ver = agregarTexto(body,'button','Ver compatibilidad'); ver.type = 'button'; ver.className = 'match-ver';
    var volver = agregarTexto(desglose,'button','Ver propiedad'); volver.type = 'button'; volver.className = 'match-ver';
    function girar(atras) {
      card.classList.toggle('girada',atras); frente.inert = atras; desglose.inert = !atras;
      frente.setAttribute('aria-hidden',String(atras)); desglose.setAttribute('aria-hidden',String(!atras));
      (atras ? volver : ver).focus({preventScroll:true});
    }
    ver.addEventListener('click',function () { girar(true); }); volver.addEventListener('click',function () { girar(false); });
    desglose.setAttribute('aria-hidden','true'); frente.append(foto,body); interior.append(frente,desglose); card.append(interior); padre.append(card);
  }
  function pintar() {
    lista.replaceChildren();
    if (!perfiles.length) agregarTexto(lista, 'p', 'Todavía no tienes perfiles. Crea el primero con el formulario.');
    var tabla = document.createElement('table'); tabla.className = 'clientes-tabla'; tabla.setAttribute('aria-label','Mis clientes');
    var tbody = document.createElement('tbody'); tabla.append(tbody); if (perfiles.length) lista.append(tabla);
    perfiles.forEach(function (p) {
      var fila = document.createElement('tr'), celda = document.createElement('td'); fila.append(celda); tbody.append(fila);
      var contenedor = document.createElement('div'); contenedor.className = 'cliente';
      var card = document.createElement('div'); card.className = 'cliente-info';
      var identidad = document.createElement('div'); identidad.className = 'cliente-identidad'; card.append(identidad);
      agregarTexto(identidad, 'h3', p.nombre);
      var estado = agregarTexto(identidad, 'span', p.activo ? 'Activo' : 'Pausado'); estado.className = 'estado';
      agregarTexto(card, 'p', [p.telefono, p.correo].filter(Boolean).join(' · '));
      var monto = new Intl.NumberFormat('es-MX', { style: 'currency', currency: p.moneda, maximumFractionDigits: 0 });
      agregarTexto(card, 'p', (p.operacion === 'venta' ? 'Compra' : 'Renta') + ' · ' + p.tipos.join(', ') + ' · ' + (p.precio_min === null ? 'Hasta ' : monto.format(p.precio_min) + ' a ') + monto.format(p.precio_max) + ' ' + p.moneda);
      agregarTexto(card, 'p', [p.estado, p.municipio, p.colonias].filter(Boolean).join(' · '));
      var acciones = document.createElement('div'); acciones.className = 'acciones';
      var coincidencias = matchesCliente(p);
      var desplegar = agregarTexto(acciones,'button',inventarioMatches ? coincidencias.length + ' coincidencias' : errorMatches ? 'Reintentar' : 'Calculando…'); desplegar.type = 'button'; desplegar.className = 'btn-coincidencias'; desplegar.disabled = !inventarioMatches && !errorMatches; desplegar.setAttribute('aria-expanded','false');
      var filaMatches = document.createElement('tr'), celdaMatches = document.createElement('td'); filaMatches.hidden = true; filaMatches.append(celdaMatches); tbody.append(filaMatches);
      desplegar.addEventListener('click',function () {
        if (errorMatches) { cargarInventarioMatches(); return; }
        filaMatches.hidden = !filaMatches.hidden; desplegar.setAttribute('aria-expanded',String(!filaMatches.hidden));
        if (!filaMatches.hidden && !celdaMatches.childNodes.length) {
          var grid = document.createElement('div'); grid.className = 'matches-grid'; celdaMatches.append(grid);
          var carrusel = document.createElement('div'); carrusel.className = 'match-carrusel'; celdaMatches.insertBefore(carrusel,grid); carrusel.append(grid);
          var niveles = Array.from(new Set(coincidencias.map(function (r) { return Math.floor(r.match.porcentaje / 10) * 10; }))).sort(function (a,b) { return b-a; });
          var modulo = 0, limite = 0, grupo = [];
          var tituloModulo = document.createElement('p'); tituloModulo.className = 'match-nivel-titulo'; celdaMatches.insertBefore(tituloModulo,carrusel);
          var carruselNav = document.createElement('div'); carruselNav.className = 'match-carrusel-nav';
          var prevProps = agregarTexto(carruselNav,'button','←'); prevProps.type = 'button'; prevProps.setAttribute('aria-label','Página anterior de propiedades');
          var paginaProps = agregarTexto(carruselNav,'span','');
          var masProps = agregarTexto(carruselNav,'button','→'); masProps.type = 'button'; masProps.setAttribute('aria-label','Página siguiente de propiedades'); celdaMatches.append(carruselNav);
          prevProps.className = 'match-flecha match-flecha-prev'; masProps.className = 'match-flecha match-flecha-next'; carrusel.append(prevProps,masProps);
          var siguienteNivel = agregarTexto(celdaMatches,'button',''); siguienteNivel.type = 'button';
          var anteriorNivel = agregarTexto(celdaMatches,'button','Volver al nivel anterior'); anteriorNivel.type = 'button';
          var navegacion = document.createElement('div'); navegacion.className = 'match-navegacion'; navegacion.append(anteriorNivel,siguienteNivel); celdaMatches.append(navegacion);
          function pagina() {
            grid.replaceChildren(); grupo.slice(limite,limite+5).forEach(function (r) { pintarPropiedad(r,grid); });
            grid.classList.remove('pagina-entra'); void grid.offsetWidth; grid.classList.add('pagina-entra'); grid.scrollLeft = 0;
            prevProps.disabled = limite === 0; masProps.disabled = limite + 5 >= grupo.length;
            carruselNav.hidden = grupo.length <= 5;
            prevProps.hidden = grupo.length <= 5; masProps.hidden = grupo.length <= 5;
            paginaProps.textContent = 'Página ' + (Math.floor(limite/5)+1) + ' de ' + Math.ceil(grupo.length/5);
          }
          function mostrarModulo() {
            grid.replaceChildren(); limite = 0;
            var nivel = niveles[modulo];
            grupo = coincidencias.filter(function (r) { return Math.floor(r.match.porcentaje / 10) * 10 === nivel; });
            tituloModulo.textContent = niveles.length ? 'Compatibilidad ' + nivel + (nivel < 100 ? '–' + (nivel+9) : '') + '% · ' + grupo.length + ' propiedades' : '';
            tituloModulo.style.setProperty('--nivel-color','hsl(' + Math.max(0,Math.min(120,(nivel-50)*2.4)) + ', 58%, 40%)');
            siguienteNivel.hidden = modulo >= niveles.length-1; anteriorNivel.hidden = modulo === 0;
            siguienteNivel.textContent = 'Ver coincidencias al ' + niveles[modulo+1] + '%';
            anteriorNivel.textContent = 'Ver coincidencias al ' + niveles[modulo-1] + '%';
            pagina();
            if (!coincidencias.length) agregarTexto(grid,'p','No hay propiedades que alcancen este porcentaje con los criterios actuales.');
          }
          masProps.addEventListener('click',function () { limite += 5; pagina(); });
          prevProps.addEventListener('click',function () { limite = Math.max(0,limite-5); pagina(); });
          siguienteNivel.addEventListener('click',function () { modulo++; mostrarModulo(); });
          anteriorNivel.addEventListener('click',function () { modulo--; mostrarModulo(); }); mostrarModulo();
        }
      });
      var menu = document.createElement('details'); menu.className = 'cliente-menu'; agregarTexto(menu,'summary','⋮').setAttribute('aria-label','Acciones de ' + p.nombre);
      var opcionesMenu = document.createElement('div'); menu.append(opcionesMenu); acciones.append(menu);
      var editar = agregarTexto(opcionesMenu, 'button', 'Editar'); editar.type = 'button';
      editar.dataset.editarCliente = p.id;
      editar.addEventListener('click', function () {
        if (!esFormulario) { location.href = '/hub/cliente-formulario.html?id=' + encodeURIComponent(p.id); return; }
        if (ocupado) return;
        resetear(); editando = p.id;
        textos.concat(numeros).forEach(function (key) {
          var input = form.elements[key], valor = p[key] == null ? '' : p[key];
          if (input.tagName === 'SELECT' && valor && !Array.from(input.options).some(function (o) { return o.value === valor; })) input.add(new Option(valor,valor));
          input.value = key === 'precio_min' || key === 'precio_max' ? formatearPresupuesto(valor) : valor;
        });
        etiquetas = String(p.notas || '').split(/[\n,;]+/).map(function (t) { return t.trim(); }).filter(Boolean); pintarEtiquetas();
        form.querySelectorAll('input[name=tipos]').forEach(function (input) { input.checked = p.tipos.includes(input.value); });
        document.getElementById('titulo-formulario').textContent = 'Editar perfil';
        guardar.textContent = 'Guardar cambios'; nuevo.textContent = 'Limpiar';
        actualizarPrecios(); refrescarUbicacion();
        form.elements.operacion.dispatchEvent(new Event('change'));
        form.elements.moneda.dispatchEvent(new Event('change')); vista(true);
        avisar(p.activo ? '' : 'Este perfil está pausado. Puedes reactivarlo en la tarjeta.'); form.elements.nombre.focus();
      });
      var pausar = agregarTexto(opcionesMenu, 'button', p.activo ? 'Pausar' : 'Reactivar'); pausar.type = 'button';
      pausar.addEventListener('click', async function () {
        if (ocupado) return;
        pausar.disabled = true;
        try {
          var res = await window.kwSupabase.from('perfiles_comprador').update({ activo: !p.activo }).eq('id', p.id).select('id,activo').single();
          if (res.error) throw res.error;
          p.activo = res.data.activo; pintar();
        } catch (error) { avisar('No se pudo cambiar el estado del perfil. Intenta de nuevo.', true); }
        finally { pausar.disabled = false; }
      });
      contenedor.append(card,acciones); celda.append(contenedor);
    });
  }
  async function cargar(adicional) {
    if (cargando) return;
    cargando = true; mas.disabled = true;
    try {
      var desde = adicional ? perfiles.length : 0;
      var consulta = window.kwSupabase.from('perfiles_comprador').select('*').order('created_at', { ascending: false }).order('id').range(desde, desde + 49);
      if (esFormulario && clienteEditar) consulta = consulta.eq('id',clienteEditar);
      var res = await consulta;
      if (res.error) throw res.error;
      perfiles = adicional ? perfiles.concat(res.data) : res.data;
      pintar(); mas.hidden = res.data.length < 50;
      if (!esFormulario) cargarInventarioMatches();
      if (esFormulario && clienteEditar) {
        var editarBoton = lista.querySelector('[data-editar-cliente]');
        if (editarBoton) editarBoton.click(); else avisar('El cliente no existe o no pertenece a tu cuenta.',true);
      }
    } catch (error) {
      if (!perfiles.length) lista.textContent = 'No se pudieron cargar tus perfiles. Recarga para intentar de nuevo.';
      avisar('No se pudieron cargar los perfiles. Los datos del formulario se conservan.', true);
    } finally { cargando = false; mas.disabled = false; }
  }
  form.addEventListener('submit', async function (event) {
    event.preventDefault(); if (ocupado) return;
    var payload;
    try { payload = datos(); } catch (error) { avisar(error.message, true); return; }
    ocupado = true; guardar.disabled = true; nuevo.disabled = true;
    var controles = Array.from(form.querySelectorAll('input,select,textarea')); controles.forEach(function (el) { el.disabled = true; });
    guardar.textContent = 'Guardando…'; avisar('');
    try {
      var query = window.kwSupabase.from('perfiles_comprador');
      var res = await (editando ? query.update(payload).eq('id', editando) : query.insert(payload)).select('*').single();
      if (res.error) throw res.error;
      var indice = perfiles.findIndex(function (p) { return p.id === res.data.id; });
      if (indice === -1) perfiles.unshift(res.data); else perfiles[indice] = res.data;
      location.href = '/hub/perfil-comprador.html';
    } catch (error) { avisar('No se pudo guardar el perfil. Revisa tu conexión e intenta de nuevo; tus datos siguen en el formulario.', true); }
    finally {
      ocupado = false; guardar.disabled = false; nuevo.disabled = false;
      controles.forEach(function (el) { el.disabled = false; }); actualizarPrecios(); guardar.textContent = editando ? 'Guardar cambios' : 'Guardar perfil';
    }
  });
  nuevo.addEventListener('click', function () { if (!ocupado) { resetear(); avisar(''); } });
  mas.addEventListener('click', function () { cargar(true); });
  document.getElementById('abrir-cliente').addEventListener('click', function () { location.href = '/hub/cliente-formulario.html'; });
  document.getElementById('cerrar-form').addEventListener('click', function () { if (!ocupado) location.href = '/hub/perfil-comprador.html'; });
  document.addEventListener('click',function (e) { document.querySelectorAll('.cliente-menu[open]').forEach(function (menu) { if (!menu.contains(e.target)) menu.open = false; }); });
  async function cargarSitio() {
    try {
      var usuario = await window.kwSupabase.auth.getUser();
      if (!usuario.data.user) return;
      var perfil = await window.kwSupabase.from('profiles').select('sitio_web').eq('id',usuario.data.user.id).single();
      if (!perfil.error) sitioAsesor = perfil.data.sitio_web || '';
    } catch (e) { /* Sin sitio personal se conserva el enlace general. */ }
  }
  function iniciar() { vista(esFormulario); if (!esFormulario || clienteEditar) cargar(false); cargarSitio(); if (esFormulario) cargarUbicaciones(); }
  if (document.documentElement.classList.contains('kw-auth-ok')) iniciar();
  else window.addEventListener('kw-auth-ready', iniciar, { once: true });
})();
