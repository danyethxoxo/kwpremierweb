(function(global){
  'use strict';
  const normalizar=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function preparar(select){
    const caja=select.closest('.kw-select');
    if(!caja||caja.querySelector('.kw-select-busqueda'))return;
    const btn=caja.querySelector('.kw-select-btn'),menu=caja.querySelector('.kw-select-menu');
    const buscar=document.createElement('input');buscar.type='text';buscar.className='kw-select-busqueda';buscar.autocomplete='off';buscar.spellcheck=false;
    buscar.setAttribute('role','combobox');buscar.setAttribute('aria-autocomplete','list');
    buscar.setAttribute('aria-label',select.labels?.[0]?.textContent.trim()||select.getAttribute('aria-label')||'Buscar');
    menu.id=select.id+'-opciones';buscar.setAttribute('aria-controls',menu.id);btn.tabIndex=-1;
    select.setAttribute('aria-hidden','true');select.tabIndex=-1;btn.setAttribute('aria-hidden','true');buscar.setAttribute('aria-required',String(select.required));
    caja.classList.add('kw-select-buscable');caja.appendChild(buscar);
    const estilo=getComputedStyle(btn);
    ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing'].forEach(p=>{buscar.style[p]=estilo[p];});
    function posicionar(){
      if(!caja.classList.contains('abierto'))return;
      const r=caja.getBoundingClientRect(),arriba=caja.classList.contains('hacia-arriba');
      const alto=Math.max(60,Math.min(274,arriba?r.top-14:innerHeight-r.bottom-14));
      menu.style.width=Math.min(Math.max(r.width,280),innerWidth-24)+'px';
      menu.style.maxHeight=alto+'px';
      menu.style.left=Math.max(12,Math.min(r.left,innerWidth-menu.offsetWidth-12))+'px';
      menu.style.right='auto';menu.style.top=(arriba?Math.max(8,r.top-menu.offsetHeight-6):r.bottom+6)+'px';
    }
    function sincronizar(){
      const abierto=caja.classList.contains('abierto');buscar.disabled=select.matches(':disabled');buscar.setAttribute('aria-expanded',String(abierto));
      buscar.placeholder=select.options[select.selectedIndex]?.textContent||'Seleccionar';
      if(!abierto){buscar.value='';buscar.removeAttribute('aria-activedescendant');}
      posicionar();
    }
    function filtrar(){
      menu.querySelectorAll('.kw-select-opcion').forEach(op=>{
        op.hidden=!normalizar(op.textContent).includes(normalizar(buscar.value));
        op.id=menu.id+'-'+op.dataset.i;op.classList.remove('resaltada');
      });
      buscar.removeAttribute('aria-activedescendant');
    }
    function abrir(){if(buscar.disabled)return;if(!caja.classList.contains('abierto'))btn.click();filtrar();sincronizar();}
    function cerrar(){if(caja.classList.contains('abierto'))btn.click();sincronizar();}
    buscar.addEventListener('click',e=>{e.stopPropagation();abrir();});
    buscar.addEventListener('input',e=>{e.stopPropagation();abrir();});
    buscar.addEventListener('keydown',e=>{
      e.stopPropagation();
      if(e.key==='Escape'||e.key==='Tab'){cerrar();return;}
      if(!['ArrowDown','ArrowUp','Enter'].includes(e.key))return;
      e.preventDefault();
      if(!caja.classList.contains('abierto'))abrir();
      const opciones=Array.from(menu.querySelectorAll('.kw-select-opcion:not([hidden]):not([disabled])'));
      if(!opciones.length)return;
      const actual=opciones.findIndex(op=>op.classList.contains('resaltada'));
      if(e.key==='Enter'){opciones[Math.max(0,actual)].click();buscar.focus();return;}
      const siguiente=actual<0?(e.key==='ArrowUp'?opciones.length-1:0):(actual+(e.key==='ArrowUp'?-1:1)+opciones.length)%opciones.length;
      opciones.forEach(op=>op.classList.remove('resaltada'));opciones[siguiente].classList.add('resaltada');
      buscar.setAttribute('aria-activedescendant',opciones[siguiente].id);opciones[siguiente].scrollIntoView({block:'nearest'});
    });
    select.addEventListener('change',()=>{buscar.value='';sincronizar();});
    menu.addEventListener('click',e=>{if(e.target.closest('.kw-select-opcion')){sincronizar();buscar.focus();}});
    select.labels?.[0]?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();buscar.focus();abrir();},{capture:true});
    new MutationObserver(sincronizar).observe(caja,{attributes:true,attributeFilter:['class']});
    new MutationObserver(sincronizar).observe(select,{attributes:true,childList:true,subtree:true,attributeFilter:['disabled']});
    document.addEventListener('scroll',posicionar,true);global.addEventListener('resize',posicionar);
    sincronizar();
  }
  global.kwSelectBusqueda={preparar};
})(window);
