(function(global){
 'use strict';
 var adapters={},instances=[];
 function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');}
 function state(v){var k=norm(v);return ({cdmx:'ciudad de mexico',df:'ciudad de mexico',mexico:'estado de mexico',edomex:'estado de mexico'})[k]||k;}
 function unique(arr){return Array.from(new Set(arr));}
 function resolve(c,rows,single){
  c=JSON.parse(JSON.stringify(c));var places=rows.filter(function(p){return p.estado&&p.municipio&&p.colonia;});
  var states=unique(c.estados.flatMap(function(v){var found=unique(places.filter(function(p){return state(p.estado)===state(v);}).map(function(p){return p.estado;}));if(!found.length)throw Error('No encontré el estado '+v+' en el inventario.');return found;}));
  if(states.length)places=places.filter(function(p){return states.includes(p.estado);});
  var towns=unique(c.municipios.flatMap(function(v){var found=places.filter(function(p){return norm(p.municipio)===norm(v);});if(!found.length)throw Error('No encontré '+v+' en la ubicación indicada.');if(unique(found.map(function(p){return p.estado;})).length>1)throw Error('Indica el estado de '+v+'.');return unique(found.map(function(p){return p.municipio;}));}));
  if(towns.length)places=places.filter(function(p){return towns.includes(p.municipio);});
  var selected=[];
  c.colonias.forEach(function(v){
   var found=places.filter(function(p){return norm(p.colonia)===norm(v)||norm(p.colonia).startsWith(norm(v)+' ');});
   if(!found.length)throw Error('No encontré la colonia '+v+'. Revisa el nombre o usa los filtros normales.');
   if(unique(found.map(function(p){return state(p.estado)+'|'+norm(p.municipio);})).length>1)throw Error('Indica estado y municipio para distinguir la colonia '+v+'.');
   selected=selected.concat(found);
  });
  if(selected.length){states=unique(selected.map(function(p){return p.estado;}));towns=unique(selected.map(function(p){return p.municipio;}));}
  else if(towns.length&&!states.length)states=unique(places.map(function(p){return p.estado;}));
  if(single&&states.length>1)throw Error('El perfil comprador admite un estado. Describe una búsqueda para ese estado.');
  c.estados=states;c.municipios=towns;c.colonias=unique(selected.map(function(p){return p.colonia;}));c.lugares=selected;
  return c;
 }
 function summary(c,context){
  var rows=[],money=new Intl.NumberFormat('es-MX',{maximumFractionDigits:2});
  if(c.operacion)rows.push(c.operacion==='venta'?'Comprar':'Rentar');
  if(c.tipos.length)rows.push('Tipo: '+c.tipos.join(', '));
  if(c.precio_min!=null)rows.push('Desde: '+money.format(c.precio_min)+(c.moneda?' '+c.moneda:''));
  if(c.precio_max!=null)rows.push('Hasta: '+money.format(c.precio_max)+(c.moneda?' '+c.moneda:''));
  if(c.moneda&&c.precio_min==null&&c.precio_max==null)rows.push('Divisa: '+c.moneda);
  ['estados','municipios','colonias'].forEach(function(k){if(c[k].length)rows.push(c[k].join(', '));});
  [['recamaras_min','Recámaras mín.'],['banos_min','Baños mín.'],['estacionamientos_min','Estacionamientos mín.'],['superficie_min','Superficie mínima (m²)']].forEach(function(p){if(c[p[0]]!=null)rows.push(p[1]+': '+c[p[0]]);});
  if(c.requisitos.length)rows.push((context==='propiedades'?'Palabras clave: ':'Características por revisar: ')+c.requisitos.join(', '));
  return rows;
 }
 function safeText(text){return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[correo omitido]').replace(/(?:\+?\d[\s().-]*){10,16}/g,'[teléfono omitido]');}
 function mount(el){
  var context=el.dataset.kwBusquedaIa,revision=0,proposal=null,busy=false;
  el.innerHTML='<details class="kw-busqueda-ia"><summary>Buscar por descripción <span>IA</span></summary><div class="kw-ia-cuerpo"><label>¿Qué propiedad buscas?<textarea rows="3" maxlength="1200" placeholder="Departamento en Narvarte, hasta 4.5 millones de pesos y 2 recámaras"></textarea></label><small>Solo características de la propiedad, sin datos personales del cliente.</small><div class="kw-ia-acciones"><button type="button" class="kw-ia-interpretar">Interpretar</button><span class="kw-ia-loader" hidden><span class="kw-loader" role="status" aria-label="Interpretando"><span class="circle uno"></span><span class="circle dos"></span><span class="circle tres"></span></span></span></div><p class="kw-ia-mensaje" role="status" aria-live="polite" hidden></p><div class="kw-ia-propuesta" hidden><ul></ul><p class="kw-ia-nota" hidden></p><button type="button" class="kw-ia-aplicar">'+(context==='comprador'?'Completar campos':'Aplicar filtros')+'</button></div></div></details>';
  var input=el.querySelector('textarea'),interpret=el.querySelector('.kw-ia-interpretar'),apply=el.querySelector('.kw-ia-aplicar'),box=el.querySelector('.kw-ia-propuesta'),message=el.querySelector('.kw-ia-mensaje');
  function msg(text){message.textContent=text;message.hidden=!text;}
  function invalidate(){revision++;proposal=null;box.hidden=true;msg('');}
  input.addEventListener('input',invalidate);
  // Do not submit the surrounding buyer form or trigger the ordinary search while typing.
  ['input','change','keydown'].forEach(function(name){input.addEventListener(name,function(e){e.stopPropagation();});});
  interpret.addEventListener('click',async function(){
   if(busy)return;invalidate();var id=revision,adapter=adapters[context];
   if(!adapter){msg('La página se está preparando. Intenta de nuevo.');return;}
   var text=input.value.trim();if(text.length<8){msg('Describe zona, presupuesto o características de la propiedad.');return;}
   busy=true;interpret.disabled=true;el.querySelector('.kw-ia-loader').hidden=false;input.setAttribute('aria-busy','true');
   try{
    var response=await global.kwSupabase.functions.invoke('interpretar-busqueda',{body:{texto:safeText(text)}});
    var data=response.data;
    if(response.error){var details=response.error.context;if(details&&details.json)try{data=await details.json();}catch(_){}throw Error(data&&data.error||'No pudimos interpretar la búsqueda. Puedes usar los filtros normales.');}
    if(!data||!data.ok)throw Error(data&&data.error||'No pudimos interpretar la búsqueda.');
    var c=data.criterios;if(id!==revision)return;
    if(c.dudas&&c.dudas.length){msg('Aclara antes de aplicar: '+c.dudas.join(' '));return;}
    c=await adapter.preparar(c);
    if(id!==revision)return;proposal=c;
    var list=box.querySelector('ul');list.replaceChildren();summary(c,context).forEach(function(text){var li=document.createElement('li');li.textContent=text;list.append(li);});
    var note=box.querySelector('.kw-ia-nota');note.hidden=!c.requisitos.length;note.textContent=context==='comprador'?'Las características quedan como etiquetas; revisa las coincidencias.':'Las características se buscan por palabras clave; confírmalas en la ficha.';
    box.hidden=false;apply.disabled=false;
   }catch(error){if(id===revision)msg(error.message||'No se pudo interpretar. Los filtros normales siguen disponibles.');}
   finally{busy=false;interpret.disabled=false;el.querySelector('.kw-ia-loader').hidden=true;input.removeAttribute('aria-busy');}
  });
  apply.addEventListener('click',async function(){
   if(!proposal||busy)return;busy=true;apply.disabled=true;
   try{await adapters[context].aplicar(proposal);proposal=null;box.hidden=true;msg(context==='comprador'?'Revisa los campos antes de guardar el perfil.':'Filtros aplicados. Puedes ajustarlos abajo.');}
   catch(error){msg(error.message);apply.disabled=false;}
   finally{busy=false;}
  });
  var instance={el:el,reset:function(){input.value='';invalidate();}};instances.push(instance);
  var form=el.closest('form');if(form)form.addEventListener('reset',instance.reset);
 }
 global.kwBusquedaIA={registrar:function(name,adapter){adapters[name]=adapter;},resolver:resolve,resumen:summary,normalizar:norm,
  reset:function(name){instances.filter(function(i){return i.el.dataset.kwBusquedaIa===name;}).forEach(function(i){i.reset();});}};
 function init(){document.querySelectorAll('[data-kw-busqueda-ia]').forEach(mount);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
