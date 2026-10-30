(function (g) {
  'use strict';
  function locales(userId){
    var lista=[],prefijo='kw-dictamen-borrador:'+userId+':';
    try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k?.startsWith(prefijo)){try{var s=JSON.parse(localStorage.getItem(k));if(s?.datos)lista.push(s);}catch(e){/* Respaldo antiguo no valido. */}}}}catch(e){/* Almacenamiento local deshabilitado. */}
    return lista;
  }
  function crear(op) {
    var actual=null, pausado=false, restaurando=false, temporizador;
    var prefijo='kw-dictamen-borrador:'+op.userId+':';
    function clave(id){return prefijo+(id||'nuevo');}
    function leerLocal(id){try{return JSON.parse(localStorage.getItem(clave(id))||'null')||locales(op.userId).find(s=>s.id===id)||null;}catch(e){return null;}}
    function proteger(s){try{localStorage.setItem(clave(s.origen),JSON.stringify(s));return true;}catch(e){op.estado('No se pudo crear el respaldo local.');return false;}}
    function capturar(){
      if(!actual||pausado||restaurando)return;
      var datos=op.leer(),texto=JSON.stringify(datos);
      if(texto===actual.huella)return;
      actual.datos=datos;actual.huella=texto;actual.pendiente=true;actual.version++;actual.fecha=Date.now();proteger(actual);
    }
    async function enviar(s){
      if(!s||!s.pendiente)return;
      if(s.enviando){var previa=s.enviandoVersion;await s.enviando;if(s.pendiente&&s.version>previa)return enviar(s);return;}
      var version=s.version,datos=JSON.parse(JSON.stringify(s.datos));
      s.enviandoVersion=version;
      s.enviando=(async function(){
        try{
          var r=await op.cliente.rpc('autoguardar_dictamen',{p_id:s.id,p_datos:datos,p_nuevo:!s.persistido});
          if(r.error)throw r.error;
          s.persistido=true;if(s.version===version)s.pendiente=false;proteger(s);
          if(actual===s)op.estado(s.origen?'Cambios protegidos':'Borrador guardado');
        }catch(e){
          if(actual===s)op.estado('Respaldo local pendiente de sincronizar.');
        }
      })();
      await s.enviando;s.enviando=null;
    }
    function programar(){
      if(!actual||pausado||restaurando)return;
      capturar();clearTimeout(temporizador);
      var s=actual;temporizador=setTimeout(function(){enviar(s);},800);
    }
    async function abrir(id,publicadoEn){
      cerrar();pausado=false;restaurando=true;
      var local=leerLocal(id);
      var s=actual={id:local?.id||id||crypto.randomUUID(),origen:id||null,persistido:local?!!local.persistido:!!id,datos:local?.datos||null,huella:'',pendiente:!!local?.pendiente,version:0,fecha:local?.fecha||0};
      if(local?.datos)op.restaurar(local.datos);
      s.huella=JSON.stringify(op.leer());restaurando=false;
      try{
        var r=await op.cliente.from('dictamen_autoguardados').select('datos,updated_at').eq('user_id',op.userId).eq('dictamen_id',s.id).maybeSingle();
        if(actual!==s)return;
        if(r.data){
          s.persistido=true;
          if(!s.version&&!local?.pendiente&&(!publicadoEn||Date.parse(r.data.updated_at)>Date.parse(publicadoEn))){restaurando=true;op.restaurar(r.data.datos);s.datos=r.data.datos;s.huella=JSON.stringify(op.leer());restaurando=false;op.estado('Borrador recuperado');}
        }
      }catch(e){/* El respaldo local sigue disponible sin conexion. */}
      if(actual===s&&s.pendiente)enviar(s);
    }
    function cerrar(){
      if(actual&&!pausado)capturar();clearTimeout(temporizador);
      var s=actual;actual=null;return enviar(s);
    }
    async function pausar(){capturar();pausado=true;clearTimeout(temporizador);if(actual)await enviar(actual);}
    async function completar(id){
      var s=actual;if(!s)return;
      await op.cliente.from('dictamen_autoguardados').delete().eq('user_id',op.userId).eq('dictamen_id',id);
      olvidar(id);
      s.id=id;s.origen=id;s.persistido=true;s.pendiente=false;s.datos=op.leer();s.huella=JSON.stringify(s.datos);op.estado('');
    }
    function olvidar(id){
      for(var i=localStorage.length-1;i>=0;i--){var k=localStorage.key(i);if(k?.startsWith(prefijo)){try{if(JSON.parse(localStorage.getItem(k)).id===id)localStorage.removeItem(k);}catch(e){/* Respaldo antiguo no relacionado. */}}}
    }
    function salida(){if(!pausado)capturar();if(actual)enviar(actual);}
    g.addEventListener('pagehide',salida);g.addEventListener('beforeunload',salida);
    document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')salida();});
    g.addEventListener('online',function(){if(actual)enviar(actual);});
    op.editor.addEventListener('input',function(){queueMicrotask(programar);});
    op.editor.addEventListener('change',function(){queueMicrotask(programar);});
    op.editor.addEventListener('click',function(e){if(e.target.closest('button'))queueMicrotask(programar);});
    return {abrir:abrir,cerrar:cerrar,programar:programar,pausar:pausar,completar:completar,olvidar:olvidar,id:function(){return actual?.persistido?actual.id:null;},reanudar:function(){pausado=false;programar();}};
  }
  g.kwDictamenAutoguardado={crear:crear,locales:locales};
})(window);
