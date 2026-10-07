(function () {
  'use strict';
  var preview = document.querySelector('.acuerdos-preview-col, .preview-col');
  if (!preview) return;
  preview.classList.add('kw-documento-preview-zoom');
  var barra = document.createElement('div');
  barra.className = 'kw-documento-zoom';
  barra.setAttribute('role', 'group');
  barra.setAttribute('aria-label', 'Zoom del documento');
  barra.innerHTML = '<button type="button" data-zoom-menos aria-label="Reducir zoom">−</button>' +
    '<input type="range" min="25" max="200" step="5" value="100" aria-label="Porcentaje de zoom">' +
    '<output aria-live="polite">100%</output>' +
    '<button type="button" data-zoom-mas aria-label="Aumentar zoom">+</button>' +
    '<button type="button" data-zoom-ajustar>Ajustar</button>';
  preview.prepend(barra);
  var entrada = barra.querySelector('input');
  var salida = barra.querySelector('output');
  var escala = null;
  var frame = 0;
  function aplicar() {
    frame = 0;
    var paginas = preview.querySelectorAll('.page');
    if (!paginas.length || preview.clientWidth === 0) return;
    var estilo = getComputedStyle(preview);
    var ancho = preview.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
    var actual = escala === null ? Math.min(1, ancho / paginas[0].offsetWidth) : escala;
    if (escala === null && innerWidth > 900 && paginas.length === 1) {
      var alto = preview.clientHeight - barra.offsetHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom) - 20;
      actual = Math.min(actual, alto / paginas[0].offsetHeight);
    }
    actual = Math.max(.25, actual);
    paginas.forEach(function (pagina) {
      var wrap = pagina.parentElement;
      if (!wrap.classList.contains('page-scale-wrap')) {
        wrap = document.createElement('div');
        wrap.className = 'page-scale-wrap';
        pagina.before(wrap);
        wrap.appendChild(pagina);
      }
      pagina.style.transformOrigin = 'top left';
      pagina.style.transform = 'scale(' + actual + ')';
      wrap.style.width = pagina.offsetWidth * actual + 'px';
      wrap.style.height = pagina.offsetHeight * actual + 'px';
    });
    salida.value = Math.round(actual * 100) + '%';
    entrada.value = String(Math.round(actual * 100));
  }
  function programar() { if (!frame) frame = requestAnimationFrame(aplicar); }
  function poner(valor) { escala = Math.max(.25, Math.min(2, valor / 100)); aplicar(); }
  entrada.addEventListener('input', function () { poner(Number(entrada.value)); });
  barra.querySelector('[data-zoom-menos]').addEventListener('click', function () { poner(Number(entrada.value) - 10); });
  barra.querySelector('[data-zoom-mas]').addEventListener('click', function () { poner(Number(entrada.value) + 10); });
  barra.querySelector('[data-zoom-ajustar]').addEventListener('click', function () { escala = null; aplicar(); });
  window.fitPreviewMobile = programar;
  new MutationObserver(function (cambios) { if (cambios.some(function (c) { return !barra.contains(c.target); })) programar(); }).observe(preview, { childList: true, subtree: true });
  new ResizeObserver(programar).observe(preview);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', programar, { once: true });
  else programar();
})();
