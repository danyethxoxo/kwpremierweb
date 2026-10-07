(function () {
  'use strict';
  var preview = document.getElementById('referido-preview');
  if (!preview) return;
  var timer;
  function irAlCampo(enlace) {
    var campo = document.getElementById(enlace.dataset.referidoField);
    if (!campo || campo.disabled || campo.closest('fieldset[disabled]')) return;
    if (window.innerWidth <= 900 && typeof window.showMobileTab === 'function') window.showMobileTab('form');
    requestAnimationFrame(function () {
      document.querySelectorAll('.referido-campo-activo').forEach(function (el) { el.classList.remove('referido-campo-activo'); });
      var field = campo.closest('.field');
      if (field) field.classList.add('referido-campo-activo');
      campo.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center', inline: 'nearest' });
      campo.focus({ preventScroll: true });
      clearTimeout(timer);
      timer = setTimeout(function () { if (field) field.classList.remove('referido-campo-activo'); }, 2500);
    });
  }
  preview.addEventListener('click', function (event) {
    var enlace = event.target.closest('[data-referido-field]');
    if (enlace && preview.contains(enlace)) irAlCampo(enlace);
  });
  preview.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var enlace = event.target.closest('[data-referido-field]');
    if (!enlace || !preview.contains(enlace)) return;
    event.preventDefault();
    irAlCampo(enlace);
  });
})();
