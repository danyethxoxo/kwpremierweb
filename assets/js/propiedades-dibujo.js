(function () {
  'use strict';
  function cruza(a,b,c,d) {
    function lado(p,q,r){return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);}
    return lado(a,b,c)*lado(a,b,d)<0 && lado(c,d,a)*lado(c,d,b)<0;
  }
  function valido(puntos) {
    if(puntos.length<3||puntos.length>200)return false;
    var area=0;
    for(var i=0;i<puntos.length;i++){
      var a=puntos[i],b=puntos[(i+1)%puntos.length];area+=a[0]*b[1]-b[0]*a[1];
      for(var j=i+2;j<puntos.length;j++){
        if(i===0&&j===puntos.length-1)continue;
        if(cruza(a,b,puntos[j],puntos[(j+1)%puntos.length]))return false;
      }
    }
    return Math.abs(area)>1e-12;
  }
  window.kwCrearDibujoMapa=function(mapa,aplicar){
    var activo=false,puntos=[],vertices=null,capa=null,guardado=null;
    var btn=document.getElementById('prop-mapa-dibujar'),fin=document.getElementById('prop-mapa-terminar');
    var cancelar=document.getElementById('prop-mapa-cancelar'),deshacer=document.getElementById('prop-mapa-deshacer');
    var ayuda=document.getElementById('prop-mapa-ayuda'),ayudaOriginal=ayuda.textContent;
    function limpiarTemporal(){if(vertices)mapa.removeLayer(vertices);vertices=null;}
    function dibujar(){
      limpiarTemporal();vertices=L.featureGroup().addTo(mapa);
      var latlng=puntos.map(function(p){return [p[1],p[0]];});
      if(latlng.length>1)L.polyline(latlng,{color:'#8a0000',weight:3,interactive:false,dashArray:'5 5'}).addTo(vertices);
      latlng.forEach(function(p,i){var v=L.circleMarker(p,{radius:6,color:'#8a0000',fillColor:'#fff',fillOpacity:1}).addTo(vertices);if(i===0)v.on('click',terminar);});
      fin.disabled=!valido(puntos);deshacer.disabled=!puntos.length;
    }
    function modo(valor){
      activo=valor;btn.setAttribute('aria-pressed',String(valor));fin.hidden=cancelar.hidden=deshacer.hidden=!valor;
      document.getElementById('prop-mapa').classList.toggle('prop-mapa-dibujando',valor);
      mapa.getPane('markerPane').style.pointerEvents=valor?'none':'';
      if(valor)mapa.doubleClickZoom.disable();else mapa.doubleClickZoom.enable();
      ayuda.textContent=valor?'Marca al menos 3 puntos del contorno y pulsa Buscar dentro. Escape cancela.':ayudaOriginal;
      if(!valor)limpiarTemporal();
    }
    function terminar(){
      if(!activo||!valido(puntos))return;
      guardado=puntos.map(function(p){return p.slice();});
      if(capa)mapa.removeLayer(capa);
      capa=L.polygon(guardado.map(function(p){return [p[1],p[0]];}),{color:'#8a0000',weight:3,fillOpacity:.12,interactive:false}).addTo(mapa);
      modo(false);aplicar(guardado);
    }
    btn.disabled=false;
    btn.onclick=function(){if(activo){modo(false);return;}puntos=[];modo(true);dibujar();};
    fin.onclick=terminar;cancelar.onclick=function(){modo(false);};
    deshacer.onclick=function(){puntos.pop();dibujar();};
    mapa.on('click',function(e){if(!activo||puntos.length>=200)return;var p=[Number(e.latlng.lng.toFixed(6)),Number(e.latlng.lat.toFixed(6))];if(!puntos.length||p[0]!==puntos[puntos.length-1][0]||p[1]!==puntos[puntos.length-1][1]){puntos.push(p);dibujar();}});
    document.addEventListener('keydown',function(e){if(activo&&e.key==='Escape'){e.preventDefault();modo(false);btn.focus();}});
    return {poligono:function(){return guardado?guardado.map(function(p){return p.slice();}):null;},activo:function(){return activo;},borrar:function(){modo(false);guardado=null;if(capa)mapa.removeLayer(capa);capa=null;}};
  };
})();
