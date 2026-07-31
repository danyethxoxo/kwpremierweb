// Pone solo el nombre de quien tiene la sesión abierta en los campos de
// "asesor" de los formatos, para no escribirlo cada vez.
//
// Uso: en la página, después de auth-guard.js,
//
//   <script src="/kwpremierweb/assets/js/kw-prellenar.js"
//           data-campos="f-asesor-envia"></script>
//
// data-campos acepta varios ids separados por coma.
//
// Solo llena los que estén vacíos: si el formato se abrió desde un
// borrador guardado, lo que ya traía manda. Y avisa con un evento
// 'input' para que la vista previa se actualice sola.

(function () {
  'use strict';

  var script = document.currentScript;
  var campos = ((script && script.getAttribute('data-campos')) || '')
    .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (!campos.length) return;

  async function nombreDeLaSesion() {
    if (!window.kwSupabase) return null;
    try {
      var u = await window.kwSupabase.auth.getUser();
      var id = u && u.data && u.data.user && u.data.user.id;
      if (!id) return null;
      var r = await window.kwSupabase
        .from('profiles').select('nombre, apellido').eq('id', id).single();
      if (r.error || !r.data) return null;
      return ((r.data.nombre || '') + ' ' + (r.data.apellido || '')).trim() || null;
    } catch (e) {
      return null;
    }
  }

  async function prellenar() {
    var nombre = await nombreDeLaSesion();
    if (!nombre) return;
    campos.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.value.trim()) return;
      el.value = nombre;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  // Se espera al DOM (los campos viven en el <body>) y a la sesión.
  function arrancar() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', prellenar, { once: true });
    } else {
      prellenar();
    }
  }

  if (document.documentElement.classList.contains('kw-auth-ok')) arrancar();
  else window.addEventListener('kw-auth-ready', arrancar, { once: true });
})();
