// Guardia de sesión compartida — se incluye al inicio de cada página
// protegida junto con el cliente de Supabase (CDN). Si no hay sesión
// activa, redirige a login.html. La protección real de los datos vive
// en las políticas de RLS de Supabase, no en este script: esto solo
// evita que alguien sin sesión vea el HTML del sitio por casualidad.
//
// También cierra la sesión sola tras un rato de inactividad (Supabase
// por defecto refresca el token indefinidamente mientras se use el
// sitio, así que sin esto una sesión nunca expira sola).
(function () {
  // El sitio se publica en /kwpremierweb/ (GitHub Pages de proyecto,
  // no dominio propio) — si eso cambia algún día, ajustar solo aquí.
  var BASE_PATH = '/kwpremierweb';
  var SUPABASE_URL = 'https://iloetojomzqtadkithtv.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_ZvaIC0_lkd6OQ0VMihOvjA_BIgpbClq';
  var INACTIVITY_MS = 24 * 60 * 60 * 1000; // 24 horas sin uso -> se cierra sola
  var ACTIVITY_KEY = 'kw_last_activity';

  function redirectToLogin() {
    var here = location.pathname + location.search;
    location.replace(BASE_PATH + '/login.html?redirect=' + encodeURIComponent(here));
  }

  function marcarActividad() {
    try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch (e) {}
  }

  function inactivoDemasiado() {
    try {
      var last = parseInt(localStorage.getItem(ACTIVITY_KEY), 10);
      return !!last && (Date.now() - last) > INACTIVITY_MS;
    } catch (e) { return false; }
  }

  function cerrarPorInactividad() {
    try { localStorage.removeItem(ACTIVITY_KEY); } catch (e) {}
    window.kwSupabase.auth.signOut().finally(redirectToLogin);
  }

  if (!window.supabase || !window.supabase.createClient) {
    // Sin la librería no podemos verificar sesión; por seguridad, no
    // dejamos ver el contenido.
    redirectToLogin();
    return;
  }

  window.kwSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  if (inactivoDemasiado()) {
    cerrarPorInactividad();
  } else {
    window.kwSupabase.auth.getSession().then(function (result) {
      var session = result && result.data && result.data.session;
      if (!session) {
        redirectToLogin();
      } else {
        document.documentElement.classList.add('kw-auth-ok');
        window.dispatchEvent(new CustomEvent('kw-auth-ready'));

        marcarActividad();
        ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(function (evt) {
          document.addEventListener(evt, marcarActividad, { passive: true });
        });
        setInterval(function () {
          if (inactivoDemasiado()) cerrarPorInactividad();
        }, 60 * 1000);
      }
    }).catch(redirectToLogin);
  }

  window.kwLogout = function () {
    try { localStorage.removeItem(ACTIVITY_KEY); } catch (e) {}
    window.kwSupabase.auth.signOut().then(function () {
      location.replace(BASE_PATH + '/login.html');
    });
  };
})();
