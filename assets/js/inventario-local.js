(function (global) {
  'use strict';
  var ESQUEMA = 1;
  var CAMPOS = 'id,fuente_id,titulo,descripcion,operacion,estatus,tipo,tipos_filtro,precio,moneda,recamaras,banos,estacionamientos,m2_construccion,m2_terreno,estado,municipio,colonia,imagenes,asesor_nombre,market_center,enlace_kw,updated_at';
  var vuelos = new Map();
  function abrir() {
    return new Promise(function (resolve,reject) {
      if (!global.indexedDB) { reject(new Error('Almacenamiento local no disponible')); return; }
      var terminado = false, request;
      var timer = setTimeout(function () { terminado = true; reject(new Error('Almacenamiento local bloqueado')); },3000);
      try { request = global.indexedDB.open('kw-inventario-local',1); } catch (error) { clearTimeout(timer); reject(error); return; }
      request.onupgradeneeded = function () { if (!request.result.objectStoreNames.contains('catalogos')) request.result.createObjectStore('catalogos'); };
      request.onerror = function () { clearTimeout(timer); terminado = true; reject(request.error); };
      request.onsuccess = function () {
        clearTimeout(timer);
        if (terminado) { request.result.close(); return; }
        terminado = true;
        request.result.onversionchange = function () { request.result.close(); };
        resolve(request.result);
      };
    });
  }
  async function leer(usuario) {
    var db = await abrir();
    return new Promise(function (resolve,reject) {
      var tx = db.transaction('catalogos','readonly'), req = tx.objectStore('catalogos').get(usuario);
      tx.oncomplete = function () { db.close(); resolve(req.result || null); };
      tx.onabort = tx.onerror = function () { db.close(); reject(tx.error || new Error('No se pudo leer la caché')); };
    });
  }
  async function guardar(usuario,catalogo) {
    var db = await abrir();
    return new Promise(function (resolve,reject) {
      var tx = db.transaction('catalogos','readwrite'); tx.objectStore('catalogos').put(catalogo,usuario);
      tx.oncomplete = function () { db.close(); resolve(); };
      tx.onabort = tx.onerror = function () { db.close(); reject(tx.error || new Error('No se pudo guardar la caché')); };
    });
  }
  async function version(sb) {
    var res = await sb.from('propiedades_inventario').select('id,updated_at').eq('fuente','kwmexico')
      .order('updated_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).limit(1);
    if (res.error) throw res.error;
    return JSON.stringify([ESQUEMA,res.data]);
  }
  async function descargar(sb,estado) {
    var filas = [], desde = 0;
    while (true) {
      var res = await sb.from('propiedades_inventario').select(CAMPOS).eq('fuente','kwmexico').order('id').range(desde,desde+999);
      if (res.error) throw res.error;
      filas = filas.concat(res.data || []); estado('Descargando catálogo: ' + filas.length.toLocaleString('es-MX') + ' propiedades…');
      if (!res.data || res.data.length < 1000) break;
      desde += 1000;
    }
    return filas;
  }
  // Orquestación independiente del almacenamiento para poder probar todos los flujos.
  async function sincronizar(opciones) {
    var cache = await opciones.leer().catch(function () { return null; });
    var valida = cache && cache.esquema === ESQUEMA && Array.isArray(cache.filas) && typeof cache.version === 'string';
    if (valida) { opciones.datos(cache.filas); opciones.estado('Catálogo local · comprobando actualizaciones…'); }
    try {
      var actual = await opciones.version();
      if (valida && cache.version === actual) { opciones.estado('Catálogo local actualizado'); return cache.filas; }
      opciones.estado(valida ? 'Actualizando catálogo local…' : 'Preparando catálogo local…');
      var filas;
      // Si el inventario cambia durante la descarga, no etiquetar una copia mixta como actualizada.
      for (var intento = 0; intento < 2; intento++) {
        filas = await opciones.descargar();
        var final = await opciones.version();
        if (final === actual) break;
        actual = final; filas = null;
      }
      if (!filas) throw new Error('El inventario sigue cambiando; intenta de nuevo');
      var nuevo = { esquema: ESQUEMA, version: actual, filas: filas, guardado: Date.now() };
      var persistido = true;
      try { await opciones.guardar(nuevo); } catch (error) { persistido = false; }
      opciones.datos(filas);
      opciones.estado(persistido ? 'Catálogo local actualizado' : 'Catálogo actualizado · el navegador no permitió guardarlo');
      return filas;
    } catch (error) {
      if (!valida) throw error;
      opciones.estado('Usando catálogo guardado · no se pudo comprobar la actualización');
      return cache.filas;
    }
  }
  async function cargar(sb,callbacks) {
    var session = await sb.auth.getSession();
    var usuario = session.data && session.data.session && session.data.session.user.id;
    if (session.error || !usuario) throw new Error('Se requiere una sesión activa');
    var entrada = vuelos.get(usuario);
    if (!entrada) {
      entrada = { datos: null, estado: '', listeners: new Set(), promesa: null }; vuelos.set(usuario,entrada);
      entrada.promesa = sincronizar({
        leer: function () { return leer(usuario); }, guardar: function (c) { return guardar(usuario,c); },
        version: function () { return version(sb); }, descargar: function () { return descargar(sb,emitirEstado); },
        datos: emitirDatos, estado: emitirEstado
      }).catch(function (error) { vuelos.delete(usuario); throw error; });
      function emitirDatos(filas) { entrada.datos = filas; entrada.listeners.forEach(function (cb) { if (cb.datos) cb.datos(filas); }); }
      function emitirEstado(texto) { entrada.estado = texto; entrada.listeners.forEach(function (cb) { if (cb.estado) cb.estado(texto); }); }
    }
    entrada.listeners.add(callbacks);
    if (entrada.datos && callbacks.datos) callbacks.datos(entrada.datos);
    if (entrada.estado && callbacks.estado) callbacks.estado(entrada.estado);
    try { return await entrada.promesa; } finally { entrada.listeners.delete(callbacks); }
  }
  global.kwInventarioLocal = { cargar: cargar, sincronizar: sincronizar };
})(window);
