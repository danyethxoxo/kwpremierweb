(function () {
  'use strict';
  var preview = document.querySelector('.acuerdos-preview-col, .preview-col');
  if (!preview) return;
  preview.classList.add('kw-documento-preview-zoom');
  var hojas = document.createElement('div');
  hojas.className = 'kw-documento-hojas';
  while (preview.firstChild) hojas.appendChild(preview.firstChild);
  preview.appendChild(hojas);
  var barra = document.createElement('div');
  barra.className = 'kw-documento-zoom';
  barra.setAttribute('role', 'group');
  barra.setAttribute('aria-label', 'Zoom del documento');
  barra.innerHTML = '<button type="button" data-zoom-mas aria-label="Aumentar zoom" title="Acercar">+</button>' +
    '<output aria-live="polite">100%</output>' +
    '<button type="button" data-zoom-menos aria-label="Reducir zoom" title="Alejar">−</button>' +
    '<button type="button" data-zoom-ajustar aria-label="Ajustar al ancho" title="Ajustar al ancho"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5v14M20 5v14M9 8l-4 4 4 4M15 8l4 4-4 4M5 12h14"/></svg></button>';
  preview.appendChild(barra);
  var salida = barra.querySelector('output');
  var escala = null;
  var porcentaje = 100;
  var frame = 0;
  function aplicar() {
    frame = 0;
    var paginas = preview.querySelectorAll('.page');
    if (!paginas.length || preview.clientWidth === 0) return;
    var estilo = getComputedStyle(hojas);
    var ancho = hojas.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
    var actual = escala === null ? Math.min(1, ancho / paginas[0].offsetWidth) : escala;
    if (escala === null && innerWidth > 900 && paginas.length === 1) {
      var alto = hojas.clientHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom) - 20;
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
    porcentaje = Math.round(actual * 100);
    barra.querySelector('[data-zoom-menos]').disabled = actual <= .25;
    barra.querySelector('[data-zoom-mas]').disabled = actual >= 2;
  }
  function programar() { if (!frame) frame = requestAnimationFrame(aplicar); }
  function poner(valor) { escala = Math.max(.25, Math.min(2, valor / 100)); aplicar(); }
  barra.querySelector('[data-zoom-menos]').addEventListener('click', function () { poner(porcentaje - 10); });
  barra.querySelector('[data-zoom-mas]').addEventListener('click', function () { poner(porcentaje + 10); });
  barra.querySelector('[data-zoom-ajustar]').addEventListener('click', function () { escala = null; aplicar(); });
  window.fitPreviewMobile = programar;
  new MutationObserver(function (cambios) { if (cambios.some(function (c) { return !barra.contains(c.target); })) programar(); }).observe(preview, { childList: true, subtree: true });
  new ResizeObserver(programar).observe(preview);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', programar, { once: true });
  else programar();
})();
