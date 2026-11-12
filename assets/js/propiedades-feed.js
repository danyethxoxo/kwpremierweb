(function(){
 'use strict';
 var sb=window.kwSupabase,pagina=1,revision=0,filas=[],total=0,temporizador;
 var labels={publicada:'Activa',suspendida:'Suspendida',vendida:'Vendida',rentada:'Rentada',reservada:'Reservada',no_publicada:'No publicada'};
 function el(id){return document.getElementById(id);}
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function fecha(v){if(!v)return 'Sin recepciones';return new Intl.DateTimeFormat('es-MX',{dateStyle:'short',timeStyle:'short',timeZone:'America/Mexico_City'}).format(new Date(v));}
 function url(v){try{var u=new URL(v);return u.protocol==='https:'?u.href:'';}catch(_){return '';}}
 function precio(d){if(d.precio==null)return '';return new Intl.NumberFormat('es-MX',{style:'currency',currency:d.moneda==='USD'?'USD':'MXN',maximumFractionDigits:0}).format(d.precio)+' '+(d.moneda||'MXN');}
 function vacio(n,texto){return '<tr><td colspan="'+n+'"><div class="kw-universal-vacio">'+esc(texto)+'</div></td></tr>';}
 function vista(nombre){['lista','detalle','envios'].forEach(function(v){el('vista-'+v).hidden=v!==nombre;});if(nombre==='lista')requestAnimationFrame(function(){document.querySelector('.feed-lista-tabla').scrollLeft=0;});}
 function detalle(id){var p=filas.find(function(r){return r.fuente_id===id;});if(!p)return;var d=p.datos||{};el('feed-titulo').textContent=d.titulo||p.fuente_id;
  el('feed-galeria').innerHTML=(d.imagenes||[]).map(url).filter(Boolean).map(function(u){return '<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(u)+'" alt="Fotografía de la propiedad" loading="lazy" referrerpolicy="no-referrer"></a>';}).join('');
  var campos=[['ID',p.fuente_id],['Estatus',labels[p.estatus]||p.estatus],['Precio',precio(d)],['Operación',d.operacion],['Tipo',d.tipo],['Asesor',d.asesor_nombre],['Oficina',d.market_center],['Dirección',[d.calle,d.colonia,d.municipio,d.estado,d.cp].filter(Boolean).join(', ')],['Recámaras',d.recamaras],['Baños',d.banos],['Estacionamientos',d.estacionamientos],['Construcción m²',d.m2_construccion],['Terreno m²',d.m2_terreno],['Envío',p.envio_id],['Recibido',fecha(p.recibido_at)],['Generado por KW',fecha(p.generado_at)],['Descripción',d.descripcion],['Características',(d.caracteristicas||[]).join(', ')]];
  el('feed-detalle').innerHTML=campos.filter(function(c){return c[1]!=null&&c[1]!=='';}).map(function(c){return '<div class="field'+(c[0]==='Descripción'?' ancho':'')+'"><label>'+esc(c[0])+'</label><p class="feed-texto">'+esc(c[1])+'</p></div>';}).join('');vista('detalle');
 }
 function pintar(data){filas=data.data||[];total=data.total||0;var r=data.resumen||{};el('feed-total').textContent=r.total||0;el('feed-activas').textContent=r.activas||0;el('feed-inactivas').textContent=r.inactivas||0;el('feed-fecha').textContent=fecha(r.ultima_recepcion);
  el('feed-filas').innerHTML=filas.length?filas.map(function(p){var d=p.datos||{},foto=url((d.imagenes||[])[0]);return '<tr><td class="col-fija"><div class="feed-propiedad">'+(foto?'<img class="feed-miniatura" src="'+esc(foto)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'')+'<div><strong>'+esc(d.titulo||p.fuente_id)+'</strong><small>'+esc(p.fuente_id)+'</small></div></div></td><td><span class="feed-estado">'+esc(labels[p.estatus]||p.estatus)+'</span></td><td>'+esc(d.operacion||'')+'<br>'+esc(precio(d))+'</td><td>'+esc([d.colonia,d.municipio,d.estado].filter(Boolean).join(', '))+'</td><td>'+esc(d.asesor_nombre||'')+'</td><td>'+esc(fecha(p.recibido_at))+'</td><td><button type="button" class="feed-ver" data-feed-id="'+esc(p.fuente_id)+'">Ver</button></td></tr>';}).join(''):vacio(7,r.total?'No hay coincidencias.':'Aún no hay propiedades recibidas de KW.');
  el('feed-pagina').textContent=total?'Página '+pagina+' de '+Math.ceil(total/24):'0 propiedades';el('feed-anterior').disabled=pagina<=1;el('feed-siguiente').disabled=pagina*24>=total;
  el('feed-envios').innerHTML=(data.envios||[]).map(function(e){var x=e.resultado||{};return '<tr><td>'+esc(e.envio_id)+'</td><td>'+esc(fecha(e.recibido_at))+'</td><td>'+esc(x.almacenado_en_pruebas?'Recibido en pruebas':'Validación anterior')+'</td><td>'+esc(x.recibidas||0)+'</td><td>'+esc(x.nuevas||0)+'</td><td>'+esc(x.actualizadas||0)+'</td><td>'+esc(x.desactivadas||0)+'</td></tr>';}).join('')||vacio(7,'No hay recepciones.');
  el('feed-rechazos').innerHTML=(data.rechazos||[]).map(function(e){return '<tr><td>'+esc(fecha(e.recibido_at))+'</td><td>'+esc(e.envio_id||e.id)+'</td><td>'+esc(e.codigo)+'</td><td>'+esc(e.mensaje)+'</td></tr>';}).join('')||vacio(4,'No hay envíos rechazados.');
 }
 async function cargar(silencioso){var actual=++revision;if(!silencioso)el('feed-carga').hidden=false;el('btn-nuevo').disabled=true;
  try{var r=await sb.functions.invoke('propiedades-feed-pruebas',{body:{texto:el('buscador-input').value.trim(),estatus:el('filtro-estado').value,pagina:pagina}});if(actual!==revision)return;
   if(r.error||!r.data||!r.data.ok){var msg=r.data&&r.data.error;try{if(r.error&&r.error.context){var info=await r.error.context.json();msg=info.error;}}catch(_){}throw Error(msg||'No se pudo cargar el inventario de pruebas.');}
   if(r.data.total&&pagina>Math.ceil(r.data.total/24)){pagina=Math.ceil(r.data.total/24);return cargar(silencioso);}
   pintar(r.data);if(!silencioso)document.querySelector('.feed-lista-tabla').scrollLeft=0;el('feed-error').hidden=true;
  }catch(e){if(actual===revision){el('feed-error').textContent=e.message||'No se pudo cargar el inventario.';el('feed-error').hidden=false;}}
  finally{if(actual===revision){el('feed-carga').hidden=true;el('btn-nuevo').disabled=false;}}
 }
 function iniciar(){if(!sb){el('feed-error').textContent='No se pudo iniciar la sesión.';el('feed-error').hidden=false;return;}
  el('btn-nuevo').addEventListener('click',function(){cargar(false);});
  el('buscador-input').addEventListener('input',function(){clearTimeout(temporizador);temporizador=setTimeout(function(){pagina=1;cargar(false);},300);});
  el('filtro-estado').addEventListener('change',function(){pagina=1;cargar(false);});
  el('feed-anterior').addEventListener('click',function(){if(pagina>1){pagina--;cargar(false);}});el('feed-siguiente').addEventListener('click',function(){if(pagina*24<total){pagina++;cargar(false);}});
  document.querySelectorAll('[data-feed-vista]').forEach(function(b){b.addEventListener('click',function(){vista(b.dataset.feedVista);});});
  el('feed-filas').addEventListener('click',function(e){var b=e.target.closest('[data-feed-id]');if(b)detalle(b.dataset.feedId);});
  cargar(false);setInterval(function(){if(!document.hidden)cargar(true);},30000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar,{once:true});else iniciar();
})();

