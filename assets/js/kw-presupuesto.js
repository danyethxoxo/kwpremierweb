(function () {
  'use strict';
  document.querySelectorAll('[data-kw-dinero]').forEach(function (input) {
    function formatear() {
      var antes = input.value, posicion = input.selectionStart == null ? antes.length : input.selectionStart;
      var caracteres = antes.slice(0,posicion).replace(/,/g,'').length;
      var partes = antes.replace(/,/g,'').replace(/[^0-9.]/g,'').split('.');
      var entero = partes.shift().replace(/^0+(?=\d)/,'');
      input.value = entero.replace(/\B(?=(\d{3})+(?!\d))/g,',') + (partes.length ? '.' + partes.join('').slice(0,2) : '');
      var cursor = 0, contados = 0;
      while (cursor < input.value.length && contados < caracteres) { if (input.value[cursor] !== ',') contados++; cursor++; }
      if (document.activeElement === input) input.setSelectionRange(cursor,cursor);
    }
    input.addEventListener('input',formatear); input.addEventListener('change',formatear); formatear();
  });
})();
