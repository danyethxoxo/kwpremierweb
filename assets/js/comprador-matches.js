(function (global) {
  'use strict';
  function normalizar(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function evaluar(cliente, propiedad) {
    if (propiedad.estatus !== 'publicada' || propiedad.operacion !== cliente.operacion) return null;
    if (!cliente.tipos.some(function (t) { return (propiedad.tipos_filtro || [propiedad.tipo]).includes(t); })) return null;
    if (normalizar(cliente.estado) !== normalizar(propiedad.estado)) return null;
    if (propiedad.moneda && propiedad.moneda !== cliente.moneda) return null;
    var criterios = [], total = 0, puntos = 0;
    function agregar(nombre, peso, cumple, detalle) { total += peso; puntos += peso * cumple; criterios.push({ nombre: nombre, peso: peso, aporte: peso * cumple, cumple: cumple === 1, parcial: cumple > 0 && cumple < 1, detalle: detalle }); }
    agregar('Tipo de inmueble',20,1,propiedad.tipo || 'Tipo identificado por el título');
    var precio = Number(propiedad.precio), minimo = Number(cliente.precio_min || 0), maximo = Number(cliente.precio_max);
    var conocido = propiedad.moneda === cliente.moneda && precio > 0;
    var dentro = conocido && precio >= minimo && precio <= maximo;
    var cercano = conocido && precio > maximo && precio <= maximo * 1.1;
    agregar('Presupuesto',30,dentro ? 1 : cercano ? .5 : 0, !conocido ? 'Precio o moneda sin información' : dentro ? 'Dentro del presupuesto' : cercano ? 'Supera el máximo hasta un 10%' : 'Fuera del presupuesto');
    var pesoUbicacion = 30 / (1 + (cliente.municipio ? 1 : 0) + (cliente.colonias ? 1 : 0));
    agregar('Ciudad / estado',pesoUbicacion,1,propiedad.estado);
    if (cliente.municipio) agregar('Alcaldía / municipio',pesoUbicacion,normalizar(cliente.municipio) === normalizar(propiedad.municipio) ? 1 : 0,propiedad.municipio || 'Sin información');
    if (cliente.colonias) agregar('Colonia',pesoUbicacion,normalizar(cliente.colonias) === normalizar(propiedad.colonia) ? 1 : 0,propiedad.colonia || 'Sin información');
    var caracteristicas = [['recamaras_min','recamaras','Recámaras'],['banos_min','banos','Baños'],['estacionamientos_min','estacionamientos','Estacionamientos'],['superficie_min','m2_construccion','Superficie']].filter(function (c) { return cliente[c[0]] != null && Number(cliente[c[0]]) > 0; });
    caracteristicas.forEach(function (c) {
      var valor = propiedad[c[1]];
      if (c[0] === 'superficie_min' && cliente.tipos.every(function (t) { return t === 'Terreno'; })) valor = propiedad.m2_terreno;
      agregar(c[2],10 / caracteristicas.length,valor != null && Number(valor) >= Number(cliente[c[0]]) ? 1 : 0,valor == null ? 'Sin información' : String(valor) + ' · mínimo ' + cliente[c[0]]);
    });
    var etiquetas = String(cliente.notas || '').split(/[\n,;]+/).map(function (t) { return t.trim(); }).filter(Boolean);
    var descripcion = ' ' + normalizar(propiedad.descripcion) + ' ';
    etiquetas.forEach(function (etiqueta) {
      var termino = normalizar(etiqueta), encontrado = termino && descripcion.includes(' ' + termino + ' ');
      if (descripcion.includes(' sin ' + termino + ' ') || descripcion.includes(' no cuenta con ' + termino + ' ') || descripcion.includes(' no tiene ' + termino + ' ')) encontrado = false;
      agregar(etiqueta,10 / etiquetas.length,encontrado ? 1 : 0,encontrado ? 'Mencionado en la descripción' : propiedad.descripcion ? 'No confirmado en la descripción' : 'Descripción no disponible');
    });
    criterios.forEach(function (c) { c.peso = Math.round(1000 * c.peso / total) / 10; c.aporte = Math.round(1000 * c.aporte / total) / 10; });
    return { porcentaje: Math.round(100 * puntos / total), criterios: criterios };
  }
  global.kwCompradorMatches = { evaluar: evaluar };
})(window);
