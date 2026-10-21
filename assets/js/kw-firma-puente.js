(function (global) {
  'use strict';

  var DB = 'kw-documentos-pendientes';
  var STORE = 'firmas';
  var CLAVE = 'actual';
  var VIGENCIA = 2 * 60 * 60 * 1000;

  function detectarFirmantes(campos) {
    var valores = Object.create(null);
    Object.keys(campos || {}).forEach(function (id) {
      if (typeof campos[id] === 'string') valores[id.replace(/^(?:f-|com-)/, '').replace(/-/g, '_').toLowerCase()] = campos[id].trim();
    });
    var personas = [], vistos = new Set();
    Object.keys(valores).forEach(function (id) {
      if (!/^(?:cliente(?:_?\d+)?|cli\d+_nombre|asesor(?:_(?:envia|recibe))?|agente|(?:vendedor|comprador|propietario|arrendador|arrendatario|fiador|obligado)(?:_nombre)?)$/.test(id)) return;
      var nombre = valores[id];
      if (!nombre || nombre.includes('@')) return;
      var base = id.replace(/_nombre$/, '');
      var correos = [base + '_correo', base + '_email', 'correo_' + base, 'email_' + base];
      if (/^asesor_(envia|recibe)$/.test(id)) correos.unshift(id.replace('asesor_', 'correo_'), id.replace('asesor_', 'contacto_'));
      var correo = correos.map(function (key) { return valores[key] || ''; }).find(function (valor) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor); }) || '';
      correo = correo.toLowerCase();
      var clave = correo || nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (!vistos.has(clave)) { vistos.add(clave); personas.push({ nombre: nombre, correo: correo }); }
    });
    if (Array.isArray(campos && campos.clientes)) campos.clientes.forEach(function (cliente) {
      if (!cliente || typeof cliente !== 'object') return;
      detectarFirmantes(Object.assign({}, cliente, { cliente: cliente.cliente || cliente.nombre || '', correo_cliente: cliente.correo_cliente || cliente.correo || cliente.email || '' })).forEach(function (persona) {
        var clave = persona.correo || persona.nombre.toLowerCase();
        if (!vistos.has(clave)) { vistos.add(clave); personas.push(persona); }
      });
    });
    return personas;
  }

  function firmantesDelFormulario() {
    var campos = Object.create(null);
    document.querySelectorAll('input[id], textarea[id]').forEach(function (campo) {
      if (campo.type !== 'hidden') campos[campo.id] = campo.value;
    });
    return detectarFirmantes(campos);
  }

  function abrir() {
    return new Promise(function (resolve, reject) {
      var pedido = indexedDB.open(DB, 1);
      pedido.onupgradeneeded = function () {
        if (!pedido.result.objectStoreNames.contains(STORE)) {
          pedido.result.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      pedido.onsuccess = function () { resolve(pedido.result); };
      pedido.onerror = function () { reject(pedido.error || new Error('No se pudo preparar el documento.')); };
    });
  }

  async function guardar(blob, nombre, datos) {
    if (!(blob instanceof Blob) || blob.type !== 'application/pdf') {
      throw new Error('No se pudo preparar un PDF válido para firma.');
    }
    var db = await abrir();
    await new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({
        id: CLAVE,
        blob: blob,
        nombre: nombre || 'documento.pdf',
        documentoId: datos && datos.documentoId || null,
        revision: datos && datos.revision || 0,
        folio: datos && datos.folio || null,
        posiblesFirmantes: firmantesDelFormulario(),
        creadoAt: Date.now()
      });
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error || new Error('No se pudo transferir el PDF.')); };
    });
    db.close();
  }

  async function consumir() {
    var db = await abrir();
    var registro = await new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite');
      var almacen = tx.objectStore(STORE);
      var pedido = almacen.get(CLAVE);
      pedido.onsuccess = function () {
        var valor = pedido.result || null;
        almacen.delete(CLAVE);
        resolve(valor);
      };
      pedido.onerror = function () { reject(pedido.error); };
    });
    db.close();
    if (!registro || Date.now() - Number(registro.creadoAt || 0) > VIGENCIA) return null;
    return registro;
  }

  global.kwFirmaPuente = { guardar: guardar, consumir: consumir, detectarFirmantes: detectarFirmantes };
})(window);
