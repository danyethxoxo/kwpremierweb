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
  function adaptar() {
    if (!document.body.hasAttribute('data-kw-universal-adaptar')) return;
    const principal = document.querySelector('body > main.page, body > main.kw-page');
    if (!principal) return;
    document.body.classList.add('kw-pagina-universal', 'kw-universal-adaptada');
    principal.classList.add('kw-universal-principal');
    let encabezado = principal.querySelector('.kw-page-encabezado, .cabecera-pagina');
    const titulo = principal.querySelector('h1.page-title, h1.kw-page-titulo');
    if (!encabezado && titulo) {
      encabezado = document.createElement('div');
      titulo.before(encabezado);
      encabezado.appendChild(titulo);
    }
    if (encabezado) {
      encabezado.classList.add('kw-universal-encabezado', 'kw-page-encabezado', 'kw-acciones-firmas');
      if (titulo) titulo.classList.add('kw-page-titulo');
      if (!encabezado.querySelector('.kw-page-acciones')) {
        const acciones = document.createElement('div');
        acciones.className = 'kw-page-acciones';
        encabezado.appendChild(acciones);
      }
    }
    iniciar();
  }
  window.kwPaginaUniversal = Object.freeze({ iniciar: iniciar });
  function preparar() { adaptar(); iniciar(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',preparar,{once:true});
  else preparar();
})();
