(function(g) {
  'use strict';
  var modulo,perfil;
  function cargarModulo() {
    if (g.kwFichaPropiedad) return Promise.resolve(g.kwFichaPropiedad);
    if (!modulo) modulo = new Promise(function(ok,bad) {
      var script = document.createElement('script'); script.src='/assets/js/kw-ficha-propiedad.js?v=20261009direccion';
      script.onload=function() { ok(g.kwFichaPropiedad); }; script.onerror=function() { modulo=null; bad(new Error('No se pudo preparar la ficha.')); };document.head.append(script);
    });
    return modulo;
  }
  function cargarPerfil() {
    if (!perfil) perfil=(async function() {
      var u=await g.kwSupabase.auth.getUser();if (!u.data.user) throw new Error('Tu sesión no está disponible.');
      var r=await g.kwSupabase.from('profiles').select('nombre,apellido,email,foto_url,whatsapp,sitio_web').eq('id',u.data.user.id).single();
      if (r.error) throw r.error; return r.data;
    })().catch(function(e) { perfil=null;throw e; });
    return perfil;
  }
  function aviso(texto) {
    var previo=document.querySelector('.comprador-aviso-accion');if(previo)previo.remove();
    var caja=document.createElement('div');caja.className='comprador-aviso-accion';caja.setAttribute('role','status');caja.textContent=texto;document.body.append(caja);setTimeout(function(){caja.remove();},4500);
  }
  function agregar(foto,propiedad,enlace) {
    var menu=document.createElement('details');menu.className='match-acciones';
    var abrir=document.createElement('summary');abrir.textContent='⋮';abrir.setAttribute('aria-label','Acciones de la propiedad');
    var opciones=document.createElement('div');menu.append(abrir,opciones);foto.append(menu);
    menu.addEventListener('toggle',function() { if(menu.open)document.querySelectorAll('.match-acciones[open]').forEach(function(m){if(m!==menu)m.open=false;}); });
    function opcion(texto,accion) {
      var boton=document.createElement('button');boton.type='button';boton.textContent=texto;opciones.append(boton);
      boton.addEventListener('click',async function(e) {
        e.preventDefault();menu.open=false;boton.disabled=true;
        try { await accion(); } catch(e) { if(e.name!=='AbortError')aviso(e.message || 'No se pudo completar la acción.'); }
        finally { boton.disabled=false; }
      });
    }
    opcion('Copiar link',async function(){await navigator.clipboard.writeText(enlace());aviso('Link copiado.');});
    opcion('Compartir propiedad',async function(){if(navigator.share)await navigator.share({title:propiedad.titulo,url:enlace()});else{await navigator.clipboard.writeText(enlace());aviso('Link copiado para compartir.');}});
    opcion('Descargar ficha técnica',async function() {
      var card=foto.closest('.match-prop');card.setAttribute('aria-busy','true');
      try {
        var datos=await Promise.all([cargarModulo(),cargarPerfil(),g.kwSupabase.from('propiedades_inventario').select('*').eq('id',propiedad.id).single()]);
        if(datos[2].error)throw datos[2].error;
        var completa=datos[2].data;if(!completa)throw new Error('Esta propiedad ya no está disponible.');
        if(completa.fuente==='kwmexico' && (completa.imagenes || []).length<12) {
          var fotos=await g.kwSupabase.functions.invoke('fotos-propiedad',{body:{fuente:'kwmexico',fuente_id:String(completa.fuente_id)}});
          if(!fotos.error && Array.isArray(fotos.data && fotos.data.imagenes)) completa.imagenes=Array.from(new Set((completa.imagenes || []).concat(fotos.data.imagenes)));
        }
        datos[0].abrir({propiedad:completa,asesor:datos[1],url:enlace()});
      } finally { card.setAttribute('aria-busy','false'); }
    });
  }
  document.addEventListener('click',function(e) { document.querySelectorAll('.match-acciones[open]').forEach(function(m){if(!m.contains(e.target))m.open=false;}); });
  document.addEventListener('keydown',function(e) {if(e.key==='Escape')document.querySelectorAll('.match-acciones[open]').forEach(function(m){m.open=false;m.querySelector('summary').focus();});});
  g.kwCompradorAcciones={agregar:agregar};
})(window);
