(function (global) {
  'use strict';
  var userId = null, favoritos = [], candidatos = [], adaptador = null, errorCarga = false;
  var pendientes = new Set();
  function correo(valor) { return String(valor || '').trim().toLowerCase(); }
  function buscar(valor) { return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function escapar(valor) { return String(valor || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function esFavorito(email) { return favoritos.some(function (p) { return correo(p.correo) === correo(email); }); }
  var corazon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
  function botonCorazon(persona) {
    var activo = esFavorito(persona.correo);
    return '<button type="button" class="firmante-favorito' + (activo ? ' activo' : '') + '" aria-label="' + (activo ? 'Quitar de' : 'Guardar en') + ' firmantes frecuentes" aria-pressed="' + activo + '" data-favorito-correo="' + escapar(correo(persona.correo)) + '" data-favorito-nombre="' + escapar(persona.nombre) + '">' + corazon + '</button>';
  }
  async function alternar(persona) {
    var email = correo(persona.correo), nombre = String(persona.nombre || '').trim();
    if (!userId || pendientes.has(email)) return;
    if (!nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return global.kwUI.alert('Escribe el nombre y un correo válido antes de guardar al firmante.');
    }
    pendientes.add(email);
    try {
      var existe = esFavorito(email);
      var consulta = global.kwSupabase.from('firmas_favoritos_personales');
      var resultado = existe ? await consulta.delete().eq('user_id', userId).eq('correo', email)
        : await consulta.upsert({ user_id: userId, correo: email, nombre: nombre }, { onConflict: 'user_id,correo' });
      if (resultado.error) throw resultado.error;
      favoritos = favoritos.filter(function (f) { return correo(f.correo) !== email; });
      if (!existe) favoritos.push({ nombre: nombre, correo: email });
      pintar();
    } catch (error) { await global.kwUI.alert('No se pudo guardar el firmante frecuente. Intenta de nuevo.'); }
    finally { pendientes.delete(email); }
  }
  function filas(personas) {
    var puestos = adaptador ? adaptador.leer() : [];
    return personas.map(function (p) {
      var agregado = puestos.some(function (f) { return p.correo ? correo(f.correo) === correo(p.correo) : buscar(f.nombre) === buscar(p.nombre); });
      return '<div class="firmante-persona"><button type="button" class="firmante-persona-agregar" data-persona-nombre="' + escapar(p.nombre) + '" data-persona-correo="' + escapar(p.correo) + '"' + (agregado ? ' disabled' : '') + '><span>' + escapar(p.nombre) + '</span><small>' + escapar(p.correo || 'Sin correo capturado') + '</small></button>' + botonCorazon(p) + '</div>';
    }).join('');
  }
  function pintar() {
    var posibles = document.getElementById('posibles-firmantes-lista');
    if (posibles) posibles.innerHTML = filas(candidatos) || '<div class="firmante-persona-vacio">No hay personas capturadas en este documento.</div>';
    var lista = document.getElementById('favoritos-firmantes-lista'), buscador = document.getElementById('favoritos-firmantes-buscar');
    var q = buscar(buscador && buscador.value);
    if (lista) lista.innerHTML = filas(favoritos.filter(function (p) { return buscar(p.nombre + ' ' + p.correo).includes(q); }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); })) || '<div class="firmante-persona-vacio">' + (errorCarga ? 'No se pudieron cargar tus firmantes frecuentes.' : q ? 'Sin coincidencias.' : 'Marca un corazón para guardar un firmante.') + '</div>';
    document.querySelectorAll('#firmantes .firmante-fila').forEach(function (fila) {
      var boton = fila.querySelector('.firmante-favorito-fila');
      if (!boton) return;
      var activo = esFavorito(fila.querySelector('.firmante-mail').value);
      boton.classList.toggle('activo', activo);
      boton.setAttribute('aria-pressed', String(activo));
      boton.setAttribute('aria-label', activo ? 'Quitar de firmantes frecuentes' : 'Guardar en firmantes frecuentes');
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
    if (event.target.id === 'favoritos-firmantes-buscar' || event.target.closest('#firmantes')) pintar();
  });
  global.kwFirmantesPersonales = {
    iniciar: iniciar, actualizar: pintar, corazon: corazon,
    candidatos: function (personas) { candidatos = Array.isArray(personas) ? personas : []; pintar(); }
  };
})(window);
