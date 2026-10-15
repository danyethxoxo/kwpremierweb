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
  barra.innerHTML = '<button type="button" data-zoom-menos aria-label="Alejar" title="Alejar">?</button>' +
    '<button type="button" data-zoom-mas aria-label="Acercar" title="Acercar">+</button>' +
    '<output aria-live="polite">100 %</output>' +
    '<button type="button" data-zoom-ajustar>Ajustar al ancho</button>';
  preview.appendChild(barra);
  var salida = barra.querySelector('output');
  var escala = 1;
  var porcentaje = 100;
  var frame = 0;
  function aplicar() {
    frame = 0;
    var paginas = preview.querySelectorAll('.page');
    if (!paginas.length || preview.clientWidth === 0) return;
    var estilo = getComputedStyle(hojas);
    var ancho = hojas.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
    var actual = Math.max(1, Math.min(ancho, 900)) / paginas[0].offsetWidth * escala;
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
    salida.value = Math.round(escala * 100) + ' %';
    barra.querySelector('[data-zoom-menos]').disabled = escala <= .601;
    barra.querySelector('[data-zoom-mas]').disabled = escala >= 2.199;
    barra.querySelector('[data-zoom-ajustar]').disabled = Math.abs(escala - 1) < .001;
  }
  function programar() { if (!frame) frame = requestAnimationFrame(aplicar); }
  function poner(valor) { escala = Math.max(.6, Math.min(2.2, Math.round(valor * 100) / 100)); aplicar(); }
  barra.querySelector('[data-zoom-menos]').addEventListener('click', function () { poner(escala - .15); });
  barra.querySelector('[data-zoom-mas]').addEventListener('click', function () { poner(escala + .15); });
  barra.querySelector('[data-zoom-ajustar]').addEventListener('click', function () { poner(1); });
  window.fitPreviewMobile = programar;
  new MutationObserver(function (cambios) { if (cambios.some(function (c) { return !barra.contains(c.target); })) programar(); }).observe(preview, { childList: true, subtree: true });
  new ResizeObserver(programar).observe(preview);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', programar, { once: true });
  else programar();
})();
