(function(global){
 'use strict';
 function normal(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
 function distancia(a,b){
  if(a===b)return 0;var d=Array.from({length:a.length+1},function(){return [];});
  for(var i=0;i<=a.length;i++)d[i][0]=i;for(var j=0;j<=b.length;j++)d[0][j]=j;
  for(i=1;i<=a.length;i++)for(j=1;j<=b.length;j++){d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);}
  return d[a.length][b.length];
 }
 function mejor(palabra,opciones,canon){
  var p=normal(palabra),exacto=opciones.find(function(o){return normal(o)===p;});if(exacto)return normal(exacto);
  if(p.length<4||p.length>40)return null;
  var limite=p.length>=8?2:1,min=limite+1,ganan=new Set();
  opciones.forEach(function(o){o=normal(o);if(Math.abs(o.length-p.length)>limite)return;var n=distancia(p,o),clave=canon&&canon[o]||o;if(n<min){min=n;ganan=new Set([clave]);}else if(n===min)ganan.add(clave);});
  return min<=limite&&ganan.size===1?Array.from(ganan)[0]:null;
 }
 var alias={casas:'casa',departamentos:'departamento',depas:'depa',deptos:'depto',terrenos:'terreno',oficinas:'oficina',bodegas:'bodega',locales:'local',recamara:'recamaras',bano:'banos'};
 var palabras=['casa','casas','departamento','departamentos','depa','depto','terreno','terrenos','oficina','oficinas','bodega','bodegas','local','locales','venta','renta','hospital','hospitales','alberca','terraza','jardin','elevador','estacionamiento','recamaras','banos','amueblado','mascotas','remodelar','balcon'];
 var conservar=new Set(['cama','camas','cava','caja','cajas','cafe','capa','pasa','masa','mesa','mesas','losa','tasa','taza','fosa','rosa','roca','ropa','costa','cerca','sin','con','no','hay','mar','mas']);
 function corregir(texto){return String(texto||'').replace(/[a-záéíóúüñ0-9]+/gi,function(p){var k=normal(p);if(/\d/.test(k)||conservar.has(k))return p;var m=alias[k]||mejor(k,palabras,alias);if(!m&&k.length===3){var cortas=['casa','depa','depto'].filter(function(v){return v[0]===k[0]&&distancia(k,v)===1;});if(cortas.length===1)m=cortas[0];}return m?alias[m]||m:p;});}
 function tokensNombre(v){return normal(v).split(' ').filter(function(t){return t&&!['de','del','la','las','los','el','y'].includes(t);});}
 function resolverAsesores(texto,filas){
  var nombres=Array.from(new Set(filas.map(function(f){return typeof f==='string'?f:f.asesor_nombre;}).filter(Boolean))),q=tokensNombre(texto);
  if(!q.length)throw Error('Escribe el nombre del asesor.');
  function buscar(tokens){return nombres.filter(function(v){var ts=tokensNombre(v);return tokens.every(function(t){return ts.includes(t);});});}
  var exactos=buscar(q);if(exactos.length)return exactos;
  var vocabulario=Array.from(new Set(nombres.flatMap(tokensNombre))),corregidos=q.map(function(t){return vocabulario.includes(t)?t:mejor(t,vocabulario);});
  if(corregidos.some(function(t){return !t;}))throw Error('No pude distinguir el asesor. Revisa el nombre o agrega un apellido.');
  var encontrados=buscar(corregidos);if(!encontrados.length)throw Error('No encontré un asesor con ese nombre en el inventario.');return encontrados;
 }
 function separarAsesor(texto){
  var m=String(texto).trim().match(/^(.*?)\b(?:de|del)\s+(?:(?:el|la)\s+)?(?:(asesor(?:a)?|agente)[:\s]+)?(.+)$/i);
  if(!m){m=String(texto).trim().match(/^(?:(?:todas?\s+)?(?:las?\s+)?(?:propiedades|inmuebles)\s+)?(?:del?\s+)?(?:asesor(?:a)?|agente)[:\s]+(.+)$/i);if(!m)return null;m=['','',true,m[1]];}
  var prefijo=corregir(m[1]).replace(/\b(muestrame|muestra|busca|buscar|ver|quiero|dame|todas|todos|las|los|propiedades|inmuebles)\b/gi,'').trim().replace(/\s+/g,' ');
  if(!m[2]&&!/^(?:(?:casa|departamento|depa|depto|terreno|oficina|bodega|local)(?:\s+comercial)?)?(?:\s*(?:en\s+)?(?:renta|venta))?$/.test(normal(prefijo)))return null;
  // Un presupuesto, una característica o un tipo de inmueble no son un nombre.
  if(!m[2]&&(/\d/.test(m[3])||/\b(casa|casas|departamento|depa|terreno|oficina|bodega|menos|mas|precio|millones|mdp|recamaras|banos|hospital|venta|renta)\b/.test(normal(m[3]).split(/\s+(?:en|con|sin|hasta|desde|cerca)\s/)[0])))return null;
  var partes=m[3].split(/\s+(?=en\s|con\s|sin\s|hasta\s|desde\s|cerca\s|por menos\s)/i),nombre=partes.shift().trim();
  return {nombre:nombre,texto:[prefijo,partes.join(' ')].filter(Boolean).join(' ')};
 }
 function corregirLugar(v,rows,campo){
  var valores=Array.from(new Set(rows.map(function(r){return r[campo];}).filter(Boolean))),k=normal(v);
  if(valores.some(function(o){return normal(o)===k||normal(o).startsWith(k+' ');}))return v;
  var vocab=Array.from(new Set(valores.flatMap(function(o){return normal(o).split(' ');}))),pal=k.split(' ').map(function(p){return vocab.includes(p)?p:mejor(p,vocab)||p;}).join(' ');
  return valores.some(function(o){return normal(o)===pal||normal(o).startsWith(pal+' ');})?pal:v;
 }
 global.kwBusquedaTolerante={normalizar:normal,corregir:corregir,mejor:mejor,resolverAsesores:resolverAsesores,separarAsesor:separarAsesor,corregirLugar:corregirLugar};
})(window);

