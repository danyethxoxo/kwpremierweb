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
    var precio = Number(propiedad.precio), minimo = Number(cliente.precio_min || 0), maximo = Number(cliente.precio_max);
    var conocido = propiedad.moneda === cliente.moneda && precio > 0;
    var excedente = conocido && maximo > 0 ? Math.max(0,precio / maximo - 1) : 1;
    var puntosPrecio = conocido ? Math.max(0,40 - 250 * excedente) : 0;
    agregar('Presupuesto',40,puntosPrecio / 40,!conocido ? 'Precio o moneda sin información' : precio < minimo ? 'Por debajo del mínimo: ahorro, sin penalización' : excedente === 0 ? 'Dentro del presupuesto' : 'Supera el máximo en ' + (100 * excedente).toFixed(1) + '%');
    agregar('Alcaldía / municipio',10,!cliente.municipio || normalizar(cliente.municipio) === normalizar(propiedad.municipio) ? 1 : 0,!cliente.municipio ? 'Sin restricción' : propiedad.municipio || 'Sin información');
    var coloniaExacta = normalizar(cliente.colonias) === normalizar(propiedad.colonia);
    var origen = global.kwColonias && global.kwColonias.buscar(cliente.estado,cliente.municipio,cliente.colonias);
    var destino = global.kwColonias && global.kwColonias.buscar(propiedad.estado,propiedad.municipio,propiedad.colonia);
    var distancia = origen && destino ? global.kwColonias.distancia(origen,destino) : null;
    var colindante = !coloniaExacta && distancia !== null && distancia <= 2;
    agregar('Colonia',20,!cliente.colonias || coloniaExacta ? 1 : colindante ? .6 : 0,!cliente.colonias ? 'Sin restricción' : coloniaExacta ? propiedad.colonia + ' · colonia exacta' : (propiedad.colonia || 'Sin información') + (distancia !== null ? ' · distancia aproximada entre colonias: ' + distancia.toFixed(2) + ' km' : ' · sin coordenadas de referencia para evaluar cercanía'));
    var caracteristicas = [['recamaras_min','recamaras','Recámaras'],['banos_min','banos','Baños'],['estacionamientos_min','estacionamientos','Estacionamientos'],['superficie_min','m2_construccion','Superficie']];
    caracteristicas.forEach(function (c) {
      var valor = propiedad[c[1]];
      if (c[0] === 'superficie_min' && cliente.tipos.every(function (t) { return t === 'Terreno'; })) valor = propiedad.m2_terreno;
      var libre = cliente[c[0]] == null || Number(cliente[c[0]]) === 0;
      agregar(c[2],5,libre || (valor != null && Number(valor) >= Number(cliente[c[0]])) ? 1 : 0,libre ? 'Sin requisito' : 'Requerido ' + cliente[c[0]] + (c[0] === 'superficie_min' ? ' m²' : '') + ' · tiene ' + (valor == null ? 'sin información' : String(valor) + (c[0] === 'superficie_min' ? ' m²' : '')));
    });
    var etiquetas = String(cliente.notas || '').split(/[\n,;]+/).map(function (t) { return t.trim(); }).filter(Boolean);
    var descripcion = ' ' + normalizar(propiedad.descripcion) + ' ';
    if (!etiquetas.length) agregar('Características específicas',10,1,'Sin etiquetas solicitadas');
    etiquetas.forEach(function (etiqueta) {
      var termino = normalizar(etiqueta), encontrado = termino && descripcion.includes(' ' + termino + ' ');
      if (descripcion.includes(' sin ' + termino + ' ') || descripcion.includes(' no cuenta con ' + termino + ' ') || descripcion.includes(' no tiene ' + termino + ' ')) encontrado = false;
      agregar(etiqueta,10 / etiquetas.length,encontrado ? 1 : 0,encontrado ? 'Mencionado en la descripción' : propiedad.descripcion ? 'No confirmado en la descripción' : 'Descripción no disponible');
    });
    criterios.forEach(function (c) { c.peso = Math.round(1000 * c.peso / total) / 10; c.aporte = Math.round(1000 * c.aporte / total) / 10; });
    return { porcentaje: Math.round(100 * puntos / total), criterios: criterios };
  }
  global.kwCompradorMatches = { evaluar: evaluar };
})(typeof window === 'undefined' ? globalThis : window);
