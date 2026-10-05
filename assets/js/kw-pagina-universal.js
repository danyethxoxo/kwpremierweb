(function () {
  'use strict';
  function iniciar() {
    const raiz = document.querySelector('.kw-pagina-universal');
    if (!raiz || raiz.dataset.universalLista) return;
    raiz.dataset.universalLista = 'si';
    raiz.querySelectorAll('.kw-universal-encabezado').forEach(function (el) { el.classList.add('kw-acciones-firmas'); });
    raiz.querySelectorAll('[data-kw-menu-universal]').forEach(function (boton) {
      const menu = document.getElementById(boton.getAttribute('aria-controls'));
      if (!menu) return;
      function cerrar() { menu.hidden = true; boton.setAttribute('aria-expanded','false'); }
      boton.addEventListener('click',function (e) {
        e.stopPropagation(); const abrir = menu.hidden;
        menu.hidden = !abrir; boton.setAttribute('aria-expanded',String(abrir));
        if (abrir && window.kwUI) window.kwUI.colgarMenu(boton,menu);
      });
      document.addEventListener('click',function (e) { if (!menu.contains(e.target) && !boton.contains(e.target)) cerrar(); });
      document.addEventListener('keydown',function (e) { if (e.key === 'Escape' && !menu.hidden) { cerrar(); boton.focus(); } });
      menu.addEventListener('click',function (e) { if (e.target.closest('[role="menuitem"]')) cerrar(); });
    });
  }
  window.kwPaginaUniversal = Object.freeze({ iniciar: iniciar });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',iniciar,{once:true});
  else iniciar();
})();
