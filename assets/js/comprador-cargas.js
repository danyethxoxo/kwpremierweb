(function (global) {
  'use strict';
  var cache = new Map(), vuelos = new Map();
  async function pagina(sb, perfil, version, nivel, offset) {
    var clave = [perfil,version,nivel,offset].join('|');
    if (cache.has(clave)) return cache.get(clave);
    if (vuelos.has(clave)) return vuelos.get(clave);
    var tarea = (async function () {
      for (var intento = 0; intento < 3; intento++) {
        var controlador = new AbortController();
        var timer = setTimeout(function () { controlador.abort(); },12000);
        try {
          var respuesta = await sb.rpc('comprador_matches_pagina',{p_perfil:perfil,p_nivel:nivel,p_offset:offset}).abortSignal(controlador.signal);
          if (respuesta.error) {
            var error = new Error(respuesta.error.message || 'No se pudo cargar la página');
            error.code = respuesta.error.code; error.status = respuesta.status; throw error;
          }
          var filas = respuesta.data || [];
          cache.set(clave,filas);
          if (cache.size > 100) cache.delete(cache.keys().next().value);
          return filas;
        } catch (error) {
          if (intento === 2 || error.status === 401 || error.status === 403 || error.code === '42501') throw error;
          await new Promise(function (resolve) { setTimeout(resolve,400*(intento+1)); });
        } finally { clearTimeout(timer); }
      }
    })();
    vuelos.set(clave,tarea);
    try { return await tarea; } finally { vuelos.delete(clave); }
  }
  global.kwCompradorCargas = {pagina:pagina};
})(typeof window === 'undefined' ? globalThis : window);
