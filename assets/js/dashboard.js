(function(global){
 'use strict';
 var datos=null,ocupado=false,seleccion='lados',centrosSeleccionados=new Set(),ultimoIntento=0;
 var money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}),cantidad=new Intl.NumberFormat('es-MX',{maximumFractionDigits:1});
 var monetarias=['gci','company','utilidad'],etiquetas={asociados:'Asociados',citas:'Citas de reclutamiento',altas:'Altas',netos:'Crecimiento neto',bajas:'Bajas',gci:'GCI',company:'Company dollar',utilidad:'Utilidad'};
 function el(id){return document.getElementById(id);}
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
 function n(v){return typeof v==='number'&&Number.isFinite(v);}
 function fmt(v,moneda){return n(v)?(moneda?money:cantidad).format(v):'S/D';}
 function compacto(v,moneda){return n(v)?new Intl.NumberFormat('es-MX',{notation:'compact',maximumFractionDigits:1,...(moneda?{style:'currency',currency:'MXN'}:{})}).format(v):'S/D';}
 function total(p){return n(p.venta)&&n(p.renta)?p.venta+p.renta:null;}
 function actual(p){var op=el('operacion-lore').value;return op==='todas'?total(p):p[op];}
 function pintarFiltros(){
  if(!el('centros-filtros').children.length)datos.centros.forEach(function(c,i){centrosSeleccionados.add(c.nombre);var label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.disabled=c.nombre==='KW Premier';input.value=c.nombre;input.addEventListener('change',function(){if(input.checked)centrosSeleccionados.add(c.nombre);else centrosSeleccionados.delete(c.nombre);pintarComparativa();});label.append(input,document.createTextNode(c.nombre));el('centros-filtros').append(label);});
 }
 function pintarLore(){
  var op=el('operacion-lore').value,lore=datos.lore;
  el('operacion-etiqueta').textContent=op==='todas'?'Venta y renta':op==='venta'?'Venta':'Renta';
  el('lore-kpis').innerHTML=lore.indicadores.map(function(p){return '<button type="button" class="dash-kpi" data-lore="'+esc(p.id)+'" aria-pressed="'+(p.id===seleccion)+'"><span>'+esc(p.label)+'</span><strong>'+fmt(actual(p))+'</strong><small>'+fmt(p.venta)+' venta · '+fmt(p.renta)+' renta</small></button>';}).join('');
  el('lore-kpis').querySelectorAll('[data-lore]').forEach(function(b){b.addEventListener('click',function(){seleccion=b.dataset.lore;pintarLore();});});
  var p=lore.indicadores.find(function(v){return v.id===seleccion;}),t=actual(p),venta=op==='renta'?0:p.venta,renta=op==='venta'?0:p.renta;
  el('distribucion-titulo').textContent=p.label;el('donut-total').textContent=fmt(t);
  var donut=el('lore-donut');donut.style.setProperty('--venta',t>0&&n(venta)?venta/t*360+'deg':'0deg');donut.classList.toggle('sin-datos',!t);donut.setAttribute('aria-label',p.label+': '+fmt(venta)+' venta, '+fmt(renta)+' renta');
  el('distribucion-leyenda').innerHTML=['venta','renta'].filter(function(k){return op==='todas'||op===k;}).map(function(k){return '<div class="dash-distribucion-linea"><span class="dash-dot '+k+'"></span>'+ (k==='venta'?'Venta':'Renta')+'<strong class="dash-distribucion-valor">'+fmt(p[k])+'</strong><small>Volumen '+fmt(p.volumen[k],true)+'</small></div>';}).join('');
  var max=Math.max(1,...lore.indicadores.map(function(v){return actual(v)||0;}));
  el('lore-barras').innerHTML=lore.indicadores.filter(function(v){return v.id!=='lados';}).map(function(v){return '<div class="dash-lore-row"><span>'+esc(v.label)+'</span><div class="dash-lore-track" role="img" aria-label="'+esc(v.label+' '+fmt(actual(v)))+'"><span class="venta" style="width:'+(op==='renta'?0:(v.venta||0)/max*100)+'%"></span><span class="renta" style="width:'+(op==='venta'?0:(v.renta||0)/max*100)+'%"></span></div><strong>'+fmt(actual(v))+'</strong></div>';}).join('');
  el('finanzas').innerHTML=[['GCI',lore.centro.gci],['Company dollar',lore.centro.company],['Gastos de operación',lore.centro.gastos],['Utilidad real',lore.centro.utilidad]].map(function(p,i){return '<div><span>'+p[0]+'</span><strong class="'+(i===3?(p[1]>=0?'dash-positivo':'dash-negativo'):'')+'">'+fmt(p[1],true)+'</strong></div>';}).join('');
  el('conversaciones').innerHTML=[['Asociados',lore.centro.asociados],['Citas',lore.centro.citas],['Altas',lore.centro.altas],['Netos',lore.centro.netos]].map(function(p){return '<div><strong class="'+(p[1]<0?'dash-negativo':'')+'">'+fmt(p[1])+'</strong><span>'+p[0]+'</span></div>';}).join('');
 }
 function pintarComparativa(){
  var key=el('metrica-comparativa').value,moneda=monetarias.includes(key),rows=datos.centros.filter(function(c){return centrosSeleccionados.has(c.nombre);}).slice().sort(function(a,b){return (n(b[key])?b[key]:-Infinity)-(n(a[key])?a[key]:-Infinity);});
  var conocidos=rows.filter(function(c){return n(c[key]);}),promedio=conocidos.length?conocidos.reduce(function(s,c){return s+c[key];},0)/conocidos.length:null,premier=datos.centros.find(function(c){return c.nombre==='KW Premier';});
  el('numero-centros').textContent=rows.length+' Market Centers';
  el('comparativa-destacado').innerHTML='<div><span>KW Premier</span><strong>'+fmt(premier&&premier[key],moneda)+'</strong></div><div><span>Promedio de '+conocidos.length+' MC</span><strong>'+fmt(promedio,moneda)+'</strong></div>';
  var lo=Math.min(0,...conocidos.map(function(c){return c[key];})),hi=Math.max(0,...conocidos.map(function(c){return c[key];})),rango=hi-lo||1,cero=(0-lo)/rango*100;
  el('ranking-barras').innerHTML=rows.map(function(c){var value=c[key],left=n(value)?(Math.min(value,0)-lo)/rango*100:0,width=n(value)?Math.abs(value)/rango*100:0;return '<div class="dash-rank-row '+(c.nombre==='KW Premier'?'premier':'')+'"><span>'+esc(c.nombre)+'</span><div class="dash-rank-track" role="img" aria-label="'+esc(c.nombre+': '+fmt(value,moneda)+' '+etiquetas[key])+'"><span class="dash-rank-fill" style="left:'+left+'%;width:'+width+'%"></span>'+(lo<0?'<span class="dash-rank-axis" style="left:'+cero+'%"></span>':'')+'</div><strong title="'+esc(fmt(value,moneda))+'">'+compacto(value,moneda)+'</strong></div>';}).join('');
  el('comparativa-tabla').innerHTML=rows.map(function(c){return '<tr class="'+(c.nombre==='KW Premier'?'dash-tabla-premier':'')+'"><td class="col-fija">'+esc(c.nombre)+'</td>'+['asociados','citas','altas','netos','gci','utilidad'].map(function(k){return '<td>'+fmt(c[k],monetarias.includes(k))+'</td>';}).join('')+'</tr>';}).join('');
 }
 function pintarActividad(){
  var key=el('metrica-actividad').value,rows=datos.lore.diarios,max=Math.max(1,...rows.map(function(d){return d[key]||0;})),x=function(d){return 30+(d-1)/30*390;},y=function(v){return 118-v/max*95;};
  var paths=[],parte=[];rows.forEach(function(d){if(n(d[key]))parte.push((parte.length?'L':'M')+x(d.dia).toFixed(1)+' '+y(d[key]).toFixed(1));else if(parte.length){paths.push(parte.join(' '));parte=[];}});if(parte.length)paths.push(parte.join(' '));
  var svg='<svg viewBox="0 0 440 150" role="img" aria-label="'+esc(el('metrica-actividad').selectedOptions[0].textContent)+' por día del mes"><title>Valores diarios reportados en el Tracker</title>';
  [0,.5,1].forEach(function(p){svg+='<line x1="30" x2="420" y1="'+y(p*max)+'" y2="'+y(p*max)+'" stroke="#ececef"/><text x="23" y="'+(y(p*max)+3)+'" text-anchor="end" fill="#92929a" font-size="9">'+cantidad.format(p*max)+'</text>';});
  [1,8,15,22,31].forEach(function(d){svg+='<text x="'+x(d)+'" y="140" text-anchor="middle" fill="#92929a" font-size="9">'+d+'</text>';});
  paths.forEach(function(p){svg+='<path d="'+p+'" fill="none" stroke="#CE011F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';});rows.filter(function(d){return n(d[key]);}).forEach(function(d){svg+='<circle cx="'+x(d.dia)+'" cy="'+y(d[key])+'" r="2.5" fill="#CE011F"><title>Día '+d.dia+': '+fmt(d[key])+'</title></circle>';});svg+='</svg>';
  el('actividad-grafica').innerHTML=svg;
 }
 function pintar(){
  pintarFiltros();pintarLore();pintarComparativa();pintarActividad();
  el('periodo-lore').textContent=datos.periodo;var fecha=new Date(datos.actualizado),hora=fecha.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',timeZone:'America/Mexico_City'});
  el('fecha-actualizacion').textContent='Actualizado '+hora;el('fecha-actualizacion').title=fecha.toLocaleString('es-MX',{timeZone:'America/Mexico_City'});
  el('ultima-actualizacion').textContent='Actualizado '+hora+' · cada minuto';
  el('periodo-comparativa-aviso').textContent=(datos.advertencias||[]).join(' ');el('periodo-comparativa-aviso').hidden=!(datos.advertencias||[]).length;
  el('dashboard-datos').hidden=false;
 }
 async function cargar(){
  if(ocupado)return;ocupado=true;ultimoIntento=Date.now();el('btn-nuevo').disabled=true;el('btn-nuevo').classList.add('dash-refreshing');el('dashboard-error').hidden=true;
  if(!datos)el('dashboard-carga').hidden=false;el('dashboard-contenido').setAttribute('aria-busy','true');
  try{
   var r=await global.kwSupabase.functions.invoke('dashboard-tracker',{body:{}}),body=r.data;
   if(r.error){if(r.error.context&&r.error.context.json)try{body=await r.error.context.json();}catch(_){}throw Error(body&&body.error||'No pudimos actualizar los datos.');}
   if(!body||!body.ok)throw Error(body&&body.error||'No pudimos leer los indicadores.');
   datos=body;pintar();
  }catch(e){el('dashboard-error').textContent=(e.message||'No pudimos actualizar los datos.')+(datos?' Conservamos la última lectura.':'');el('dashboard-error').hidden=false;}
  finally{ocupado=false;el('dashboard-carga').hidden=true;el('btn-nuevo').disabled=false;el('btn-nuevo').classList.remove('dash-refreshing');el('dashboard-contenido').setAttribute('aria-busy','false');}
 }
 function iniciar(){
  el('btn-nuevo').addEventListener('click',cargar);el('operacion-lore').addEventListener('change',function(){if(datos)pintarLore();});el('metrica-comparativa').addEventListener('change',function(){if(datos)pintarComparativa();});el('metrica-actividad').addEventListener('change',function(){if(datos)pintarActividad();});
  if(document.documentElement.classList.contains('kw-auth-ok'))cargar();else global.addEventListener('kw-auth-ready',cargar,{once:true});
  global.setInterval(function(){if(!document.hidden)cargar();},60000);document.addEventListener('visibilitychange',function(){if(!document.hidden&&Date.now()-ultimoIntento>=60000)cargar();});
 }
 global.kwDashboard={actualizar:cargar};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar,{once:true});else iniciar();
})(window);
