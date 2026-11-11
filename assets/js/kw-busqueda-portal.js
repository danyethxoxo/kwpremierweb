(function (global) {
  'use strict';

  const conectores = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'un', 'una', 'en', 'con', 'por', 'para', 'todos', 'todas', 'busca', 'buscar', 'muestra', 'muestrame', 'ver']);
  const palabras = /[\p{L}\p{N}]+(?:[.@+_/-][\p{L}\p{N}]+)*/gu;
  const soloLetras = /^\p{L}+$/u;
  const codigo = /[\d@]/;
  const equivalencias = new Map([
    ['dictamenes', 'dictamen'], ['firmas', 'firma'], ['documentos', 'documento'],
    ['asesores', 'asesor'], ['usuarios', 'usuario'], ['pendientes', 'pendiente'],
    ['aprobados', 'aprobado'], ['autorizados', 'autorizado'], ['devueltos', 'devuelto'],
    ['borradores', 'borrador'], ['contratos', 'contrato'],
    ['firmadas', 'firmado'], ['firmados', 'firmado'], ['arrendamiento', 'renta'],
  ]);

  function normalizar(valor) {
    return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function tokens(texto) {
    return (texto.match(palabras) || []).flatMap(palabra => codigo.test(palabra)
      ? [palabra] : palabra.split(/[.@+_/-]/));
  }

  // Admite una letra insertada, omitida, sustituida o dos letras contiguas invertidas.
  function unDedazo(consulta, palabra) {
    if (Math.abs(consulta.length - palabra.length) > 1) return false;
    let i = 0;
    while (i < consulta.length && consulta[i] === palabra[i]) i++;
    if (consulta.length === palabra.length) {
      return consulta.slice(i + 1) === palabra.slice(i + 1) ||
        (consulta[i] === palabra[i + 1] && consulta[i + 1] === palabra[i] &&
         consulta.slice(i + 2) === palabra.slice(i + 2));
    }
    const larga = consulta.length > palabra.length ? consulta : palabra;
    const corta = consulta.length > palabra.length ? palabra : consulta;
    return larga.slice(i + 1) === corta.slice(i);
  }

  function preparar(consulta) {
    const literal = normalizar(consulta);
    const originales = tokens(literal);
    const significativas = originales.filter(palabra => !conectores.has(palabra));
    const terminos = (significativas.length ? significativas : originales)
      .map(palabra => equivalencias.get(palabra) || palabra);
    const erroresPorPalabra = new Map();

    function puntuar(campos, identificadores = []) {
      if (!literal) return 0;
      const texto = normalizar(Array.isArray(campos) ? campos.join(' ') : campos);
      const exactos = normalizar(identificadores.join(' '));
      const conjunto = texto + ' ' + exactos;
      if (conjunto.includes(literal)) return 0;
      if (!terminos.length) return Infinity;
      let pendientes = terminos.filter(palabra => !conjunto.includes(palabra));
      if (!pendientes.length) return 1;
      const palabrasTexto = texto.replace(/\S*@\S*/g, ' ').match(/[\p{L}\p{N}]+/gu) || [];
      const variantes = new Set(palabrasTexto.map(palabra => equivalencias.get(palabra) || palabra));
      pendientes = pendientes.filter(palabra => !variantes.has(palabra));
      if (!pendientes.length) return 1;
      if (pendientes.some(palabra => palabra.length < 4 || palabra.length > 40 || !soloLetras.test(palabra))) return Infinity;
      const vocabulario = palabrasTexto.filter(palabra => soloLetras.test(palabra) && palabra.length >= 4);
      for (const consulta of pendientes) {
        if (!erroresPorPalabra.has(consulta)) erroresPorPalabra.set(consulta, new Map());
        const cache = erroresPorPalabra.get(consulta);
        const coincide = vocabulario.some(palabra => {
          if (!cache.has(palabra)) cache.set(palabra, unDedazo(consulta, palabra));
          return cache.get(palabra);
        });
        if (!coincide) return Infinity;
      }
      return 2 + pendientes.length;
    }

    function filtrar(filas, campos, identificadores = () => []) {
      let mejor = Infinity;
      let halladas = [];
      for (const fila of filas) {
        const puntos = puntuar(campos(fila), identificadores(fila));
        if (!Number.isFinite(puntos)) continue;
        const nivel = puntos <= 1 ? 0 : puntos;
        if (nivel < mejor) {
          mejor = nivel;
          halladas = [];
        }
        if (nivel === mejor) halladas.push(fila);
      }
      return halladas;
    }

    return { puntuar, filtrar, coincide: (campos, identificadores) => Number.isFinite(puntuar(campos, identificadores)) };
  }

  global.kwBusquedaPortal = Object.freeze({ preparar });
})(window);
