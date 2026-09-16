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

    let cierrePendiente = 0;
    const sincronizar = () => {
      const abierto = drawer.classList.contains('open');
      window.clearTimeout(cierrePendiente);

      if (abierto) {
        document.body.classList.remove('menu-global-cerrando');
        document.body.classList.add('menu-global-abierto');
        return;
      }

      if (!document.body.classList.contains('menu-global-abierto')) return;
      document.body.classList.remove('menu-global-abierto');
      document.body.classList.add('menu-global-cerrando');
      cierrePendiente = window.setTimeout(() => {
        document.body.classList.remove('menu-global-cerrando');
      }, 360);
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
