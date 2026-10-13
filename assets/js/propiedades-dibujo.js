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
    var activo=false,muestras=[],trazo=null,capa=null,guardado=null,puntero=null,cuadro=0,previos;
    var marco=mapa.getContainer();
    var btn=document.getElementById('prop-mapa-dibujar');
    var cancelar=document.getElementById('prop-mapa-cancelar');
    var ayuda=document.getElementById('prop-mapa-ayuda'),ayudaOriginal=ayuda.textContent;
    var manejadores=['dragging','touchZoom','doubleClickZoom','scrollWheelZoom','boxZoom','keyboard'];
    function limpiarTemporal(){cancelAnimationFrame(cuadro);cuadro=0;if(trazo)mapa.removeLayer(trazo);trazo=null;}
    function dibujar(){
      cuadro=0;
      if(trazo)trazo.setLatLngs(muestras.map(function(p){return mapa.containerPointToLatLng(p);}));
    }
    function modo(valor){
      if(valor===activo)return;
      activo=valor;btn.setAttribute('aria-pressed',String(valor));cancelar.hidden=!valor;
      marco.classList.toggle('prop-mapa-dibujando',valor);
      if(valor){
        previos={touchAction:marco.style.touchAction,userSelect:marco.style.userSelect,pines:mapa.getPane('markerPane').style.pointerEvents};
        manejadores.forEach(function(nombre){previos[nombre]=mapa[nombre].enabled();mapa[nombre].disable();});
        marco.style.touchAction='none';marco.style.userSelect='none';mapa.getPane('markerPane').style.pointerEvents='none';
      }else{
        var id=puntero;puntero=null;
        if(id!==null&&marco.hasPointerCapture(id))marco.releasePointerCapture(id);
        limpiarTemporal();muestras=[];
        manejadores.forEach(function(nombre){if(previos[nombre])mapa[nombre].enable();});
        marco.style.touchAction=previos.touchAction;marco.style.userSelect=previos.userSelect;mapa.getPane('markerPane').style.pointerEvents=previos.pines;
      }
      ayuda.textContent=valor?'Mantén pulsado y arrastra la pluma para rodear la zona. Al soltar se cierra y busca dentro. Escape cancela.':ayudaOriginal;
    }
    function agregar(evento){
      var p=mapa.mouseEventToContainerPoint(evento),tamano=mapa.getSize();
      p=L.point(Math.max(0,Math.min(tamano.x,p.x)),Math.max(0,Math.min(tamano.y,p.y)));
      var ultimo=muestras[muestras.length-1];
      if(!ultimo||ultimo.distanceTo(p)>=4){
        if(muestras.length>=2400)muestras=muestras.filter(function(_,i){return i%2===0;});
        muestras.push(p);
      }
    }
    function terminar(evento){
      if(!activo||evento.pointerId!==puntero)return;
      evento.preventDefault();evento.stopPropagation();agregar(evento);
      var tolerancia=1.5,reducidos=L.LineUtil.simplify(muestras,tolerancia);
      while(reducidos.length>180){tolerancia*=1.5;reducidos=L.LineUtil.simplify(muestras,tolerancia);}
      if(reducidos.length>3&&reducidos[0].distanceTo(reducidos[reducidos.length-1])<4)reducidos.pop();
      var puntos=reducidos.map(function(p){var c=mapa.containerPointToLatLng(p);return [Number(c.lng.toFixed(6)),Number(c.lat.toFixed(6))];});
      var correcto=valido(puntos);modo(false);
      if(!correcto){ayuda.textContent='Traza un contorno con superficie, sin cruzar la línea. Activa la pluma para volver a intentarlo.';return;}
      guardado=puntos;
      if(capa)mapa.removeLayer(capa);
      capa=L.polygon(guardado.map(function(p){return [p[1],p[0]];}),{color:'#8a0000',weight:3,fillOpacity:.12,interactive:false}).addTo(mapa);
      aplicar(guardado);
    }
    btn.disabled=false;
    btn.onclick=function(){modo(!activo);};cancelar.onclick=function(){modo(false);};
    marco.addEventListener('pointerdown',function(e){
      if(!activo||puntero!==null||e.button!==0||e.target.closest('.leaflet-control, .leaflet-popup'))return;
      e.preventDefault();e.stopPropagation();puntero=e.pointerId;muestras=[];agregar(e);marco.setPointerCapture(puntero);
      trazo=L.polyline([mapa.containerPointToLatLng(muestras[0])],{color:'#8a0000',weight:3,interactive:false}).addTo(mapa);
    },{capture:true,passive:false});
    document.addEventListener('pointermove',function(e){if(!activo||puntero!==e.pointerId)return;e.preventDefault();e.stopPropagation();agregar(e);if(!cuadro)cuadro=requestAnimationFrame(dibujar);},{capture:true,passive:false});
    document.addEventListener('pointerup',terminar,{capture:true,passive:false});
    document.addEventListener('pointercancel',function(e){if(puntero===e.pointerId)modo(false);},true);
    window.addEventListener('blur',function(){if(activo)modo(false);});
    document.addEventListener('keydown',function(e){if(activo&&e.key==='Escape'){e.preventDefault();modo(false);btn.focus();}});
    return {poligono:function(){return guardado?guardado.map(function(p){return p.slice();}):null;},activo:function(){return activo;},borrar:function(){modo(false);guardado=null;if(capa)mapa.removeLayer(capa);capa=null;}};
  };
})();
