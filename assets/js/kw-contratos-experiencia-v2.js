(function(global){
 'use strict';
 const raiz=()=>document.getElementById('acuerdos-form-col');
 function ruta(id){history.replaceState({kwVista:id===null?'lista':'formulario'},'',location.pathname+(id===null?'':id?'?doc='+encodeURIComponent(id):'?nuevo=1'));}
 function nuevo(){if(!new URLSearchParams(location.search).has('nuevo')){location.assign(location.pathname+'?nuevo=1');return true;}return false;}
 function faltantes(){
  const vistos=new Set();
  return Array.from(raiz().querySelectorAll('.kw-form-scroll input[id],.kw-form-scroll select[id],.kw-form-scroll textarea[id]')).filter(el=>{
   if(!/^(f-|com-)/.test(el.id)||el.disabled||el.hidden||el.matches('[type="hidden"],[type="checkbox"],[type="radio"]')||el.closest('[hidden]'))return false;
   return !el.value.trim();
  }).map(el=>{
   const label=document.querySelector('label[for="'+CSS.escape(el.id)+'"]')||el.closest('.acuerdo-field')?.querySelector('label');
   let nombre=label?.textContent.trim()||el.placeholder||el.id;
   const cliente=el.id.match(/^f-cli(\d+)-/)||el.id.match(/^f-cliente(\d+)$/)||el.id.match(/^f-domicilio-cliente(\d+)$/);
   const comercial=el.id.match(/_(\d+)$/);
   if(cliente)nombre='Cliente '+(Number(cliente[1])+1)+': '+nombre;
   else if(comercial)nombre='Cliente '+comercial[1]+': '+nombre;
   return nombre;
  }).filter(nombre=>{if(vistos.has(nombre))return false;vistos.add(nombre);return true;});
 }
 async function confirmar(lista=faltantes()){
  if(!lista.length)return true;
  return new Promise(resolve=>{
   const antes=document.activeElement,overlay=document.createElement('div');overlay.className='modal-overlay';overlay.id='kw-borrador-incompleto';
   const caja=document.createElement('div');caja.className='modal-box';caja.setAttribute('role','dialog');caja.setAttribute('aria-modal','true');caja.setAttribute('aria-labelledby','kw-faltantes-titulo');
   caja.innerHTML='<h3 id="kw-faltantes-titulo">Aún faltan llenar estos campos:</h3><ul class="kw-campos-pendientes"></ul><div class="modal-actions"><button type="button" class="btn-modal-cancelar">Cancelar</button><button type="button" class="btn-modal-confirmar">Guardar</button></div>';
   for(const nombre of lista){const li=document.createElement('li');li.textContent=nombre;caja.querySelector('ul').appendChild(li);}
   function cerrar(valor){document.removeEventListener('keydown',tecla);overlay.remove();antes?.focus();resolve(valor);}
   function tecla(e){if(e.key==='Escape')cerrar(false);if(e.key==='Tab'){const botones=Array.from(caja.querySelectorAll('button'));if(e.shiftKey&&document.activeElement===botones[0]){e.preventDefault();botones[1].focus();}else if(!e.shiftKey&&document.activeElement===botones[1]){e.preventDefault();botones[0].focus();}}}
   caja.querySelector('.btn-modal-cancelar').onclick=()=>cerrar(false);caja.querySelector('.btn-modal-confirmar').onclick=()=>cerrar(true);overlay.appendChild(caja);document.body.appendChild(overlay);document.addEventListener('keydown',tecla);caja.querySelector('.btn-modal-cancelar').focus();
  });
 }
 function exito(titulo='Guardado con éxito',detalle=''){
  let aviso=document.getElementById('guardar-exito');
  if(!aviso){aviso=document.createElement('div');aviso.id='guardar-exito';aviso.className='guardar-exito';aviso.innerHTML='<div class="guardar-exito-caja" role="status" aria-live="polite"><div class="guardar-exito-icono" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg></div><div class="guardar-exito-titulo" id="guardar-exito-titulo"></div><div class="guardar-exito-detalle" id="guardar-exito-detalle"></div><button type="button" class="guardar-exito-ok">OK</button></div>';document.body.appendChild(aviso);}
  aviso.querySelector('.guardar-exito-titulo').textContent=titulo;aviso.querySelector('.guardar-exito-detalle').textContent=detalle;aviso.querySelector('.guardar-exito-detalle').hidden=!detalle;aviso.style.display='flex';aviso.classList.add('visible');aviso.setAttribute('aria-hidden','false');
  aviso.querySelector('.guardar-exito-ok').onclick=()=>{aviso.style.display='none';aviso.classList.remove('visible');aviso.setAttribute('aria-hidden','true');};aviso.querySelector('button').focus();
 }
 function secciones(){document.querySelectorAll('.acuerdo-grupo').forEach((grupo,i)=>grupo.open=i===0);}
 function miniaturas(){
  const preview=document.querySelector('.kw-documento-preview-zoom'),hojas=preview?.querySelector('.kw-documento-hojas');if(!preview||!hojas)return;
  preview.classList.add('kw-con-miniaturas');
  const rail=document.createElement('nav');rail.className='kw-contrato-miniaturas';rail.setAttribute('aria-label','Páginas del contrato');preview.appendChild(rail);
  const toggle=document.createElement('button');toggle.type='button';toggle.dataset.miniaturas='';toggle.setAttribute('aria-label','Miniaturas de las páginas');toggle.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 3h6v8H3z M15 3h6v8h-6z M3 15h6v6H3z M15 15h6v6h-6z"/></svg><span class="kw-miniaturas-label">Miniaturas</span><span class="kw-miniaturas-total"></span>';preview.querySelector('.kw-documento-zoom').prepend(toggle);
  const media=matchMedia('(min-width:901px)');
  function abrir(valor){preview.classList.toggle('miniaturas-abiertas',valor);toggle.setAttribute('aria-expanded',String(valor));global.fitPreviewMobile?.();}
  abrir(media.matches);media.addEventListener('change',e=>abrir(e.matches));toggle.onclick=()=>abrir(!preview.classList.contains('miniaturas-abiertas'));
  function actualizar(){
   const paginas=Array.from(hojas.querySelectorAll('.page.kw-contrato-hoja'));
   toggle.querySelector('.kw-miniaturas-total').textContent='('+paginas.length+')';toggle.setAttribute('aria-label','Miniaturas, '+paginas.length+' páginas');
   paginas.forEach((pagina,i)=>{
    let boton=rail.children[i];if(!boton){boton=document.createElement('button');boton.type='button';boton.className='kw-contrato-miniatura';boton.innerHTML='<span class="kw-miniatura-lienzo" aria-hidden="true"></span><span class="kw-miniatura-numero"></span>';rail.appendChild(boton);}
    boton.setAttribute('aria-label','Página '+(i+1)+' de '+paginas.length);boton.lastChild.textContent=String(i+1);
    const copia=pagina.cloneNode(true);copia.classList.remove('page');copia.classList.add('kw-miniatura-hoja');copia.removeAttribute('style');copia.setAttribute('aria-hidden','true');
    copia.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));boton.firstChild.replaceChildren(copia);
    boton.onclick=()=>{const actual=hojas.querySelectorAll('.page.kw-contrato-hoja')[i];if(actual)hojas.scrollTo({top:hojas.scrollTop+actual.getBoundingClientRect().top-hojas.getBoundingClientRect().top-12,behavior:'smooth'});};
   });
   while(rail.children.length>paginas.length)rail.lastChild.remove();resaltar();
  }
  function resaltar(){
   const paginas=Array.from(hojas.querySelectorAll('.page.kw-contrato-hoja')),arriba=hojas.getBoundingClientRect().top+30;
   const indice=paginas.findIndex(p=>p.getBoundingClientRect().bottom>arriba);
   Array.from(rail.children).forEach((b,i)=>{b.classList.toggle('activo',i===indice);if(i===indice)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  }
  let frame;hojas.addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;resaltar();});},{passive:true});document.addEventListener('kw-contrato-render',actualizar);actualizar();
 }
 function iniciar(){
  document.querySelectorAll('.kw-contrato-volver,#comercial-volver').forEach(boton=>boton.remove());
  document.body.classList.add('kw-contratos');
  miniaturas();
  document.querySelector('.acuerdos-form-sub')?.remove();secciones();
  const acciones=raiz()?.querySelector('.desktop-btn-row');acciones?.classList.add('form-actions');
  document.querySelectorAll('[data-kw-mobile]').forEach(btn=>{const path=btn.dataset.kwMobile==='form'?'M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z':'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0';btn.insertAdjacentHTML('afterbegin','<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="'+path+'"/></svg>');});
  const iconos={guardar:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z M17 21v-8H7v8 M7 3v5h8',finalizar:'M9 12l2 2 4-4 M12 3l8 4v6c0 5-8 8-8 8S4 18 4 13V7Z',descargar:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',copiar:'M9 9h12v12H9z M5 15H3V3h12v2'};
  acciones?.querySelectorAll('[data-kw-accion]').forEach(btn=>{const accion=btn.dataset.kwAccion;if(!iconos[accion])return;const texto={guardar:'Guardar Borrador',finalizar:'Finalizar',descargar:'Descargar',copiar:'Hacer una copia'}[accion];btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="'+iconos[accion]+'"/></svg> '+texto;});
  if(typeof global.guardarDocumento==='function'){
   const guardar=global.guardarDocumento;let ocupado=false;
   global.guardarDocumento=async function(){if(ocupado)return;ocupado=true;try{if(await confirmar()){const resultado=await guardar();if(documentoActualId)ruta(documentoActualId);return resultado;}}finally{ocupado=false;}};
   const guardarNuevo=global.guardarComoNuevo;global.guardarComoNuevo=async function(...args){await guardarNuevo(...args);if(documentoActualId)ruta(documentoActualId);};
   const crear=global.crearNuevoDocumento;global.crearNuevoDocumento=function(){if(nuevo())return;secciones();return crear();};
   const abrir=global.abrirDocumentoGuardado;global.abrirDocumentoGuardado=function(row,marcar){if(row?.id&&marcar!==false&&new URLSearchParams(location.search).get('doc')!==row.id){location.assign(location.pathname+'?doc='+encodeURIComponent(row.id));return;}secciones();return abrir(row,marcar);};
   const vista=global.mostrarVista;global.mostrarVista=function(v,marcar){if(v==='lista'&&marcar!==false)ruta(null);if(v==='formulario'){if(documentoActualId)ruta(documentoActualId);if(location.search)marcar=false;}return vista(v,marcar);};
   if(!global.mostrarGuardadoExito)global.mostrarGuardadoExito=exito;
   global.setGuardarMsg=function(texto,kind){const el=document.getElementById('guardar-msg');if(el){el.textContent='';el.style.display='none';}if(!texto)return;if(kind==='error')global.kwUI.alert(texto,{titulo:'Revisa el documento'});else if(/guardad/i.test(texto))exito();else if(/finalizado/i.test(texto))exito('Documento finalizado',texto);};
  }
 }
 global.kwContratosUX={confirmar,faltantes,exito,ruta,nuevo,secciones};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})(window);
