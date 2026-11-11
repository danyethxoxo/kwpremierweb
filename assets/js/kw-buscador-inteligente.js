(function(global){
 'use strict';
 var cache=new Map(),catalogos=new WeakMap();
 function guardarCatalogo(sb,campo,rows){var mapa=catalogos.get(sb);if(!mapa){mapa=new Map();catalogos.set(sb,mapa);}mapa.set(campo,{fecha:Date.now(),promesa:Promise.resolve(rows)});}
 async function catalogo(sb,campo){
  campo=campo||'colonia';var mapa=catalogos.get(sb);if(!mapa){mapa=new Map();catalogos.set(sb,mapa);}
  var anterior=mapa.get(campo);if(anterior&&Date.now()-anterior.fecha<300000)return anterior.promesa;
  var promesa=Promise.resolve(sb.rpc('propiedades_inventario_catalogo',{p_campo:campo})).then(function(r){if(r.error)throw Error('No pudimos comprobar el catálogo. Intenta de nuevo.');return r.data||[];});
  var entrada={fecha:Date.now(),promesa:promesa};mapa.set(campo,entrada);
  try{return await promesa;}catch(e){if(mapa.get(campo)===entrada)mapa.delete(campo);throw e;}
 }
 function vacio(){return {tipos:[],estados:[],municipios:[],colonias:[],requisitos:[],dudas:[],conceptos:[]};}
 async function resolver(c,sb){
  var t=global.kwBusquedaTolerante;
  if(c.estados.length||c.municipios.length||c.colonias.length){
   var lugares=await catalogo(sb,'colonia');
   if(t)[['estados','estado'],['municipios','municipio'],['colonias','colonia']].forEach(function(p){c[p[0]]=c[p[0]].map(function(v){return t.corregirLugar(v,lugares,p[1]);});});
   c=global.kwBusquedaIA.resolver(c,lugares,false);
  }
  if(c.asesores&&c.asesores.length){
   var asesores=await catalogo(sb,'asesor_nombre');
   try{c.asesoresEncontrados=Array.from(new Set(c.asesores.flatMap(function(v){return t.resolverAsesores(v,asesores);})));}catch(e){e.asesor=true;throw e;}
  }
  return c;
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
  [['asesor',c.asesoresEncontrados],['tipo',c.tipos],['operacion',c.operacion],['estado',c.estados],['municipio',c.municipios],['colonia',c.colonias]].forEach(function(p){unir(f,p[0],p[1]);});
  [['minimo','precio_min'],['recamaras','recamaras_min'],['banos','banos_min'],['estacionamientos','estacionamientos_min'],['m2Min','superficie_min']].forEach(function(p){if(c[p[1]]!=null)f[p[0]]=Math.max(Number(f[p[0]])||0,c[p[1]]);});
  if(c.precio_max!=null)f.maximo=f.maximo?Math.min(f.maximo,c.precio_max):c.precio_max;
  if(c.moneda){if(f.moneda&&f.moneda!==c.moneda)f.sin_coincidencias=true;else f.moneda=c.moneda;}
  if(f.minimo&&f.maximo&&f.minimo>f.maximo)f.sin_coincidencias=true;
  if(c.cerca_hospital_m)f.cerca_hospital_m=c.cerca_hospital_m;
  return f;
 }
 function basico(texto){
  var frase=normal(texto).replace(/^(?:busco|quiero|muestrame|busca)\s+/,'');
  // Solo consumir un presupuesto cuando el resto de la frase se entiende completo.
  var precio=frase.match(/\s+(?:(?:de|por)\s+)?(menos de|hasta|maximo(?: de)?|no mas de|mas de|desde|minimo(?: de)?)\s*\$?\s*(\d+(?:[.,]\d+)*)(?:\s*(mdp|millones?(?: de pesos)?|mil|pesos|mxn|usd|dolares))?$/);
  if(precio){
   var resto=frase.slice(0,precio.index),criterios=basico(resto);
   if(criterios){
    var numero=precio[2],unidad=precio[3]||'';
    numero=/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(numero)?numero.replace(/,/g,''):numero.replace(',','.');
    var monto=Number(numero)*(unidad==='mdp'||unidad.startsWith('millon')?1000000:unidad==='mil'?1000:1);
    if(Number.isFinite(monto)&&monto>0){criterios[/^(mas de|desde|minimo)/.test(precio[1])?'precio_min':'precio_max']=monto;if(unidad)criterios.moneda=/usd|dolares/.test(unidad)?'USD':'MXN';return criterios;}
   }
   return null;
  }
  texto=frase.replace(/^(venta|renta)\s+de\s+(.+)$/,'$2 en $1');
  var generica=normal(texto).match(/^(?:(?:todas las|todos los|las|los) )?(?:propiedades|inmuebles)(?: (?:en )?(venta|renta))?$/);if(generica){var todas=vacio();if(generica[1])todas.operacion=generica[1];return todas;}
  var soloOperacion=normal(texto).match(/^(?:en )?(venta|renta)$/);if(soloOperacion){var solo=vacio();solo.operacion=soloOperacion[1];return solo;}
  var m=normal(texto).match(/^(depa|depto\.?|departamento|casa|terreno|oficina|bodega)(?:\s+(?:en\s+)?(venta|renta))?(?:\s+((?:cerca\s+(?:de|del|de un|de una)|proximo\s+a(?: un| una)?|junto a(?: un| una)?)\s+(?:hospital|hospitales|clinica|clinicas)))?$/);
  if(!m)return null;
  var tipos={casa:'Casa',terreno:'Terreno',oficina:'Oficina',bodega:'Bodega'},c={tipos:[tipos[m[1]]||'Departamento'],estados:[],municipios:[],colonias:[],requisitos:[],dudas:[],conceptos:[]};
  if(m[2])c.operacion=m[2];if(m[3])c.cerca_hospital_m=1500;return c;
 }
 async function interpretar(texto,sb){
  var local=basico(texto);if(local)return local;
  if(texto.length<8||/^\d+$/.test(texto))return null;
  // Names, addresses and literal amenities already use the indexed full-text search.
  if(texto.trim().split(/\s+/).length<=4&&!/\b(depa|depto|departamento|casa|terreno|oficina|bodega|renta|venta|comprar|rentar|cerca|proximo|junto|con|sin|hasta|desde|menos|mas|millones|recamaras|banos|busco|busca|quiero|muestrame|encuentra|necesito|asesor|asesora|agente)\b/.test(normal(texto)))return null;
  var key=normal(texto);if(cache.has(key))return cache.get(key);
  var pending=(async function(){
   var safe=texto.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[correo omitido]').replace(/(?:\+?\d[\s().-]*){10,16}/g,'[teléfono omitido]');
   var r=await sb.functions.invoke('interpretar-busqueda',{body:{texto:safe,contexto:'buscador'}});
   if(r.error||!r.data||!r.data.ok)throw Error('No pudimos interpretar la frase. Se aplicó la búsqueda por texto y tus filtros.');
   var c=r.data.criterios;if(c.dudas&&c.dudas.length)throw Error('Aclara la búsqueda: '+c.dudas.join(' '));
   c=await resolver(c,sb);
   return c;
  })();
  cache.set(key,pending);try{return await pending;}catch(e){cache.delete(key);throw e;}
 }
 async function buscar(manual,sb){
  var original=String(manual.texto||'').trim();if(!original)return {filtros:manual,resumen:''};
  var t=global.kwBusquedaTolerante,agente=t&&t.separarAsesor(original),base=Object.assign({},manual),nombres=[];
  try{
   if(agente){nombres=t.resolverAsesores(agente.nombre,await catalogo(sb,'asesor_nombre'));base.texto=agente.texto;}
   if(t)base.texto=t.corregir(base.texto);
   var c=base.texto?await interpretar(base.texto,sb):vacio();
   if(!c&&t&&!/\d/.test(base.texto)){
    var lugares=await catalogo(sb,'colonia');
    base.texto=t.corregirLugar(base.texto,lugares,'colonia');
   }
   var f=c?combinar(base,c):base;
   if(nombres.length)unir(f,'asesor',nombres);
   return {filtros:f,resumen:f.sin_coincidencias?'La frase y los filtros seleccionados se contradicen.':''};
  }catch(e){return {filtros:agente||e.asesor?Object.assign({},manual,{texto:'',sin_coincidencias:true}):base,resumen:e.message};}
 }

 global.kwBuscadorInteligente={buscar:buscar,combinar:combinar,basico:basico,cacheCatalogo:guardarCatalogo};
})(window);

