(function () {
  'use strict';

  const script = document.currentScript;
  const escritorio = window.matchMedia('(min-width: 1024px)');
  const fuentes = [];

  function iconoSwitch() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h11m0 0-3-3m3 3-3 3M17 17H6m0 0 3 3m-3-3 3-3"/></svg>';
  }

  function tituloPagina() {
    return (script && script.dataset.titulo) ||
      document.querySelector('.kw-header-title, .kw-page-titulo, .page-title')?.textContent?.trim() ||
      document.title.replace(/\s*[|·-].*$/, '').trim() ||
      'Herramientas';
  }

  function crearBarra() {
    if (document.querySelector('.kw-lateral')) return null;

    const lateral = document.createElement('aside');
    lateral.className = 'kw-lateral kw-lateral-universal';
    lateral.setAttribute('aria-label', 'Filtros y herramientas de ' + tituloPagina());
    lateral.innerHTML =
      '<div class="kw-lateral-cabecera">' +
        '<a class="kw-lateral-logo" href="/kwpremierweb/portal.html" aria-label="Ir al inicio del Hub">' +
          '<img src="/kwpremierweb/assets/img/logo-kw-premier.png" alt="KW Premier">' +
        '</a>' +
        '<button type="button" class="kw-lateral-menu" data-kw-menu-principal ' +
          'aria-label="Mostrar menú del Hub" title="Mostrar menú del Hub">' + iconoSwitch() + '</button>' +
      '</div>' +
      '<div class="kw-lateral-contexto">' +
        '<span class="kw-lateral-eyebrow">Vista actual</span>' +
        '<strong>' + tituloPagina().replace(/[&<>"']/g, function (c) {
          return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
        }) + '</strong>' +
      '</div>' +
      '<div class="kw-lateral-contenido"></div>';

    document.body.insertBefore(lateral, document.body.firstChild);
    document.body.classList.add('kw-lateral-universal-activa');
    return lateral;
  }

  function prepararFuentes(lateral) {
    if (!lateral || !script || !script.dataset.filtros) return;
    const contenedor = lateral.querySelector('.kw-lateral-contenido');
    script.dataset.filtros.split('|').map(function (selector) {
      return selector.trim();
    }).filter(Boolean).forEach(function (selector) {
      const nodo = document.querySelector(selector);
      if (!nodo || lateral.contains(nodo) || fuentes.some(function (item) { return item.nodo === nodo; })) return;
      const marca = document.createComment('kw-lateral:' + selector);
      nodo.parentNode.insertBefore(marca, nodo);
      fuentes.push({ nodo: nodo, marca: marca });
    });

    if (!fuentes.length) {
      contenedor.innerHTML = '<p class="kw-lateral-vacio">Esta página no necesita filtros.</p>';
    }
  }

  function acomodarFuentes(lateral) {
    if (!lateral || !fuentes.length) return;
    const contenedor = lateral.querySelector('.kw-lateral-contenido');
    if (escritorio.matches) {
      fuentes.forEach(function (item) {
        item.nodo.classList.add('kw-lateral-filtro-origen');
        contenedor.appendChild(item.nodo);
      });
    } else {
      fuentes.forEach(function (item) {
        item.nodo.classList.remove('kw-lateral-filtro-origen');
        item.marca.parentNode.insertBefore(item.nodo, item.marca.nextSibling);
      });
    }
  }

  function acomodarCampana(lateral) {
    const campana = document.getElementById('notif-bell-slot');
    if (!campana || !lateral || document.body.classList.contains('en-historial')) return;
    const cabecera = lateral.querySelector('.kw-lateral-cabecera');
    const menu = cabecera && cabecera.querySelector('.kw-lateral-menu');
    const sueltos = document.querySelector('.kw-header-sueltos');
    if (escritorio.matches && cabecera && menu) cabecera.insertBefore(campana, menu);
    else if (sueltos) sueltos.appendChild(campana);
  }

  function iniciar() {
    const lateral = crearBarra() || document.querySelector('.kw-lateral');
    const drawer = document.getElementById('drawer');
    const menuDrawer = document.getElementById('drawer-hamburguesa');
    const botones = document.querySelectorAll('[data-kw-menu-principal]');
    if (!lateral || !drawer || !menuDrawer || !botones.length) return;

    prepararFuentes(lateral);
    if (!fuentes.length && lateral.classList.contains('kw-lateral-universal')) {
      const contenedor = lateral.querySelector('.kw-lateral-contenido');
      if (contenedor && !contenedor.children.length) {
        contenedor.innerHTML = '<p class="kw-lateral-vacio">Esta página no necesita filtros.</p>';
      }
    }
    acomodarFuentes(lateral);
    acomodarCampana(lateral);
    escritorio.addEventListener('change', function () {
      acomodarFuentes(lateral);
      acomodarCampana(lateral);
    });

    botones.forEach(function (boton) {
      boton.addEventListener('click', function (evento) {
        evento.preventDefault();
        evento.stopPropagation();
        document.body.classList.add('kw-lateral-switch-usado');
        menuDrawer.click();
      });
    });

    let cierrePendiente = 0;
    const sincronizar = function () {
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
      cierrePendiente = window.setTimeout(function () {
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
