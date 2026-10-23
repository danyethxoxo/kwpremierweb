(function(){
  'use strict';
  const movil=matchMedia('(max-width:1023px)');
  const traslados=[];
  let encabezado,creado=false,pendiente=0,menu;
  const iconoMenu='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  function prepararNavegacion(){
    const boton=encabezado.querySelector('#kw-drawer-toggle');
    if(boton)return;
    const abrir=document.createElement('button');abrir.type='button';abrir.id='kw-movil-menu';abrir.className='hamburger-btn';
    abrir.setAttribute('aria-label','Menú');abrir.setAttribute('aria-haspopup','dialog');abrir.innerHTML=iconoMenu;
    encabezado.querySelector('.kw-header-capsula').prepend(abrir);
    menu=document.createElement('dialog');menu.className='kw-movil-navegacion';menu.setAttribute('aria-label','Menú del Hub');
    const destinos=[['/portal.html','Inicio del Hub'],['/propiedades.html','Propiedades'],['/documentos/documentos.html','Acuerdos y Contratos'],['/hub/firmas.html','Firmas Digitales'],['/hub/dictamenes.html','Dictaminación de Expedientes'],['/hub/drive.html','Documentos de Drive'],['/hub/perfil-comprador.html','Perfil comprador'],['/hub/tickets.html','Reportar una incidencia'],['/perfil.html','Mi perfil']];
    menu.innerHTML='<div class="kw-movil-nav-cabecera"><strong>Menú del Hub</strong><button type="button" aria-label="Cerrar menú">×</button></div><nav aria-label="Navegación principal"><a data-kw-movil-regresar></a></nav>';
    destinos.forEach(([url,texto])=>{const enlace=document.createElement('a');enlace.href=url;enlace.textContent=texto;menu.querySelector('nav').appendChild(enlace);});
    document.body.appendChild(menu);
    abrir.addEventListener('click',()=>{menu.showModal();abrir.setAttribute('aria-expanded','true');});
    menu.querySelector('button').addEventListener('click',()=>menu.close());
    menu.addEventListener('click',evento=>{if(evento.target===menu)menu.close();});
    menu.addEventListener('close',()=>{abrir.setAttribute('aria-expanded','false');abrir.focus();});
    const slot=document.createElement('div');slot.id='notif-bell-slot';
    slot.innerHTML='<a class="kw-movil-notificaciones" href="/hub/notificaciones.html" aria-label="Notificaciones"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></a>';
    if(!document.getElementById('notif-bell-slot'))encabezado.querySelector('.kw-header-sueltos').appendChild(slot);
  }
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
    if(menu){menu.close();menu.remove();menu=null;}
    if(document.body.classList.contains('kw-movil'))document.body.classList.remove('kw-movil');
  }
  function actualizar(){
    pendiente=0;
    if(!movil.matches){restaurar();return;}
    const esFirmas=document.body.classList.contains('firmas-pagina');
    if(!document.body.classList.contains('kw-movil'))document.body.classList.add('kw-movil');
    encabezado=document.querySelector('body > header.kw-header');
    if(!encabezado){
      encabezado=document.createElement('header');encabezado.className='kw-header kw-movil-header';
      encabezado.innerHTML='<div class="kw-header-capsula"><span class="kw-header-title"></span></div><div class="kw-header-sueltos"></div>';
      document.body.prepend(encabezado);creado=true;
    }
    let titulo=encabezado.querySelector('.kw-header-title');
    if(!titulo){titulo=document.createElement('span');titulo.className='kw-header-title';(encabezado.querySelector('.kw-header-capsula')||encabezado).appendChild(titulo);}
    const tituloPagina=document.querySelector('.vista-lista-title,.kw-page-titulo,.page-title,main > .encabezado > h1');
    if(titulo){const texto=esFirmas?'Firmas Digitales':tituloPagina?.textContent.trim()||titulo.textContent.trim()||document.title.split(/[|·]/)[0].trim();if(titulo.textContent!==texto)titulo.textContent=texto;titulo.setAttribute('title',texto);}
    if(tituloPagina&&!tituloPagina.classList.contains('kw-movil-titulo-origen'))tituloPagina.classList.add('kw-movil-titulo-origen');
    let sueltos=encabezado.querySelector('.kw-header-sueltos');
    if(!sueltos){sueltos=document.createElement('div');sueltos.className='kw-header-sueltos';encabezado.appendChild(sueltos);}
    if(creado&&!menu)prepararNavegacion();
    if(menu){const volver=menu.querySelector('[data-kw-movil-regresar]');const formulario=visible(document.getElementById('vista-formulario'));volver.href=formulario?location.pathname:'/documentos/documentos.html';volver.textContent=formulario?'Volver al listado':'Volver a documentos';}
    let capsula=encabezado.querySelector('.kw-header-capsula');
    if(!capsula){capsula=document.createElement('div');capsula.className='kw-header-capsula';encabezado.prepend(capsula);capsula.appendChild(titulo);}
    const navegacion=encabezado.querySelector('#kw-drawer-toggle,#kw-movil-menu');
    if(navegacion&&navegacion.parentElement!==capsula)capsula.prepend(navegacion);
    const campana=document.getElementById('notif-bell-slot');
    if(campana&&campana.parentElement!==sueltos)mover(campana,sueltos);
    document.querySelectorAll('.kw-lateral .kw-lateral-buscador').forEach(nodo=>{
      const principal=document.querySelector('.kw-lateral-principal,.kw-universal-principal')||document.querySelector('main');
      if(principal){mover(nodo,principal);nodo.classList.add('kw-movil-buscar');principal.prepend(nodo);}
    });
    if(!esFirmas)document.querySelectorAll('.kw-page-acciones > :is(.kw-menu-ancla,#btn-nuevo,.btn-nuevo-doc,.btn-nuevo-asesor,.btn-reportar,.btn-nuevo),.vista-lista-header > .btn-nuevo-documento,#comprador-acciones > #abrir-cliente').forEach(nodo=>{
      if(!visible(nodo))return;
      const registro=mover(nodo,sueltos);
      if(nodo.matches('#btn-nuevo,.btn-nuevo-doc,.btn-nuevo-documento,.btn-nuevo-asesor,.btn-reportar,.btn-nuevo,#abrir-cliente')){
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
