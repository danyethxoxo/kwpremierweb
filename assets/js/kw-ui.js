// Comportamiento de los componentes compartidos (ver kw-base.css).
//
// Se incluye al final del <body>, después del contenido:
//
//   <script src="/kwpremierweb/assets/js/kw-ui.js"></script>
//
// Hace tres cosas, solas, sin que la página tenga que llamar a nada:
//
//   1. Cambia cada <select> por un desplegable dibujado por nosotros.
//   2. Prende las pestañas con la pastilla que se desliza.
//   3. Mantiene marcados los chips de opción (radio y casilla).
//
// La regla que se respeta en todo el archivo: el elemento original
// nunca se quita. El <select> sigue ahí (invisible) guardando el valor
// y disparando "change", y los <input type="radio"> siguen siendo los
// que mandan. Por eso el código que ya existía en cada página no se
// entera de nada: sigue leyendo .value y escuchando onchange igual que
// siempre. Y si este archivo no carga, la página se ve más simple pero
// funciona completa.

(function (global) {
  'use strict';

  var FLECHA = '<svg class="kw-select-flecha" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  var CHECK = '<svg class="kw-select-opcion-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>';

  function esc(t) {
    var d = document.createElement('div');
    d.textContent = t == null ? '' : t;
    return d.innerHTML;
  }

  // ═════════════════════════════════════════════════════════════
  // Selector desplegable
  // ═════════════════════════════════════════════════════════════

  var abiertoAhora = null;   // solo un menú abierto a la vez

  function cerrarAbierto() {
    if (!abiertoAhora) return;
    abiertoAhora.classList.remove('abierto');
    var btn = abiertoAhora.querySelector('.kw-select-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    abiertoAhora = null;
  }

  // Un select dentro de un flex o un grid trae medidas puestas por la
  // página (por ejemplo "flex:1" o "grid-column:span 2"). Como el que
  // ahora ocupa ese lugar es el envoltorio, hay que pasárselas o la
  // fila se descuadra.
  function heredarMedidas(select, caja) {
    var c = getComputedStyle(select);
    ['flex-grow', 'flex-shrink', 'flex-basis', 'grid-column', 'grid-row',
     'min-width', 'max-width', 'margin-bottom'].forEach(function (prop) {
      var v = c.getPropertyValue(prop);
      if (v && v !== 'auto' && v !== 'normal' && v !== '0px' && v !== 'none') {
        caja.style.setProperty(prop, v);
      }
    });
  }

  function textoDe(select) {
    var op = select.options[select.selectedIndex];
    return op ? op.textContent : '';
  }

  // Un valor vacío casi siempre es el "Todos …" de un filtro: se pinta
  // apagado para que se note de un vistazo si el filtro está puesto.
  function pintarValor(caja, select) {
    var span = caja.querySelector('.kw-select-valor');
    if (!span) return;
    span.textContent = textoDe(select);
    span.classList.toggle('vacio', select.value === '');
  }

  function pintarMenu(caja, select) {
    var menu = caja.querySelector('.kw-select-menu');
    if (!menu) return;
    menu.innerHTML = Array.prototype.map.call(select.options, function (op, i) {
      return '<button type="button" role="option" class="kw-select-opcion' +
        (i === select.selectedIndex ? ' elegida' : '') + '" data-i="' + i + '"' +
        ' aria-selected="' + (i === select.selectedIndex ? 'true' : 'false') + '"' +
        (op.disabled ? ' disabled' : '') + '>' +
        '<span class="kw-select-opcion-texto">' + esc(op.textContent) + '</span>' + CHECK +
      '</button>';
    }).join('');
  }

  function elegir(caja, select, i) {
    if (i < 0 || i >= select.options.length) return;
    if (select.options[i].disabled) return;
    var cambio = select.selectedIndex !== i;
    select.selectedIndex = i;
    pintarValor(caja, select);
    pintarMenu(caja, select);
    // El "change" es lo que hace que el código de la página se entere;
    // el <select> por sí solo no lo dispara cuando se cambia por código.
    if (cambio) select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function resaltar(caja, i) {
    var ops = caja.querySelectorAll('.kw-select-opcion');
    ops.forEach(function (o) { o.classList.remove('resaltada'); });
    if (ops[i]) {
      ops[i].classList.add('resaltada');
      ops[i].scrollIntoView({ block: 'nearest' });
    }
  }

  function indiceResaltado(caja) {
    var ops = Array.prototype.slice.call(caja.querySelectorAll('.kw-select-opcion'));
    var i = ops.findIndex(function (o) { return o.classList.contains('resaltada'); });
    return i;
  }

  function abrir(caja, select) {
    if (caja.classList.contains('deshabilitado')) return;
    cerrarAbierto();

    // Si de este lado de la pantalla ya no queda espacio abajo, el menú
    // se abre hacia arriba en vez de salirse.
    var r = caja.getBoundingClientRect();
    var abajo = window.innerHeight - r.bottom;
    caja.classList.toggle('hacia-arriba', abajo < 300 && r.top > abajo);

    pintarMenu(caja, select);
    caja.classList.add('abierto');
    caja.querySelector('.kw-select-btn').setAttribute('aria-expanded', 'true');
    abiertoAhora = caja;
    resaltar(caja, select.selectedIndex);
  }

  function armarSelect(select) {
    if (select.multiple || select.dataset.kwListo) return;
    select.dataset.kwListo = '1';

    var caja = document.createElement('div');
    caja.className = 'kw-select';
    heredarMedidas(select, caja);

    select.parentNode.insertBefore(caja, select);
    caja.appendChild(select);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kw-select-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="kw-select-valor"></span>' + FLECHA;

    var menu = document.createElement('div');
    menu.className = 'kw-select-menu';
    menu.setAttribute('role', 'listbox');

    caja.appendChild(btn);
    caja.appendChild(menu);

    // La etiqueta del <label for="..."> sigue sirviendo para abrirlo.
    if (select.id) {
      var lbl = document.querySelector('label[for="' + select.id + '"]');
      if (lbl) lbl.addEventListener('click', function (e) { e.preventDefault(); btn.focus(); abrir(caja, select); });
    }

    pintarValor(caja, select);
    caja.classList.toggle('deshabilitado', select.disabled);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (caja.classList.contains('abierto')) cerrarAbierto();
      else abrir(caja, select);
    });

    menu.addEventListener('click', function (e) {
      var op = e.target.closest('.kw-select-opcion');
      if (!op) return;
      e.stopPropagation();
      elegir(caja, select, Number(op.dataset.i));
      cerrarAbierto();
      btn.focus();
    });

    btn.addEventListener('keydown', function (e) {
      var abiertoYa = caja.classList.contains('abierto');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!abiertoYa) return abrir(caja, select);
        var n = select.options.length;
        var i = indiceResaltado(caja);
        if (i < 0) i = select.selectedIndex;
        resaltar(caja, (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!abiertoYa) return abrir(caja, select);
        var sel = indiceResaltado(caja);
        if (sel >= 0) elegir(caja, select, sel);
        cerrarAbierto();
      } else if (e.key === 'Escape' && abiertoYa) {
        e.preventDefault();
        cerrarAbierto();
      } else if (e.key === 'Tab' && abiertoYa) {
        cerrarAbierto();
      }
    });

    // Las páginas rellenan sus filtros con innerHTML después de traer
    // los datos ("Todos los asesores" + uno por asesor). Si no se mira
    // ese cambio, el desplegable se queda con la lista vieja.
    new MutationObserver(function () {
      pintarValor(caja, select);
      if (caja.classList.contains('abierto')) pintarMenu(caja, select);
    }).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['value', 'disabled'] });

    // Y cuando el valor lo cambia el propio código de la página.
    select.addEventListener('change', function () { pintarValor(caja, select); });
  }

  function armarSelects(raiz) {
    (raiz || document).querySelectorAll('select:not([data-kw-listo]):not([data-kw-no])')
      .forEach(armarSelect);
  }

  document.addEventListener('click', cerrarAbierto);
  window.addEventListener('resize', cerrarAbierto);

  // ═════════════════════════════════════════════════════════════
  // Pestañas
  // ═════════════════════════════════════════════════════════════

  function panelesDe(tabs) {
    var id = tabs.getAttribute('data-kw-tabs');
    return id ? document.getElementById(id) : tabs.parentNode.querySelector('.kw-tabpanels');
  }

  function moverIndicador(tabs) {
    var ind = tabs.querySelector('.kw-tabs-indicador');
    var act = tabs.querySelector('.kw-tab.activo');
    if (!ind || !act || !act.offsetWidth) return;
    ind.style.width = act.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + (act.offsetLeft - tabs.clientLeft) + 'px)';
    ind.classList.add('listo');
  }

  function activar(tabs, nombre) {
    var botones = Array.prototype.slice.call(tabs.querySelectorAll('.kw-tab'));
    var destino = botones.findIndex(function (b) { return b.dataset.tab === nombre; });
    if (destino < 0) return;
    var actual = botones.findIndex(function (b) { return b.classList.contains('activo'); });

    botones.forEach(function (b, i) {
      b.classList.toggle('activo', i === destino);
      b.setAttribute('aria-selected', i === destino ? 'true' : 'false');
    });

    var cont = panelesDe(tabs);
    if (cont) {
      // La dirección del deslizamiento sale de hacia qué lado te
      // moviste, para que se sienta como avanzar y regresar.
      cont.dataset.dir = (actual >= 0 && destino < actual) ? 'izq' : 'der';
      cont.querySelectorAll('.kw-tabpanel').forEach(function (p) {
        p.classList.toggle('activo', p.dataset.panel === nombre);
      });
    }
    moverIndicador(tabs);
  }

  function armarTabs(tabs) {
    if (tabs.dataset.kwListo) return;
    tabs.dataset.kwListo = '1';
    tabs.setAttribute('role', 'tablist');

    var ind = document.createElement('div');
    ind.className = 'kw-tabs-indicador';
    tabs.insertBefore(ind, tabs.firstChild);

    tabs.querySelectorAll('.kw-tab').forEach(function (b) {
      b.setAttribute('role', 'tab');
      b.addEventListener('click', function () { activar(tabs, b.dataset.tab); });
    });

    var inicial = tabs.querySelector('.kw-tab.activo') || tabs.querySelector('.kw-tab');
    if (inicial) activar(tabs, inicial.dataset.tab);

    // Mientras la página está oculta (esperando la sesión) las pestañas
    // miden cero y la pastilla no sabría dónde ponerse. Al aparecer,
    // esto la reacomoda sin que nadie tenga que avisarle.
    if (global.ResizeObserver) {
      new ResizeObserver(function () { moverIndicador(tabs); }).observe(tabs);
    }
    window.addEventListener('resize', function () { moverIndicador(tabs); });
  }

  function armarTodasLasTabs(raiz) {
    (raiz || document).querySelectorAll('[data-kw-tabs]:not([data-kw-listo])').forEach(armarTabs);
  }

  // ═════════════════════════════════════════════════════════════
  // Campos de fecha
  // ═════════════════════════════════════════════════════════════
  // Un <input type="date"> vacío enseña "dd/mm/aaaa", que se lee como
  // si el campo ya trajera algo. No se le puede poner un texto de
  // ejemplo propio porque ese formato lo dibuja el navegador.
  //
  // Así que mientras está vacío el campo es de texto y dice "Fecha";
  // al picarlo se vuelve de fecha y abre el calendario de siempre. Con
  // una fecha puesta se queda como fecha, para que se vea con el
  // formato de acá y siga valiendo como fecha para el código.

  function armarFecha(inp) {
    if (inp.dataset.kwFecha) return;
    inp.dataset.kwFecha = '1';
    var texto = inp.getAttribute('data-texto') || 'Fecha';

    function aTexto() {
      if (inp.value) return;
      inp.type = 'text';
      inp.placeholder = texto;
    }
    function aFecha() {
      if (inp.type !== 'date') inp.type = 'date';
    }

    inp.addEventListener('focus', function () {
      aFecha();
      // Cambiar el tipo puede soltar el foco en algunos navegadores.
      if (document.activeElement !== inp) inp.focus();
      try { if (inp.showPicker) inp.showPicker(); } catch (e) { /* sin gesto válido */ }
    });
    inp.addEventListener('blur', aTexto);
    inp.addEventListener('change', function () { if (!inp.value) aTexto(); });

    aTexto();
  }

  function armarFechas(raiz) {
    (raiz || document).querySelectorAll('input[type="date"]:not([data-kw-fecha]):not([data-kw-no])')
      .forEach(armarFecha);
  }

  // ═════════════════════════════════════════════════════════════
  // Chips de opción (radio y casilla)
  // ═════════════════════════════════════════════════════════════
  // Para los navegadores que todavía no entienden :has(), que es quien
  // pinta el chip elegido desde el CSS.

  function pintarChips(raiz) {
    (raiz || document).querySelectorAll('.kw-chip input').forEach(function (input) {
      var chip = input.closest('.kw-chip');
      if (chip) chip.classList.toggle('elegido', input.checked);
    });
  }

  document.addEventListener('change', function (e) {
    if (e.target.closest && e.target.closest('.kw-chip')) pintarChips();
  });

  // ═════════════════════════════════════════════════════════════

  function iniciar(raiz) {
    armarSelects(raiz);
    armarFechas(raiz);
    armarTodasLasTabs(raiz);
    pintarChips(raiz);
  }

  global.kwUI = {
    iniciar: iniciar,
    selects: armarSelects,
    fechas: armarFechas,
    tabs: armarTodasLasTabs,
    chips: pintarChips,
    activarTab: function (nombre, tabs) {
      var t = tabs || document.querySelector('[data-kw-tabs]');
      if (t) activar(t, nombre);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { iniciar(); });
  } else {
    iniciar();
  }
})(window);
