(function (global) {
  'use strict';
  function normalizar(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function tipoValidado(tipo, titulo) {
    var texto = normalizar(titulo);
    var palabra = /\b(casas?|residencias?|townhouses?|departamentos?|departametos?|deptos?|dptos?|depas?|ph|penthouses?|penhouses?|terrenos?|lotes?|oficinas?|consultorios?|coworking|local(?:es)?|bodegas?|duplex|naves?|edificios?|ranchos?|estacionamientos?)\b/.exec(texto);
    function canonico(valor) {
      if (/^(casa|residencia|townhouse)/.test(valor)) return 'Casa';
      if (/^(departamento|departameto|depto|dpto|depa|ph$|penthouse|penhouse)/.test(valor)) return 'Departamento';
      if (/^(terreno|lote)/.test(valor)) return 'Terreno';
      if (/^(oficina|consultorio|coworking)/.test(valor)) return 'Oficina';
      if (/^local/.test(valor)) return 'Local comercial';
      if (/^bodega/.test(valor)) return 'Bodega';
      if (/^duplex/.test(valor)) return 'Duplex';
      if (/^nave/.test(valor)) return 'Nave industrial';
      if (/^edificio/.test(valor)) return 'Edificio';
      if (/^rancho/.test(valor)) return 'Rancho';
      if (/^estacionamiento/.test(valor)) return 'Estacionamiento';
      return '';
    }
    // El uso anunciado prevalece sobre una clasificación incorrecta del proveedor.
    if (/\b(casa|residencia)\b.{0,60}\b(adaptada|habilitada|acondicionada|uso)\b.{0,25}\b(oficinas?|comercial)\b/.test(texto)) return 'Oficina';
    if (palabra && !/\b(calle|colonia|avenida|cerca de|frente a|junto a)\b/.test(texto.slice(0,palabra.index))) return canonico(palabra[0]);
    return canonico(normalizar(tipo));
  }
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
    var tipo = tipoValidado(propiedad.tipo,propiedad.titulo);
    if (!cliente.tipos.includes(tipo)) return null;
    if (normalizar(cliente.estado) !== normalizar(propiedad.estado)) return null;
    if (propiedad.moneda && propiedad.moneda !== cliente.moneda) return null;
    var criterios = [], total = 0, puntos = 0;
    function agregar(nombre, peso, cumple, detalle) { total += peso; puntos += peso * cumple; criterios.push({ nombre: nombre, peso: peso, aporte: peso * cumple, cumple: cumple === 1, parcial: cumple > 0 && cumple < 1, detalle: detalle }); }
    var precio = Number(propiedad.precio), minimo = Number(cliente.precio_min || 0), maximo = Number(cliente.precio_max);
    var conocido = propiedad.moneda === cliente.moneda && precio > 0;
    var excedente = conocido && maximo > 0 ? Math.max(0,precio / maximo - 1) : 1;
    var puntosPrecio = conocido ? Math.max(0,30 - 300 * excedente) : 0;
    agregar('Presupuesto',30,puntosPrecio / 30,!conocido ? 'Precio o moneda sin información' : precio < minimo ? 'Por debajo del mínimo solicitado' : excedente === 0 ? 'Dentro del presupuesto' : 'Supera el máximo en ' + (100 * excedente).toFixed(1) + '%');
    var z = zonas(cliente), lugar = ubicacion(cliente,propiedad);
    var pesoMunicipio = z.municipios.length ? (z.colonias.length ? 20 : 50) : 0;
    var pesoColonia = z.colonias.length ? (z.municipios.length ? 30 : 50) : 0;
    if (!pesoMunicipio && !pesoColonia) agregar('Ciudad / estado',50,1,propiedad.estado);
    agregar('Alcaldía / municipio',pesoMunicipio,lugar.municipio ? 1 : 0,!z.municipios.length ? 'Cualquiera' : propiedad.municipio || 'Sin información');
    agregar('Colonia',pesoColonia,lugar.colonia ? 1 : 0,!z.colonias.length ? 'Cualquiera' : (propiedad.colonia || 'Sin información') + (lugar.colonia ? ' · colonia elegida' : ' · fuera de las colonias elegidas'));
    var especificaciones = true;
    var caracteristicas = [['recamaras_min','recamaras','Recámaras'],['banos_min','banos','Baños'],['estacionamientos_min','estacionamientos','Estacionamientos'],['superficie_min','m2_construccion','Superficie']];
    var etiquetas = String(cliente.notas || '').split(/[\n,;]+/).map(function (t) { return t.trim(); }).filter(Boolean);
    var requisitos = caracteristicas.filter(function(c) { return Number(cliente[c[0]]) > 0; }).length;
    var pesoCaracteristicas = etiquetas.length ? 15 : 20;
    caracteristicas.forEach(function (c) {
      var valor = propiedad[c[1]];
      if (c[0] === 'superficie_min' && tipo === 'Terreno') valor = propiedad.m2_terreno;
      var libre = cliente[c[0]] == null || Number(cliente[c[0]]) === 0;
      if (!libre && (valor == null || Number(valor) < Number(cliente[c[0]]))) especificaciones = false;
      agregar(c[2],libre ? 0 : pesoCaracteristicas / requisitos,libre || (valor != null && Number(valor) >= Number(cliente[c[0]])) ? 1 : 0,libre ? 'Cualquiera' : 'Requerido ' + cliente[c[0]] + (c[0] === 'superficie_min' ? ' m²' : '') + ' · tiene ' + (valor == null ? 'sin información' : String(valor) + (c[0] === 'superficie_min' ? ' m²' : '')));
    });
    var descripcion = ' ' + normalizar([propiedad.titulo,propiedad.descripcion].concat(propiedad.caracteristicas || []).join(' ')) + ' ';
    if (!etiquetas.length) agregar('Características específicas',0,1,'Cualquiera');
    etiquetas.forEach(function (etiqueta) {
      var termino = normalizar(etiqueta), encontrado = termino && descripcion.includes(' ' + termino + ' ');
      if (descripcion.includes(' sin ' + termino + ' ') || descripcion.includes(' no cuenta con ' + termino + ' ') || descripcion.includes(' no tiene ' + termino + ' ')) encontrado = false;
      agregar(etiqueta,(requisitos ? 5 : 20) / etiquetas.length,encontrado ? 1 : 0,encontrado ? 'Mencionado en la descripción' : propiedad.descripcion ? 'No confirmado en la descripción' : 'Descripción no disponible');
    });
    var porcentaje = Math.round(100 * puntos / total);
    var enZona = lugar.municipio && lugar.colonia;
    var enPresupuesto = conocido && precio <= maximo && precio >= minimo;
    var cercana = !enZona && propiedad.distancia_km != null && Number(propiedad.distancia_km) >= 0 && Number(propiedad.distancia_km) <= 2;
    var categoria = enZona && enPresupuesto && especificaciones && porcentaje >= 80 ? 'fuertes' :
      !enZona && enPresupuesto && especificaciones &&
        100 * (puntos + (lugar.municipio ? 0 : pesoMunicipio) + (lugar.colonia ? 0 : pesoColonia)) / total >= 80 ? (cercana ? 'zonas_cercanas' : 'otras_zonas') :
      enZona && enPresupuesto ? 'otras_caracteristicas' :
      enZona && conocido && especificaciones && precio >= minimo && excedente > 0 && excedente <= .10000001 && 100 * (puntos - puntosPrecio + 30) / total >= 80 ? 'otro_presupuesto' : null;
    if (!categoria) return null;
    criterios.forEach(function (c) { c.peso = Math.round(1000 * c.peso / total) / 10; c.aporte = Math.round(1000 * c.aporte / total) / 10; });
    return { porcentaje: categoria === 'fuertes' ? porcentaje : Math.min(79,porcentaje), categoria:categoria, criterios: criterios };
  }
  global.kwCompradorMatches = { evaluar: evaluar, zonas:zonas, ubicacion:ubicacion, tipoValidado:tipoValidado };
})(typeof window === 'undefined' ? globalThis : window);
