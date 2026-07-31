// Guardia de sesión compartida — se incluye al inicio de cada página
// protegida junto con el cliente de Supabase (CDN). Si no hay sesión
// activa, redirige a login.html. La protección real de los datos vive
// en las políticas de RLS de Supabase, no en este script: esto solo
// evita que alguien sin sesión vea el HTML del sitio por casualidad.
//
// También cierra la sesión sola tras un rato de inactividad (Supabase
// por defecto refresca el token indefinidamente mientras se use el
// sitio, así que sin esto una sesión nunca expira sola).
//
// Y pone la pantalla de carga mientras comprueba: cada página protegida
// se esconde hasta saber si hay sesión, y sin esto lo que se ve
// entretanto es un blanco.
(function () {
  // El sitio se publica en /kwpremierweb/ (GitHub Pages de proyecto,
  // no dominio propio) — si eso cambia algún día, ajustar solo aquí.
  var BASE_PATH = '/kwpremierweb';
  var SUPABASE_URL = 'https://iloetojomzqtadkithtv.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_ZvaIC0_lkd6OQ0VMihOvjA_BIgpbClq';
  var INACTIVITY_MS = 4 * 60 * 60 * 1000; // 4 horas sin uso -> se cierra sola
  var ACTIVITY_KEY = 'kw_last_activity';

  // ── Pantalla de carga ──────────────────────────────────────
  // Se arma desde aquí, y no desde el HTML de cada página, para que
  // aparezca desde el primer instante y sin tener que tocar 20 archivos.
  //
  // El `visibility: visible` es a propósito: las páginas protegidas
  // esconden el body entero mientras se comprueba la sesión, y un hijo
  // sí puede volver a hacerse visible aunque su padre no lo esté.
  var capaCargando = null;
  var cargaTerminada = false;

  function montarCargando() {
    if (capaCargando) return;
    cargaTerminada = false;

    if (!document.getElementById('kw-cargando-estilo')) {
      var estilo = document.createElement('style');
      estilo.id = 'kw-cargando-estilo';
      estilo.textContent = [
        '#kw-cargando{position:fixed;inset:0;z-index:9999;visibility:visible;',
        'display:flex;align-items:center;justify-content:center;',
        'background:rgba(239,239,239,0.72);',
        'backdrop-filter:blur(14px) saturate(1.1);',
        '-webkit-backdrop-filter:blur(14px) saturate(1.1);',
        'transition:opacity 0.45s ease}',
        '#kw-cargando.kw-saliendo{opacity:0;pointer-events:none}',
        '#kw-cargando img{width:150px;max-width:52vw;height:auto;display:block;',
        'animation:kw-latido 1.9s ease-in-out infinite}',
        '#kw-cargando.kw-saliendo img{animation:none;',
        'transition:opacity 0.4s ease,transform 0.4s ease;opacity:0;transform:scale(1.05)}',
        '@keyframes kw-latido{0%,100%{opacity:0.5;transform:scale(0.97)}',
        '50%{opacity:1;transform:scale(1)}}',
        '@media (prefers-reduced-motion:reduce){#kw-cargando img{animation:none;opacity:1}}',
      ].join('');
      (document.head || document.documentElement).appendChild(estilo);
    }

    var capa = document.createElement('div');
    capa.id = 'kw-cargando';
    capa.setAttribute('role', 'status');
    capa.setAttribute('aria-label', 'Cargando');
    capa.innerHTML = '<img src="' + BASE_PATH + '/assets/img/logo-kw-premier.png" alt="KW Premier" />';
    capaCargando = capa;

    // Este archivo va en el <head>, así que casi siempre corre antes de
    // que exista el <body>. Se espera cuadro por cuadro a que aparezca,
    // en vez de escuchar "DOMContentLoaded": ese evento no llega si el
    // documento ya terminó de armarse, y entonces la capa nunca se
    // ponía. Si mientras tanto ya se comprobó la sesión, se abandona.
    (function poner() {
      if (cargaTerminada || capaCargando !== capa) return;
      if (document.body) { document.body.appendChild(capa); return; }
      requestAnimationFrame(poner);
    })();
  }

  function quitarCargando() {
    // Se marca aunque la capa todavía no esté puesta: la sesión se
    // comprueba rápido y puede resolverse antes de que el documento
    // termine de armarse. Sin esto, la capa se montaba después de que
    // ya se había pedido quitarla, y se quedaba puesta para siempre.
    cargaTerminada = true;
    var capa = capaCargando;
    capaCargando = null;
    if (!capa) return;
    capa.classList.add('kw-saliendo');
    setTimeout(function () { if (capa.parentNode) capa.parentNode.removeChild(capa); }, 500);
  }

  montarCargando();
  // Por si esta pantalla es lo único que llega a cargar: quien la use
  // desde fuera puede quitarla a mano.
  window.kwQuitarCargando = quitarCargando;

  // ── Sesión ─────────────────────────────────────────────────

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

  // Primero se pregunta si hay sesión y hasta después se mira el reloj
  // de inactividad. Al revés se caía en un doble inicio de sesión: quien
  // no entraba en más de cuatro horas se autenticaba, llegaba aquí, el
  // reloj traía la marca vieja (login.html no la tocaba) y lo mandaba de
  // regreso; a la segunda ya entraba, porque al salir la marca se borra.
  window.kwSupabase.auth.getSession().then(function (result) {
    var session = result && result.data && result.data.session;
    if (!session) return redirectToLogin();

    // Sesión recién hecha y sin marca: se estrena ahora, no se juzga.
    var conMarca = false;
    try { conMarca = !!localStorage.getItem(ACTIVITY_KEY); } catch (e) {}
    if (conMarca && inactivoDemasiado()) return cerrarPorInactividad();

    marcarActividad();
    document.documentElement.classList.add('kw-auth-ok');
    quitarCargando();
    window.dispatchEvent(new CustomEvent('kw-auth-ready'));

    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(function (evt) {
      document.addEventListener(evt, marcarActividad, { passive: true });
    });
    setInterval(function () {
      if (inactivoDemasiado()) cerrarPorInactividad();
    }, 60 * 1000);
  }).catch(redirectToLogin);

  window.kwLogout = function () {
    try { localStorage.removeItem(ACTIVITY_KEY); } catch (e) {}
    montarCargando();
    window.kwSupabase.auth.signOut().then(function () {
      location.replace(BASE_PATH + '/login.html');
    });
  };
})();
