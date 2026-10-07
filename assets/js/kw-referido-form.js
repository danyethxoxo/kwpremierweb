(function () {
  'use strict';
  var preview = document.getElementById('referido-preview');
  if (!preview) return;
  var timer;
  var raiz = document.getElementById('acuerdos-form-col');
  var historial = raiz && raiz.querySelector('[data-kw-revision-historial]');
  if (historial) historial.textContent = 'Historial';
  function irAlCampo(enlace) {
    var campo = document.getElementById(enlace.dataset.referidoField);
    if (!campo) return;
    if (raiz) {
      raiz.classList.remove('kw-revision-modo-historial');
      var panel = raiz.querySelector('.kw-revision-panel');
      if (panel) panel.hidden = true;
      raiz.querySelectorAll('.kw-revision-tab').forEach(function (tab) {
        var actual = tab.hasAttribute('data-kw-revision-documento');
        tab.classList.toggle('activo', actual);
        tab.setAttribute('aria-selected', String(actual));
      });
    }
    if (window.innerWidth <= 900 && typeof window.showMobileTab === 'function') window.showMobileTab('form');
    requestAnimationFrame(function () {
      document.querySelectorAll('.referido-campo-activo').forEach(function (el) { el.classList.remove('referido-campo-activo'); });
      var field = campo.closest('.field');
      if (field) field.classList.add('referido-campo-activo');
      var scroll = campo.closest('.kw-form-scroll');
      if (scroll) {
        scroll.scrollTop += campo.getBoundingClientRect().top - scroll.getBoundingClientRect().top - (scroll.clientHeight - campo.offsetHeight) / 2;
      }
      if (window.innerWidth <= 900) campo.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      if (campo.disabled || campo.closest('fieldset[disabled]')) {
        if (field) { field.tabIndex = -1; field.focus({ preventScroll: true }); }
      } else campo.focus({ preventScroll: true });
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
