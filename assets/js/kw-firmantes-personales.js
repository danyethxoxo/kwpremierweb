(function (global) {
  'use strict';
  var userId = null, favoritos = [], candidatos = [], base = [], adaptador = null, errorCarga = false;
  var pendientes = new Set();
  function correo(valor) { return String(valor || '').trim().toLowerCase(); }
  function buscar(valor) { return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function escapar(valor) { return String(valor || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function esFavorito(email) { return favoritos.some(function (p) { return correo(p.correo) === correo(email); }); }
  var corazon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
  function botonCorazon(persona) {
    var activo = esFavorito(persona.correo);
    return '<button type="button" class="firmante-favorito' + (activo ? ' activo' : '') + (pendientes.has(correo(persona.correo)) ? ' pendiente' : '') + '" aria-busy="' + pendientes.has(correo(persona.correo)) + '" aria-label="' + (activo ? 'Quitar de' : 'Guardar en') + ' Favoritos" aria-pressed="' + activo + '" data-favorito-correo="' + escapar(correo(persona.correo)) + '" data-favorito-nombre="' + escapar(persona.nombre) + '">' + corazon + '</button>';
  }
  async function alternar(persona) {
    var email = correo(persona.correo), nombre = String(persona.nombre || '').trim();
    if (!userId || pendientes.has(email)) return;
    if (!nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return global.kwUI.alert('Escribe el nombre y un correo válido antes de guardar al firmante.');
    }
    pendientes.add(email);
    var existe = esFavorito(email), anterior = favoritos.find(function (f) { return correo(f.correo) === email; });
    favoritos = favoritos.filter(function (f) { return correo(f.correo) !== email; });
    if (!existe) favoritos.push({ nombre: nombre, correo: email });
    pintar();
    try {
      var consulta = global.kwSupabase.from('firmas_favoritos_personales');
      var resultado = existe ? await consulta.delete().eq('user_id', userId).eq('correo', email)
        : await consulta.upsert({ user_id: userId, correo: email, nombre: nombre }, { onConflict: 'user_id,correo' });
      if (resultado.error) throw resultado.error;
    } catch (error) {
      favoritos = favoritos.filter(function (f) { return correo(f.correo) !== email; });
      if (anterior) favoritos.push(anterior);
      pintar();
      await global.kwUI.alert('No se pudo guardar el favorito. Intenta de nuevo.');
    } finally { pendientes.delete(email); pintar(); }
  }
  function filas(personas) {
    var puestos = adaptador ? adaptador.leer() : [];
    return personas.map(function (p) {
      var agregado = puestos.some(function (f) { return p.correo ? correo(f.correo) === correo(p.correo) : buscar(f.nombre) === buscar(p.nombre); });
      var iniciales = String(p.nombre || '').trim().split(/\s+/).slice(0, 2).map(function (parte) { return parte.charAt(0); }).join('').toUpperCase();
      var icono = agregado ? '<path d="m5 12 4 4L19 6"/>' : '<path d="M12 5v14M5 12h14"/>';
      return '<div class="firmante-persona' + (agregado ? ' ya-agregado' : '') + '"><button type="button" class="firmante-persona-agregar" aria-label="' + escapar((agregado ? 'Ya agregado: ' : 'Agregar como firmante: ') + p.nombre) + '" data-persona-nombre="' + escapar(p.nombre) + '" data-persona-correo="' + escapar(p.correo) + '"' + (agregado ? ' disabled' : '') + '><span class="firmante-persona-avatar" aria-hidden="true">' + escapar(iniciales) + '</span><span class="firmante-persona-texto"><span class="firmante-persona-linea"><span class="firmante-persona-nombre">' + escapar(p.nombre) + '</span>' + (p.etiqueta ? '<span class="firmante-persona-etiqueta">' + escapar(p.etiqueta) + '</span>' : '') + '</span><small>' + escapar(p.correo || 'Sin correo capturado') + '</small></span><svg class="firmante-persona-estado" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' + icono + '</svg></button>' + botonCorazon(p) + '</div>';
    }).join('');
  }
  function pintar() {
    var posibles = document.getElementById('posibles-firmantes-lista');
    var vistos = new Set();
    var personas = base.concat(candidatos).filter(function (p) {
      var clave = correo(p.correo) || buscar(p.nombre);
      if (!clave || vistos.has(clave)) return false;
      vistos.add(clave); return true;
    });
    var busquedaPosibles = document.getElementById('posibles-firmantes-buscar');
    var filtroPosibles = buscar(busquedaPosibles && busquedaPosibles.value);
    var filtrarPosibles = globalThis.kwBusquedaPortal?.preparar(filtroPosibles);
    var total = document.getElementById('posibles-firmantes-total');
    if (total) { total.textContent = String(personas.length); total.setAttribute('aria-label', personas.length + ' posibles firmantes'); }
    if (posibles) posibles.innerHTML = filas(personas.filter(function (p) { return filtrarPosibles?.coincide([p.nombre, p.etiqueta], [p.correo]) ?? buscar(p.nombre + ' ' + p.correo + ' ' + (p.etiqueta || '')).includes(filtroPosibles); })) || '<div class="firmante-persona-vacio">' + (filtroPosibles ? 'Sin coincidencias.' : 'No hay personas capturadas en este documento.') + '</div>';
    var lista = document.getElementById('favoritos-firmantes-lista'), buscador = document.getElementById('favoritos-firmantes-buscar');
    var q = buscar(buscador && buscador.value);
    var filtrarFavoritos = globalThis.kwBusquedaPortal?.preparar(q);
    if (lista) lista.innerHTML = filas(favoritos.filter(function (p) { return filtrarFavoritos?.coincide(p.nombre, [p.correo]) ?? buscar(p.nombre + ' ' + p.correo).includes(q); }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); })) || '<div class="firmante-persona-vacio">' + (errorCarga ? 'No se pudieron cargar tus Favoritos.' : q ? 'Sin coincidencias.' : 'Marca un corazón para guardar un firmante.') + '</div>';
    document.querySelectorAll('#firmantes .firmante-fila').forEach(function (fila) {
      var boton = fila.querySelector('.firmante-favorito-fila');
      if (!boton) return;
      var email = correo(fila.querySelector('.firmante-mail').value), activo = esFavorito(email);
      boton.classList.toggle('pendiente', pendientes.has(email));
      boton.setAttribute('aria-busy', String(pendientes.has(email)));
      boton.classList.toggle('activo', activo);
      boton.setAttribute('aria-pressed', String(activo));
      boton.setAttribute('aria-label', activo ? 'Quitar de Favoritos' : 'Guardar en Favoritos');
    });
  }
  async function iniciar(opciones) {
    userId = opciones.userId; adaptador = opciones; favoritos = []; errorCarga = false;
    try {
      var resultado = await global.kwSupabase.from('firmas_favoritos_personales').select('nombre,correo').eq('user_id', userId).order('nombre');
      if (!resultado.error) favoritos = resultado.data || [];
      else errorCarga = true;
    } catch { errorCarga = true; }
    pintar();
  }
  document.addEventListener('click', function (event) {
    var favorito = event.target.closest('.firmante-favorito');
    if (favorito) {
      var fila = favorito.closest('.firmante-fila');
      alternar(fila ? { nombre: fila.querySelector('.firmante-nom').value, correo: fila.querySelector('.firmante-mail').value }
        : { nombre: favorito.dataset.favoritoNombre, correo: favorito.dataset.favoritoCorreo });
      return;
    }
    var agregar = event.target.closest('.firmante-persona-agregar');
    if (agregar && adaptador) { adaptador.agregar(agregar.dataset.personaNombre, agregar.dataset.personaCorreo); pintar(); }
  });
  document.addEventListener('input', function (event) {
    if (event.target.id === 'favoritos-firmantes-buscar' || event.target.id === 'posibles-firmantes-buscar' || event.target.closest('#firmantes')) pintar();
  });
  global.kwFirmantesPersonales = {
    iniciar: iniciar, actualizar: pintar, corazon: corazon,
    base: function (personas) { base = Array.isArray(personas) ? personas : []; pintar(); },
    candidatos: function (personas) { candidatos = Array.isArray(personas) ? personas : []; pintar(); }
  };
})(window);
