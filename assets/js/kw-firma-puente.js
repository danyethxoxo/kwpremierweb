(function (global) {
  'use strict';

  var DB = 'kw-documentos-pendientes';
  var STORE = 'firmas';
  var CLAVE = 'actual';
  var VIGENCIA = 2 * 60 * 60 * 1000;

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

  global.kwFirmaPuente = { guardar: guardar, consumir: consumir };
})(window);
