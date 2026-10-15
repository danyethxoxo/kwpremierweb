(function (global) {
  'use strict';
  const esc = v => String(v || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function prepararFormularioFijo(raiz) {
    if(!raiz || raiz.dataset.kwFormularioFijo)return;
    const acciones=raiz.querySelector('.desktop-btn-row');if(!acciones)return;
    const descarga=acciones.querySelector('#btn-pdf');
    if(descarga){const icono=descarga.querySelector('svg');descarga.setAttribute('aria-label','Descargar');descarga.setAttribute('title','Descargar');descarga.innerHTML=(icono?icono.outerHTML:'')+' Descargar';}
    document.body.classList.add('kw-documento-shell');
    raiz.dataset.kwFormularioFijo='1';raiz.classList.add('kw-form-fija');
    const mensaje=raiz.querySelector('#guardar-msg, [data-kw-mensaje]');
    const scroll=document.createElement('div');scroll.className='kw-form-scroll';
    Array.from(raiz.children).forEach(hijo=>{
      if(hijo.matches('.kw-revision-tabs,.kw-revision-panel')||hijo===acciones||hijo===mensaje)return;
      scroll.appendChild(hijo);
    });
    const pie=document.createElement('div');pie.className='kw-form-acciones';pie.appendChild(acciones);if(mensaje)pie.appendChild(mensaje);
    const panel=raiz.querySelector('.kw-revision-panel');raiz.insertBefore(scroll,panel?panel.nextSibling:raiz.firstChild);raiz.appendChild(pie);
    const encabezado=raiz.querySelector('.acuerdos-form-heading');if(encabezado)raiz.insertBefore(encabezado,scroll);
  }
  function montar(config) {
    const cont=document.querySelector('[data-kw-documento-shell]');if(!cont)return;
    const titulo=esc(config.titulo),p=esc(config.id||'documento');
    cont.innerHTML=`<div id="vista-lista" class="vista-lista"><div class="lista-sticky-bar"><div class="vista-lista-header"><div class="vista-lista-title">${titulo}</div><button type="button" class="btn-nuevo-documento" id="btn-nuevo">+ Crear nuevo documento</button></div><div class="lista-barra"><div class="lista-buscador"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><path d="m17 17 4 4"/></svg><input type="search" id="buscador-input" placeholder="Buscar documento…" aria-label="Buscar documento"></div><div class="kw-tabs" data-kw-tabs="lista-columnas" id="lista-tabs-mobile"><button type="button" class="kw-tab activo" data-tab="borradores">Borradores</button><button type="button" class="kw-tab" data-tab="finalizados">Finalizados</button></div></div></div><div class="lista-columnas kw-tabpanels" id="lista-columnas"><div class="lista-columna kw-tabpanel activo" data-panel="borradores"><div class="lista-columna-title">Borradores</div><div class="lista-documentos" id="lista-borradores"></div></div><div class="lista-columna kw-tabpanel" data-panel="finalizados"><div class="lista-columna-title lista-columna-title-finalizados">Finalizados</div><div class="lista-documentos" id="lista-finalizados"></div></div></div></div>
      <div id="vista-formulario" class="vista-formulario" hidden><div class="mobile-tabs"><button type="button" class="mobile-tab active" data-kw-mobile="form">Formulario</button><button type="button" class="mobile-tab" data-kw-mobile="preview">Vista previa</button></div><div class="acuerdos-body"><div class="acuerdos-form-col" id="acuerdos-form-col"><div class="acuerdos-form-heading"><div class="acuerdos-form-title">${titulo}</div></div><form class="kw-documentos-formulario" id="formulario-${p}"><div id="${p}-campos"></div></form><div class="desktop-btn-row">${config.acciones.map(a=>`<button type="${a.tipo||'button'}" id="${esc(a.id)}" class="btn-download ${esc(a.clase||'')}" data-kw-accion="${esc(a.accion)}"${a.tipo==='submit'?' form="formulario-'+p+'"':''}${a.oculto?' hidden':''}>${esc(a.texto)}</button>`).join('')}</div><p id="${p}-mensaje" data-kw-mensaje role="status" aria-live="polite"></p></div><div class="acuerdos-preview-col" aria-label="Vista previa del documento"><div class="page-stack" id="${p}-paginas"></div></div></div></div>`;
    prepararFormularioFijo(document.getElementById('acuerdos-form-col'));
    cont.querySelectorAll('[data-kw-mobile]').forEach(b=>b.onclick=()=>mobile(b.dataset.kwMobile));
    global.kwUI?.tabs();
    vista(false,false);
  }
  function mobile(panel) {
    const formulario=document.getElementById('vista-formulario');if(!formulario)return;
    formulario.dataset.mobilePanel=panel;
    formulario.querySelectorAll('[data-kw-mobile]').forEach(b=>b.classList.toggle('active',b.dataset.kwMobile===panel));
    global.fitPreviewMobile?.();
  }
  function vista(formulario,marcar=true) {
    const lista=document.getElementById('vista-lista'),form=document.getElementById('vista-formulario');
    document.body.classList.toggle('en-lista-documentos',!formulario);
    lista.hidden=formulario;lista.style.display=formulario?'none':'';lista.style.visibility=formulario?'hidden':'';
    form.hidden=!formulario;form.style.display=formulario?'':'none';
    if(formulario){mobile('form');if(marcar)history.pushState({kwVista:'formulario'},'',location.href);requestAnimationFrame(()=>global.fitPreviewMobile?.());}
  }
  async function transicion(accion) {
    const cerrar=global.kwUI?.cargando('Abriendo documento')||(()=>{});
    try{await accion();await new Promise(resolve=>requestAnimationFrame(resolve));}finally{cerrar();}
  }
  function pedirNombre(nombre) {
    let modal=document.getElementById('modal-nombre');
    if(!modal){modal=document.createElement('div');modal.id='modal-nombre';modal.className='modal-overlay';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','modal-nombre-titulo');modal.innerHTML='<form class="modal-box" id="kw-documento-nombre-form"><h3 id="modal-nombre-titulo">Nombre del documento</h3><p class="modal-sub">Así lo verás en tu lista de documentos guardados.</p><div class="acuerdo-field"><label for="modal-nombre-input">Nombre del documento</label><input id="modal-nombre-input" maxlength="180" required autocomplete="off"></div><div class="modal-actions"><button type="button" class="btn-modal-cancelar" data-cancelar>Cancelar</button><button type="submit" class="btn-modal-confirmar">Guardar borrador</button></div></form>';document.body.appendChild(modal);}
    return new Promise(resolve=>{
      const input=modal.querySelector('input');input.value=nombre||'Documento';modal.style.display='flex';
      function cerrar(valor){modal.style.display='none';document.removeEventListener('keydown',escape);resolve(valor);}
      function escape(e){if(e.key==='Escape')cerrar(null);}
      modal.querySelector('form').onsubmit=e=>{e.preventDefault();if(input.value.trim())cerrar(input.value.trim());};
      modal.querySelector('[data-cancelar]').onclick=()=>cerrar(null);document.addEventListener('keydown',escape);input.focus();input.select();
    });
  }
  global.kwDocumentosShell={montar,prepararFormularioFijo,vista,mobile,transicion,pedirNombre};
})(window);
