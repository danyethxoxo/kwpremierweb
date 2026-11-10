(function(global){
 'use strict';
 var cache=new Map(),catalogos=new WeakMap();
 async function catalogo(sb){
  var anterior=catalogos.get(sb);if(anterior&&Date.now()-anterior.fecha<300000)return anterior.promesa;
  var promesa=Promise.resolve(sb.rpc('propiedades_inventario_catalogo',{p_campo:'colonia'})).then(function(r){if(r.error)throw Error('No pudimos comprobar la ubicación. Se aplicó la búsqueda por texto.');return r.data||[];});
  var entrada={fecha:Date.now(),promesa:promesa};catalogos.set(sb,entrada);
  try{return await promesa;}catch(e){if(catalogos.get(sb)===entrada)catalogos.delete(sb);throw e;}
 }
 function normal(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
 function lista(v){return Array.isArray(v)?v:v?[v]:[];}
 function unir(f,key,values){
  values=lista(values);if(!values.length)return;
  var prev=lista(f[key]);f[key]=prev.length?prev.filter(function(v){return values.includes(v);}):values;
  if(!f[key].length)f.sin_coincidencias=true;
 }
 function combinar(manual,c){
  var f=Object.assign({},manual,{texto:'',conceptos:c.conceptos&&c.conceptos.length?c.conceptos:c.requisitos.map(function(v){return [v];})});
  [['tipo',c.tipos],['operacion',c.operacion],['estado',c.estados],['municipio',c.municipios],['colonia',c.colonias]].forEach(function(p){unir(f,p[0],p[1]);});
  [['minimo','precio_min'],['recamaras','recamaras_min'],['banos','banos_min'],['estacionamientos','estacionamientos_min'],['m2Min','superficie_min']].forEach(function(p){if(c[p[1]]!=null)f[p[0]]=Math.max(Number(f[p[0]])||0,c[p[1]]);});
  if(c.precio_max!=null)f.maximo=f.maximo?Math.min(f.maximo,c.precio_max):c.precio_max;
  if(c.moneda){if(f.moneda&&f.moneda!==c.moneda)f.sin_coincidencias=true;else f.moneda=c.moneda;}
  if(f.minimo&&f.maximo&&f.minimo>f.maximo)f.sin_coincidencias=true;
  if(c.cerca_hospital_m)f.cerca_hospital_m=c.cerca_hospital_m;
  return f;
 }
 function basico(texto){
  var m=normal(texto).match(/^(depa|depto\.?|departamento|casa|terreno|oficina|bodega)(?:\s+(?:en\s+)?(venta|renta))?(?:\s+((?:cerca\s+(?:de|del|de un|de una)|proximo\s+a(?: un| una)?|junto a(?: un| una)?)\s+(?:hospital|hospitales|clinica|clinicas)))?$/);
  if(!m)return null;
  var tipos={casa:'Casa',terreno:'Terreno',oficina:'Oficina',bodega:'Bodega'},c={tipos:[tipos[m[1]]||'Departamento'],estados:[],municipios:[],colonias:[],requisitos:[],dudas:[],conceptos:[]};
  if(m[2])c.operacion=m[2];if(m[3])c.cerca_hospital_m=1500;return c;
 }
 async function interpretar(texto,sb){
  var local=basico(texto);if(local)return local;
  if(texto.length<8||/^\d+$/.test(texto))return null;
  // Names, addresses and literal amenities already use the indexed full-text search.
  if(texto.trim().split(/\s+/).length<=4&&!/\b(depa|depto|departamento|casa|terreno|oficina|bodega|renta|venta|comprar|rentar|cerca|proximo|junto|con|sin|hasta|desde|menos|mas|millones|recamaras|banos)\b/.test(normal(texto)))return null;
  var key=normal(texto);if(cache.has(key))return cache.get(key);
  var pending=(async function(){
   var safe=texto.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[correo omitido]').replace(/(?:\+?\d[\s().-]*){10,16}/g,'[teléfono omitido]');
   var r=await sb.functions.invoke('interpretar-busqueda',{body:{texto:safe,contexto:'buscador'}});
   if(r.error||!r.data||!r.data.ok)throw Error('No pudimos interpretar la frase. Se aplicó la búsqueda por texto y tus filtros.');
   var c=r.data.criterios;if(c.dudas&&c.dudas.length)throw Error('Aclara la búsqueda: '+c.dudas.join(' '));
   if(c.estados.length||c.municipios.length||c.colonias.length){
    c=global.kwBusquedaIA.resolver(c,await catalogo(sb),false);
   }
   return c;
  })();
  cache.set(key,pending);try{return await pending;}catch(e){cache.delete(key);throw e;}
 }
 async function buscar(manual,sb){
  var texto=String(manual.texto||'').trim();if(!texto)return {filtros:manual,resumen:''};
  try{
   var c=await interpretar(texto,sb);if(!c)return {filtros:manual,resumen:''};
   var f=combinar(manual,c);
   return {filtros:f,resumen:f.sin_coincidencias?'La frase y los filtros seleccionados se contradicen.':''};
  }catch(e){return {filtros:manual,resumen:e.message};}
 }
 global.kwBuscadorInteligente={buscar:buscar,combinar:combinar,basico:basico};
})(window);
