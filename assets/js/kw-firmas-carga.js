(function (global) {
  'use strict';

  // Una sola consulta activa; los avisos de Realtime se agrupan y los
  // resultados esperan a que termine la interacción antes de tocar la tabla.
  function crear(opciones) {
    var activa = null, temporizador = null, sucia = false;
    var pendiente = null, ultima = null;
    var espera = opciones.espera == null ? 750 : opciones.espera;

    function aplicarPendiente() {
      if (!pendiente || opciones.ocupado()) return;
      var siguiente = pendiente;
      pendiente = null;
      if (siguiente.clave === ultima) return;
      opciones.aplicar(siguiente.datos);
      ultima = siguiente.clave;
    }

    function cargar() {
      if (activa) return activa;
      clearTimeout(temporizador);
      temporizador = null;
      sucia = false;
      activa = Promise.resolve().then(opciones.leer).then(function (datos) {
        // Nunca vaciar la lista si falla una consulta.
        pendiente = { datos: datos, clave: opciones.clave(datos) };
        aplicarPendiente();
        return datos;
      }).catch(function (error) {
        opciones.error(error);
      }).finally(function () {
        activa = null;
        if (sucia) programar();
      });
      return activa;
    }

    function programar() {
      sucia = true;
      clearTimeout(temporizador);
      if (activa) return;
      temporizador = setTimeout(cargar, espera);
    }

    return { cargar: cargar, programar: programar, aplicarPendiente: aplicarPendiente };
  }

  global.kwFirmasCarga = { crear: crear };
})(typeof window === 'undefined' ? globalThis : window);
