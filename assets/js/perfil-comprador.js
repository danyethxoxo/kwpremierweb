(function () {
  'use strict';
  var form = document.getElementById('comprador-form');
  var lista = document.getElementById('clientes');
  var mensaje = document.getElementById('mensaje');
  var guardar = document.getElementById('guardar');
  var nuevo = document.getElementById('nuevo');
  var mas = document.getElementById('mas');
  var perfiles = [], editando = null, ocupado = false, cargando = false;
  var tipos = ['Casa','Departamento','Terreno','Oficina','Local comercial','Bodega','Duplex','Nave industrial','Edificio','Rancho'];
  var textos = ['nombre','telefono','correo','operacion','moneda','estado','municipio','colonias','notas'];
  var numeros = ['precio_min','precio_max','recamaras_min','banos_min','estacionamientos_min','superficie_min','umbral_match'];
  tipos.forEach(function (tipo) {
    var label = document.createElement('label'), input = document.createElement('input');
    input.type = 'checkbox'; input.name = 'tipos'; input.value = tipo;
    label.append(input, document.createTextNode(tipo)); document.getElementById('tipos').append(label);
  });
  ['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua','Ciudad de México','Coahuila','Colima','Durango','Estado de México','Guanajuato','Guerrero','Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas'].forEach(function (estado) {
    var option = document.createElement('option'); option.value = estado; document.getElementById('estados').append(option);
  });
  function avisar(texto, error) { mensaje.textContent = texto; mensaje.classList.toggle('error', Boolean(error)); }
  function resetear() {
    form.reset(); editando = null;
    document.getElementById('titulo-formulario').textContent = 'Nuevo perfil';
    guardar.textContent = 'Guardar perfil'; nuevo.textContent = 'Limpiar formulario';
  }
  function datos() {
    var d = {};
    textos.forEach(function (key) { d[key] = form.elements[key].value.trim(); });
    numeros.forEach(function (key) { var valor = form.elements[key].value; d[key] = valor === '' ? null : Number(valor); });
    d.tipos = Array.from(form.querySelectorAll('input[name=tipos]:checked')).map(function (input) { return input.value; });
    d.avisos_campana = form.elements.avisos_campana.checked;
    d.avisos_correo = form.elements.avisos_correo.checked;
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
        textos.concat(numeros).forEach(function (key) { form.elements[key].value = p[key] == null ? '' : p[key]; });
        form.querySelectorAll('input[name=tipos]').forEach(function (input) { input.checked = p.tipos.includes(input.value); });
        form.elements.avisos_campana.checked = p.avisos_campana; form.elements.avisos_correo.checked = p.avisos_correo;
        document.getElementById('titulo-formulario').textContent = 'Editar perfil';
        guardar.textContent = 'Guardar cambios'; nuevo.textContent = 'Cancelar edición';
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
      resetear(); pintar(); avisar('Perfil guardado. Los matches y avisos se activarán en la siguiente etapa.');
    } catch (error) { avisar('No se pudo guardar el perfil. Revisa tu conexión e intenta de nuevo; tus datos siguen en el formulario.', true); }
    finally {
      ocupado = false; guardar.disabled = false; nuevo.disabled = false;
      controles.forEach(function (el) { el.disabled = false; }); guardar.textContent = editando ? 'Guardar cambios' : 'Guardar perfil';
    }
  });
  nuevo.addEventListener('click', function () { if (!ocupado) { resetear(); avisar(''); } });
  mas.addEventListener('click', function () { cargar(true); });
  if (document.documentElement.classList.contains('kw-auth-ok')) cargar(false);
  else window.addEventListener('kw-auth-ready', function () { cargar(false); }, { once: true });
})();
