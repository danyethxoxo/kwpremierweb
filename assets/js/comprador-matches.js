(function (global) {
  'use strict';
  function normalizar(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function zonas(cliente) {
    return {
      municipios: Array.isArray(cliente.municipios) ? cliente.municipios : cliente.municipio ? [cliente.municipio] : [],
      colonias: Array.isArray(cliente.colonias_seleccionadas) ? cliente.colonias_seleccionadas : cliente.colonias ? [{estado:cliente.estado,municipio:cliente.municipio,colonia:cliente.colonias}] : []
    };
  }
  function ubicacion(cliente, propiedad) {
    var z = zonas(cliente);
    var municipio = !z.municipios.length || z.municipios.some(function (m) { return normalizar(m) === normalizar(propiedad.municipio); });
    var colonia = !z.colonias.length || z.colonias.some(function (c) {
      return normalizar(c.colonia) === normalizar(propiedad.colonia) && (!c.municipio || normalizar(c.municipio) === normalizar(propiedad.municipio)) && (!c.estado || normalizar(c.estado) === normalizar(propiedad.estado));
    });
    return {municipio:municipio,colonia:colonia};
  }
  function evaluar(cliente, propiedad) {
    if (propiedad.estatus !== 'publicada' || propiedad.operacion !== cliente.operacion) return null;
    if (!cliente.tipos.some(function (t) { return (propiedad.tipos_filtro || [propiedad.tipo]).includes(t); })) return null;
    // El tipo real manda: una casa mencionada como uso posible no convierte una oficina en vivienda.
    if (!cliente.tipos.some(function (t) { return normalizar(t) === normalizar(propiedad.tipo); })) return null;
    if (normalizar(cliente.estado) !== normalizar(propiedad.estado)) return null;
    if (propiedad.moneda && propiedad.moneda !== cliente.moneda) return null;
    var criterios = [], total = 0, puntos = 0;
    function agregar(nombre, peso, cumple, detalle) { total += peso; puntos += peso * cumple; criterios.push({ nombre: nombre, peso: peso, aporte: peso * cumple, cumple: cumple === 1, parcial: cumple > 0 && cumple < 1, detalle: detalle }); }
    var precio = Number(propiedad.precio), minimo = Number(cliente.precio_min || 0), maximo = Number(cliente.precio_max);
    var conocido = propiedad.moneda === cliente.moneda && precio > 0;
    var excedente = conocido && maximo > 0 ? Math.max(0,precio / maximo - 1) : 1;
    var puntosPrecio = conocido ? Math.max(0,40 - 250 * excedente) : 0;
    agregar('Presupuesto',40,puntosPrecio / 40,!conocido ? 'Precio o moneda sin información' : precio < minimo ? 'Por debajo del mínimo: ahorro, sin penalización' : excedente === 0 ? 'Dentro del presupuesto' : 'Supera el máximo en ' + (100 * excedente).toFixed(1) + '%');
    var z = zonas(cliente), lugar = ubicacion(cliente,propiedad);
    agregar('Alcaldía / municipio',10,lugar.municipio ? 1 : 0,!z.municipios.length ? 'Sin restricción' : propiedad.municipio || 'Sin información');
    agregar('Colonia',20,lugar.colonia ? 1 : 0,!z.colonias.length ? 'Sin restricción' : (propiedad.colonia || 'Sin información') + (lugar.colonia ? ' · colonia elegida' : ' · fuera de las colonias elegidas'));
    var especificaciones = true;
    var caracteristicas = [['recamaras_min','recamaras','Recámaras'],['banos_min','banos','Baños'],['estacionamientos_min','estacionamientos','Estacionamientos'],['superficie_min','m2_construccion','Superficie']];
    caracteristicas.forEach(function (c) {
      var valor = propiedad[c[1]];
      if (c[0] === 'superficie_min' && cliente.tipos.every(function (t) { return t === 'Terreno'; })) valor = propiedad.m2_terreno;
      var libre = cliente[c[0]] == null || Number(cliente[c[0]]) === 0;
      if (!libre && (valor == null || Number(valor) < Number(cliente[c[0]]))) especificaciones = false;
      agregar(c[2],5,libre || (valor != null && Number(valor) >= Number(cliente[c[0]])) ? 1 : 0,libre ? 'Sin requisito' : 'Requerido ' + cliente[c[0]] + (c[0] === 'superficie_min' ? ' m²' : '') + ' · tiene ' + (valor == null ? 'sin información' : String(valor) + (c[0] === 'superficie_min' ? ' m²' : '')));
    });
    var etiquetas = String(cliente.notas || '').split(/[\n,;]+/).map(function (t) { return t.trim(); }).filter(Boolean);
    var descripcion = ' ' + normalizar([propiedad.titulo,propiedad.descripcion].concat(propiedad.caracteristicas || []).join(' ')) + ' ';
    if (!etiquetas.length) agregar('Características específicas',10,1,'Sin etiquetas solicitadas');
    etiquetas.forEach(function (etiqueta) {
      var termino = normalizar(etiqueta), encontrado = termino && descripcion.includes(' ' + termino + ' ');
      if (descripcion.includes(' sin ' + termino + ' ') || descripcion.includes(' no cuenta con ' + termino + ' ') || descripcion.includes(' no tiene ' + termino + ' ')) encontrado = false;
      agregar(etiqueta,10 / etiquetas.length,encontrado ? 1 : 0,encontrado ? 'Mencionado en la descripción' : propiedad.descripcion ? 'No confirmado en la descripción' : 'Descripción no disponible');
    });
    criterios.forEach(function (c) { c.peso = Math.round(1000 * c.peso / total) / 10; c.aporte = Math.round(1000 * c.aporte / total) / 10; });
    var porcentaje = Math.round(100 * puntos / total);
    var enZona = lugar.municipio && lugar.colonia;
    var enPresupuesto = conocido && precio <= maximo && precio >= minimo;
    var categoria = enZona && enPresupuesto && especificaciones && porcentaje >= 80 ? 'fuertes' :
      !enZona && enPresupuesto && especificaciones &&
        puntos + (lugar.municipio ? 0 : 10) + (lugar.colonia ? 0 : 20) >= 80 ? 'otras_zonas' :
      enZona && enPresupuesto ? 'otras_caracteristicas' :
      enZona && conocido && especificaciones && precio >= minimo && excedente > 0 && excedente <= .10000001 && puntos - puntosPrecio + 40 >= 80 ? 'otro_presupuesto' : null;
    if (!categoria) return null;
    return { porcentaje: categoria === 'fuertes' ? porcentaje : Math.min(79,porcentaje), categoria:categoria, criterios: criterios };
  }
  global.kwCompradorMatches = { evaluar: evaluar, zonas:zonas, ubicacion:ubicacion };
})(typeof window === 'undefined' ? globalThis : window);
