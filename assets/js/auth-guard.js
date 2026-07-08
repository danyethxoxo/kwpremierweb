// Guardia de sesión compartida — se incluye al inicio de cada página
// protegida junto con el cliente de Supabase (CDN). Si no hay sesión
// activa, redirige a login.html. La protección real de los datos vive
// en las políticas de RLS de Supabase, no en este script: esto solo
// evita que alguien sin sesión vea el HTML del sitio por casualidad.
(function () {
  var SUPABASE_URL = 'https://iloetojomzqtadkithtv.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_ZvaIC0_lkd6OQ0VMihOvjA_BIgpbClq';

  function redirectToLogin() {
    var here = location.pathname + location.search;
    location.replace('/login.html?redirect=' + encodeURIComponent(here));
  }

  if (!window.supabase || !window.supabase.createClient) {
    // Sin la librería no podemos verificar sesión; por seguridad, no
    // dejamos ver el contenido.
    redirectToLogin();
    return;
  }

  window.kwSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  window.kwSupabase.auth.getSession().then(function (result) {
    var session = result && result.data && result.data.session;
    if (!session) {
      redirectToLogin();
    } else {
      document.documentElement.classList.add('kw-auth-ok');
    }
  }).catch(redirectToLogin);

  window.kwLogout = function () {
    window.kwSupabase.auth.signOut().then(function () {
      location.replace('/login.html');
    });
  };
})();
