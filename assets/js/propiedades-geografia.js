(function () {
  'use strict';
  var cache = new Map();
  function normalizar(valor) { return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function cargar(archivo) {
    if (!cache.has(archivo)) cache.set(archivo, fetch('/assets/data/limites-mx/' + archivo, {signal: AbortSignal.timeout(12000)})
      .then(function (r) { if (!r.ok) throw new Error('Limites no disponibles'); return r.json(); })
      .catch(function (error) { cache.delete(archivo); throw error; }));
    return cache.get(archivo);
  }
  function valores(v) { return (Array.isArray(v) ? v : v ? [v] : []).map(normalizar).filter(Boolean); }
  var alias = {'cdmx':'09','ciudad de mexico':'09','distrito federal':'09','estado de mexico':'15','edomex':'15','michoacan':'16','veracruz':'30','coahuila':'05','nuevo leon':'19','queretaro':'22'};
  function estadosPara(indice, nombres, texto) {
    return indice.estados.filter(function (e) { return nombres.some(function (n) {
      return alias[n] === e.id || normalizar(e.nombre) === n || (n.length >= 5 && !(texto && n === 'mexico') && normalizar(e.nombre).startsWith(n + ' '));
    }); });
  }
  async function resolver(filtros) {
    var indice = await cargar('indice.json');
    var estados = estadosPara(indice, valores(filtros.estado), false);
    var municipios = valores(filtros.municipio);
    var consulta = normalizar(filtros.texto).replace(/^(alcaldia|delegacion|municipio de) /, '');
    var encontrados = [], ambiguo = false;
    if (!municipios.length && consulta) {
      var porTexto = consulta === 'mexico' ? [] : estadosPara(indice, [consulta], true);
      if (porTexto.length === 1) estados = porTexto;
      else municipios = [consulta];
    }
    if (municipios.length) {
      municipios.forEach(function (nombre) {
        var opciones = indice.municipios.filter(function (m) {
          return normalizar(m.nombre) === nombre && (!estados.length || estados.some(function (e) { return e.id === m.estado; }));
        });
        if (opciones.length === 1) encontrados.push(opciones[0]);
        else if (opciones.length > 1) ambiguo = true;
      });
    }
    if (encontrados.length) {
      var capas = await Promise.all(Array.from(new Set(encontrados.map(function (m) { return m.estado; }))).map(function (id) { return cargar(id + '.geojson'); }));
      return {features: capas.flatMap(function (c) { return c.features.filter(function (f) { return encontrados.some(function (m) { return m.id === f.properties.cvegeo; }); }); }), nombres: encontrados.map(function (m) { return m.nombre; }), ambiguo: ambiguo};
    }
    if (estados.length) {
      var datos = await cargar('estados.geojson');
      return {features: datos.features.filter(function (f) { return estados.some(function (e) { return e.id === f.properties.cvegeo; }); }), nombres: estados.map(function (e) { return e.nombre; }), ambiguo: ambiguo};
    }
    return {features: [], nombres: [], ambiguo: ambiguo};
  }
  async function prepararFiltros(filtros) {
    var consulta=normalizar(filtros.texto).replace(/^(alcaldia|delegacion|municipio de) /,'');
    if(!consulta||consulta==='mexico')return filtros;
    var indice=await cargar('indice.json'),elegidos=estadosPara(indice,valores(filtros.estado),false);
    var estados=estadosPara(indice,[consulta],true);
    function nombresEstado(e){return e.id==='15'?['Estado de México','México']:e.id==='09'?['Ciudad de México','CDMX','Distrito Federal']:e.id==='05'?['Coahuila','Coahuila de Zaragoza']:e.id==='30'?['Veracruz','Veracruz de Ignacio de la Llave']:e.id==='16'?['Michoacán de Ocampo','Michoacán']:[e.nombre];}
    if(estados.length===1&&(!elegidos.length||elegidos.some(function(e){return e.id===estados[0].id;}))){
      return Object.assign({},filtros,{texto:'',busquedaLugar:filtros.texto,estado:nombresEstado(estados[0])});
    }
    var municipios=indice.municipios.filter(function(m){return normalizar(m.nombre)===consulta&&(!elegidos.length||elegidos.some(function(e){return e.id===m.estado;}));});
    if(municipios.length===1){
      var m=municipios[0],e=indice.estados.find(function(e){return e.id===m.estado;});
      return Object.assign({},filtros,{texto:'',busquedaLugar:filtros.texto,estado:nombresEstado(e),municipio:[m.nombre]});
    }
    return filtros;
  }
  function contieneAnillo(punto, anillo) {
    var dentro=false;
    for(var i=0,j=anillo.length-1;i<anillo.length;j=i++) {
      var a=anillo[i],b=anillo[j];
      if((a[1]>punto[1])!==(b[1]>punto[1])&&punto[0]<(b[0]-a[0])*(punto[1]-a[1])/(b[1]-a[1])+a[0]) dentro=!dentro;
    }
    return dentro;
  }
  function contiene(punto, feature) {
    var geometria=feature.geometry;
    var poligonos=geometria.type==='Polygon'?[geometria.coordinates]:geometria.type==='MultiPolygon'?geometria.coordinates:[];
    return poligonos.some(function(p){return contieneAnillo(punto,p[0])&&!p.slice(1).some(function(h){return contieneAnillo(punto,h);});});
  }
  async function porCoordenadas(lat,lng) {
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
    var estados=await cargar('estados.geojson'),punto=[lng,lat];
    var candidatos=estados.features.filter(function(f){return contiene(punto,f);});
    if(candidatos.length!==1)return null;
    var entidad=candidatos[0],id=entidad.properties.cvegeo;
    if(id==='09')return {estado:['Ciudad de México','CDMX','Distrito Federal'],municipio:null};
    var municipios=await cargar(id+'.geojson');
    var encontrados=municipios.features.filter(function(f){return contiene(punto,f);});
    if(encontrados.length!==1)return null;
    return {estado:[entidad.properties.nomgeo],municipio:[encontrados[0].properties.nomgeo]};
  }
  window.kwGeografiaMapa = Object.freeze({resolver: resolver,prepararFiltros:prepararFiltros,porCoordenadas:porCoordenadas});
})();
