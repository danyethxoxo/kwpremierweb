(function(){
  'use strict';
  const movil=matchMedia('(max-width:1023px)');
  const traslados=[];
  let encabezado,creado=false,pendiente=0;
  function visible(el){return el&&el.getClientRects().length>0&&!el.closest('[hidden]');}
  function mover(nodo,destino){
    let registro=traslados.find(r=>r.nodo===nodo);
    if(!registro){const marca=document.createComment('kw-movil');const origen=nodo.closest('#vista-lista,#vista-formulario,main')||nodo.parentElement;nodo.before(marca);registro={nodo,marca,origen,html:nodo.innerHTML,oculto:nodo.hidden};traslados.push(registro);}
    if(nodo.parentElement!==destino)destino.appendChild(nodo);
    return registro;
  }
  function restaurar(){
    traslados.forEach(r=>{if(r.marca.parentNode){r.marca.after(r.nodo);r.marca.remove();}if(r.textoCorto)r.nodo.innerHTML=r.html;r.nodo.hidden=r.oculto;r.nodo.classList.remove('kw-movil-accion','kw-movil-buscar');});
    traslados.length=0;
    document.querySelectorAll('.kw-movil-titulo-origen').forEach(el=>el.classList.remove('kw-movil-titulo-origen'));
    if(creado){encabezado?.remove();encabezado=null;creado=false;}
    if(document.body.classList.contains('kw-movil'))document.body.classList.remove('kw-movil');
  }
  function actualizar(){
    pendiente=0;
    if(!movil.matches){restaurar();return;}
    // Firmas ya conserva estas piezas en su propio controlador de vistas.
    if(document.body.classList.contains('firmas-pagina'))return;
    if(!document.body.classList.contains('kw-movil'))document.body.classList.add('kw-movil');
    encabezado=document.querySelector('body > header.kw-header');
    if(!encabezado){
      encabezado=document.createElement('header');encabezado.className='kw-header kw-movil-header';
      encabezado.innerHTML='<div class="kw-header-capsula"><a class="back-btn" aria-label="Volver a documentos"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></a><span class="kw-header-title"></span></div><div class="kw-header-sueltos"></div>';
      document.body.prepend(encabezado);creado=true;
    }
    let titulo=encabezado.querySelector('.kw-header-title');
    if(!titulo){titulo=document.createElement('span');titulo.className='kw-header-title';(encabezado.querySelector('.kw-header-capsula')||encabezado).appendChild(titulo);}
    const tituloPagina=document.querySelector('.vista-lista-title,.kw-page-titulo,.page-title');
    if(titulo){const texto=tituloPagina?.textContent.trim()||document.title.split(/[|·]/)[0].trim();if(titulo.textContent!==texto)titulo.textContent=texto;}
    if(tituloPagina&&!tituloPagina.classList.contains('kw-movil-titulo-origen'))tituloPagina.classList.add('kw-movil-titulo-origen');
    if(creado){
      const enlace=encabezado.querySelector('.back-btn');
      const enFormulario=visible(document.getElementById('vista-formulario'));
      const esDocumento=location.pathname.startsWith('/documentos/');
      const url=enFormulario?location.pathname:esDocumento?'/documentos/documentos.html':'/portal.html';
      if(enlace.getAttribute('href')!==url)enlace.setAttribute('href',url);
      enlace.setAttribute('aria-label',enFormulario?'Volver al listado':esDocumento?'Volver a documentos':'Volver al Hub');
    }
    let sueltos=encabezado.querySelector('.kw-header-sueltos');
    if(!sueltos){sueltos=document.createElement('div');sueltos.className='kw-header-sueltos';encabezado.appendChild(sueltos);}
    const campana=document.getElementById('notif-bell-slot');
    if(campana&&campana.parentElement!==sueltos)mover(campana,sueltos);
    document.querySelectorAll('.kw-lateral .kw-lateral-buscador').forEach(nodo=>{
      const principal=document.querySelector('.kw-lateral-principal,.kw-universal-principal')||document.querySelector('main');
      if(principal){mover(nodo,principal);nodo.classList.add('kw-movil-buscar');principal.prepend(nodo);}
    });
    document.querySelectorAll('.kw-page-acciones > :is(.kw-menu-ancla,#btn-nuevo,.btn-nuevo-doc,.btn-nuevo-asesor,.btn-reportar,.btn-nuevo),.vista-lista-header > .btn-nuevo-documento').forEach(nodo=>{
      if(!visible(nodo))return;
      const registro=mover(nodo,sueltos);
      if(nodo.matches('#btn-nuevo,.btn-nuevo-doc,.btn-nuevo-documento,.btn-nuevo-asesor,.btn-reportar,.btn-nuevo')){
        nodo.classList.add('kw-movil-accion');
        if(/nuevo|crear/i.test(nodo.textContent)&&!registro.textoCorto){nodo.setAttribute('aria-label',nodo.textContent.trim());nodo.textContent='+ Nuevo';registro.textoCorto=true;}
      }
    });
    traslados.forEach(r=>{const oculto=!visible(r.origen);if(r.nodo.hidden!==oculto)r.nodo.hidden=oculto;});
  }
  function programar(){if(!pendiente)pendiente=requestAnimationFrame(actualizar);}
  function iniciar(){
    actualizar();movil.addEventListener('change',programar);
    new MutationObserver(programar).observe(document.body,{attributes:true,attributeFilter:['class']});
    document.querySelectorAll('#vista-lista,#vista-formulario').forEach(vista=>new MutationObserver(programar).observe(vista,{attributes:true,attributeFilter:['style','hidden']}));
    window.addEventListener('kw-auth-ready',programar);window.addEventListener('popstate',programar);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar,{once:true});else iniciar();
})();
