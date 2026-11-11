/* Filtro pequeño y compartido para las parrillas de tarjetas. */
(function () {
  'use strict';

  var script = document.currentScript;
  var input = document.getElementById((script && script.dataset.input) || 'kw-card-search');
  var target = document.querySelector((script && script.dataset.target) || '.kw-homogeneo .grid');
  if (!input || !target) return;

  function normalizar(valor) {
    return String(valor || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function aplicar() {
    var termino = normalizar(input.value);
    var buscar = globalThis.kwBusquedaPortal?.preparar(termino);
    Array.prototype.forEach.call(target.children, function (item) {
      if (item.classList.contains('cargando') || item.classList.contains('aviso')) return;
      item.hidden = !(buscar?.coincide(item.textContent) ?? normalizar(item.textContent).includes(termino));
    });
  }

  input.addEventListener('input', aplicar);
  new MutationObserver(aplicar).observe(target, { childList: true });
  aplicar();
})();
