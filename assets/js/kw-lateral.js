(function () {
  'use strict';

  function iniciar() {
    const drawer = document.getElementById('drawer');
    const menuDrawer = document.getElementById('drawer-hamburguesa');
    const botones = document.querySelectorAll('[data-kw-menu-principal]');
    if (!drawer || !menuDrawer || !botones.length) return;

    botones.forEach((boton) => {
      boton.addEventListener('click', (evento) => {
        evento.stopPropagation();
        menuDrawer.click();
      });
    });

    const sincronizar = () => {
      document.body.classList.toggle('menu-global-abierto', drawer.classList.contains('open'));
    };
    new MutationObserver(sincronizar).observe(drawer, {
      attributes: true,
      attributeFilter: ['class']
    });
    sincronizar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  } else {
    iniciar();
  }
})();
