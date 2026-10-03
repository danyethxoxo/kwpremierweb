(function (g) {
  function resumen(c,p,criterios) {
    var n = function (v) { return new Intl.NumberFormat('es-MX',{maximumFractionDigits:2}).format(v); };
    var normal = function(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); };
    var moneda = c.moneda || 'MXN', precio = Number(p.precio), presupuesto = Number(c.precio_max), grupos = [];
    var diferencia = precio-presupuesto;
    var dinero = new Intl.NumberFormat('es-MX',{style:'currency',currency:moneda,maximumFractionDigits:0});
    grupos.push({nombre:'Presupuesto',detalle:!precio || p.moneda !== moneda ? 'Precio en la moneda solicitada no confirmado' : diferencia === 0 ? 'Coincide con el presupuesto' : dinero.format(Math.abs(diferencia)) + ' ' + moneda + ' por ' + (diferencia > 0 ? 'encima' : 'debajo') + ' del presupuesto'});
    var municipio = !c.municipio || normal(c.municipio) === normal(p.municipio);
    var colonia = !c.colonias || normal(c.colonias) === normal(p.colonia);
    var cerca = (criterios || []).some(function(x) { return x.nombre === 'Colonia' && x.parcial; });
    grupos.push({nombre:'Zona',detalle:municipio && colonia ? 'En la zona deseada' : cerca ? 'Cerca de la zona deseada' : municipio ? 'En el municipio deseado; colonia diferente' : 'Fuera de la zona deseada'});
    var detalles = [['recamaras_min','recamaras','recámara','recámaras'],['banos_min','banos','baño','baños'],['estacionamientos_min','estacionamientos','lugar de estacionamiento','lugares de estacionamiento']].map(function(a) {
      var real = p[a[1]], deseado = Number(c[a[0]] || 0);
      if (real == null) return a[3] + ': sin información';
      var delta = Number(real)-deseado;
      if (!deseado) return a[1] === 'estacionamientos' ? Number(real) ? 'Cuenta con ' + n(real) + ' ' + (Number(real) === 1 ? a[2] : a[3]) : 'No cuenta con estacionamiento' : n(real) + ' ' + (Number(real) === 1 ? a[2] : a[3]);
      return delta === 0 ? 'Coinciden ' + (a[1] === 'recamaras' ? 'las recámaras' : a[1] === 'banos' ? 'los baños' : 'los estacionamientos') : n(Math.abs(delta)) + ' ' + (Math.abs(delta) === 1 ? a[2] : a[3]) + ' ' + (delta > 0 ? 'más' : 'menos') + ' de lo deseado';
    });
    grupos.push({nombre:'Características',detalle:detalles.join(' · ')});
    var terreno = c.tipos && c.tipos.length && c.tipos.every(function(t) { return t === 'Terreno'; });
    var area = terreno ? p.m2_terreno : p.m2_construccion, requerido = Number(c.superficie_min || 0), delta = Number(area)-requerido;
    grupos.push({nombre:'Tamaño',detalle:area == null ? 'Superficie no confirmada' : !requerido ? n(area) + ' m²; sin mínimo solicitado' : delta === 0 ? 'Coincide con la superficie deseada' : n(Math.abs(delta)) + ' m² ' + (delta > 0 ? 'más' : 'menos') + ' de lo deseado'});
    var particulares = String(c.notas || '').split(/[\n,;]+/).map(function(t) { return t.trim(); }).filter(Boolean);
    if (particulares.length) grupos.push({nombre:'Características particulares',detalle:particulares.map(function(t) { var encontrado = (criterios || []).find(function(x) { return normal(x.nombre) === normal(t); }); return t + (encontrado && encontrado.cumple ? ': confirmado' : ': sin confirmar'); }).join(' · ')});
    return grupos;
  }
  g.kwCompradorResumen = resumen;
})(typeof window === 'undefined' ? globalThis : window);
