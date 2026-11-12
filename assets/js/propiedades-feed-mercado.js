(function(global){
 'use strict';
 function dia(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return null;var n=Date.parse(v+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===v?n:null;}
 function fechaLocal(v){var d=new Date(v);if(!Number.isFinite(d.getTime()))return null;var p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d),m={};p.forEach(function(x){m[x.type]=x.value;});return m.year+'-'+m.month+'-'+m.day;}
 function dias(p,ahora){var d=p.datos||{};if(d.dias_en_mercado!=null&&d.dias_en_mercado!==''&&Number.isInteger(Number(d.dias_en_mercado))&&Number(d.dias_en_mercado)>=0)return Number(d.dias_en_mercado);
  var inicio=dia(d.fecha_publicacion);if(inicio===null)return null;
  var cierre=dia(d.fecha_cierre),fin=cierre!==null?cierre:(p.estatus==='publicada'?dia(fechaLocal(ahora||Date.now())):null);
  if(fin===null||fin<inicio)return null;return Math.floor((fin-inicio)/86400000);
 }
 global.kwFeedMercado={dias:dias};
})(window);

