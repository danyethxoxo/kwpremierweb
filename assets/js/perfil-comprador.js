(function () {
  'use strict';
  var form = document.getElementById('comprador-form');
  var lista = document.getElementById('clientes');
  var mensaje = document.getElementById('mensaje');
  var guardar = document.getElementById('guardar');
  var nuevo = document.getElementById('nuevo');
  var mas = document.getElementById('mas');
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
  tipos.forEach(function (tipo) {
    var label = document.createElement('label'), input = document.createElement('input');
    input.type = 'checkbox'; input.name = 'tipos'; input.value = tipo;
    label.append(input, document.createTextNode(tipo)); document.getElementById('tipos').append(label);
  });
  var ubicaciones = [];
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
  function refrescarUbicacion() {
    if (actualizandoUbicacion) return;
    actualizandoUbicacion = true;
    var estado = form.elements.estado.value, municipio = form.elements.municipio.value;
    opciones('estado', ubicaciones.map(function (p) { return p.estado; }), 'Seleccionar ciudad');
    opciones('municipio', ubicaciones.filter(function (p) { return !estado || p.estado === estado; }).map(function (p) { return p.municipio; }), 'Todas');
    opciones('colonias', ubicaciones.filter(function (p) { return (!estado || p.estado === estado) && (!municipio || p.municipio === municipio); }).map(function (p) { return p.colonia; }), 'Todas');
    actualizandoUbicacion = false;
    window.kwUI.selects();
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
    } catch (e) { avisar('No se pudieron cargar las ubicaciones del inventario. Recarga para intentar de nuevo.',true); }
  }
  form.elements.estado.addEventListener('change', function () {
    if (actualizandoUbicacion) return;
    form.elements.municipio.value = ''; form.elements.colonias.value = ''; refrescarUbicacion();
  });
  form.elements.municipio.addEventListener('change', function () {
    if (actualizandoUbicacion) return;
    form.elements.colonias.value = ''; refrescarUbicacion();
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
        var paso = key === 'banos_min' ? .5 : 1;
        input.value = Math.max(0,Math.min(Number(input.max),Math.round(((Number(input.value)||0)+signo*paso)*100)/100));
        input.dispatchEvent(new Event('change',{bubbles:true}));
      });
      if (signo < 0) caja.prepend(btn); else caja.append(btn);
    });
  });
  function avisar(texto, error) { mensaje.textContent = texto; mensaje.classList.toggle('error', Boolean(error)); }
  function resetear() {
    form.reset(); editando = null;
    document.getElementById('titulo-formulario').textContent = 'Nuevo perfil';
    guardar.textContent = 'Guardar perfil'; nuevo.textContent = 'Limpiar';
    actualizarPrecios(); refrescarUbicacion();
    form.elements.operacion.dispatchEvent(new Event('change'));
    form.elements.moneda.dispatchEvent(new Event('change'));
  }
  function datos() {
    var d = {};
    textos.forEach(function (key) { d[key] = form.elements[key].value.trim(); });
    numeros.forEach(function (key) { var valor = form.elements[key].value; d[key] = valor === '' ? null : Number(valor); });
    d.tipos = Array.from(form.querySelectorAll('input[name=tipos]:checked')).map(function (input) { return input.value; });
    d.avisos_campana = true;
    d.avisos_correo = true;
    if (d.operacion === 'renta') d.precio_min = null;
    if (!d.telefono && !d.correo) throw new Error('Registra al menos un teléfono o correo del cliente.');
    if (d.nombre.length < 2 || d.estado.length < 2) throw new Error('Completa el nombre y el estado.');
    if (!d.tipos.length) throw new Error('Selecciona al menos un tipo de inmueble.');
    if (d.precio_min !== null && d.precio_min > d.precio_max) throw new Error('El presupuesto mínimo no puede superar al máximo.');
    return d;
  }
  function agregarTexto(padre, tag, texto) { var el = document.createElement(tag); el.textContent = texto; padre.append(el); return el; }
  function pintar() {
    lista.replaceChildren();
    if (!perfiles.length) agregarTexto(lista, 'p', 'Todavía no tienes perfiles. Crea el primero con el formulario.');
    perfiles.forEach(function (p) {
      var card = document.createElement('article'); card.className = 'cliente';
      var estado = agregarTexto(card, 'span', p.activo ? 'Activo' : 'Pausado'); estado.className = 'estado';
      agregarTexto(card, 'h3', p.nombre);
      agregarTexto(card, 'p', [p.telefono, p.correo].filter(Boolean).join(' · '));
      var monto = new Intl.NumberFormat('es-MX', { style: 'currency', currency: p.moneda, maximumFractionDigits: 2 });
      agregarTexto(card, 'p', (p.operacion === 'venta' ? 'Compra' : 'Renta') + ' · ' + p.tipos.join(', ') + ' · ' + (p.precio_min === null ? 'Hasta ' : monto.format(p.precio_min) + ' a ') + monto.format(p.precio_max) + ' ' + p.moneda);
      agregarTexto(card, 'p', [p.estado, p.municipio, p.colonias].filter(Boolean).join(' · '));
      var acciones = document.createElement('div'); acciones.className = 'acciones';
      var editar = agregarTexto(acciones, 'button', 'Editar'); editar.type = 'button';
      editar.addEventListener('click', function () {
        if (ocupado) return;
        resetear(); editando = p.id;
        textos.concat(numeros).forEach(function (key) {
          var input = form.elements[key], valor = p[key] == null ? '' : p[key];
          if (input.tagName === 'SELECT' && valor && !Array.from(input.options).some(function (o) { return o.value === valor; })) input.add(new Option(valor,valor));
          input.value = valor;
        });
        form.querySelectorAll('input[name=tipos]').forEach(function (input) { input.checked = p.tipos.includes(input.value); });
        document.getElementById('titulo-formulario').textContent = 'Editar perfil';
        guardar.textContent = 'Guardar cambios'; nuevo.textContent = 'Limpiar';
        actualizarPrecios(); refrescarUbicacion();
        form.elements.operacion.dispatchEvent(new Event('change'));
        form.elements.moneda.dispatchEvent(new Event('change')); vista(true);
        avisar(p.activo ? '' : 'Este perfil está pausado. Puedes reactivarlo en la tarjeta.'); form.elements.nombre.focus();
      });
      var pausar = agregarTexto(acciones, 'button', p.activo ? 'Pausar' : 'Reactivar'); pausar.type = 'button';
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
      card.append(acciones); lista.append(card);
    });
  }
  async function cargar(adicional) {
    if (cargando) return;
    cargando = true; mas.disabled = true;
    try {
      var desde = adicional ? perfiles.length : 0;
      var res = await window.kwSupabase.from('perfiles_comprador').select('*').order('created_at', { ascending: false }).order('id').range(desde, desde + 49);
      if (res.error) throw res.error;
      perfiles = adicional ? perfiles.concat(res.data) : res.data;
      pintar(); mas.hidden = res.data.length < 50;
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
      resetear(); pintar(); vista(false); avisar('Perfil guardado.');
    } catch (error) { avisar('No se pudo guardar el perfil. Revisa tu conexión e intenta de nuevo; tus datos siguen en el formulario.', true); }
    finally {
      ocupado = false; guardar.disabled = false; nuevo.disabled = false;
      controles.forEach(function (el) { el.disabled = false; }); actualizarPrecios(); guardar.textContent = editando ? 'Guardar cambios' : 'Guardar perfil';
    }
  });
  nuevo.addEventListener('click', function () { if (!ocupado) { resetear(); avisar(''); } });
  mas.addEventListener('click', function () { cargar(true); });
  document.getElementById('abrir-cliente').addEventListener('click', function () { resetear(); avisar(''); vista(true); });
  document.getElementById('cerrar-form').addEventListener('click', function () { if (!ocupado) vista(false); });
  function iniciar() { cargar(false); cargarUbicaciones(); }
  if (document.documentElement.classList.contains('kw-auth-ok')) iniciar();
  else window.addEventListener('kw-auth-ready', iniciar, { once: true });
})();
