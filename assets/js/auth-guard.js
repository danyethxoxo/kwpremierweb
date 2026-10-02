// Guardia de sesión compartida - se incluye al inicio de cada página
// protegida junto con el cliente de Supabase (CDN). Si no hay sesión
// activa, redirige a login.html. La protección real de los datos vive
// en las políticas de RLS de Supabase, no en este script: esto solo
// evita que alguien sin sesión vea el HTML del sitio por casualidad.
//
// Pide contraseña cada 24 horas. El servidor conserva la confianza del
// dispositivo/IP mientras no transcurran cinco días sin actividad.
//
// Y pone la pantalla de carga mientras comprueba: cada página protegida
// se esconde hasta saber si hay sesión, y sin esto lo que se ve
// entretanto es un blanco.
(function () {
  // El sitio se publica en / (GitHub Pages de proyecto,
  // no dominio propio) - si eso cambia algún día, ajustar solo aquí.
  var BASE_PATH = '';
  var SUPABASE_URL = 'https://iloetojomzqtadkithtv.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_ZvaIC0_lkd6OQ0VMihOvjA_BIgpbClq';
  var ACTIVITY_KEY = 'kw_last_activity';
  var ultimaActividad = 0;
  var ultimaComprobacion = 0;
  var comprobacionPendiente = null;
  var sesionPreparada = false;

  function getDeviceToken() {
    return window.kwSession.deviceToken();
  }
  window.kwGetDeviceToken = getDeviceToken;

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
    if (Date.now() - ultimaActividad < 60000) return;
    ultimaActividad = Date.now();
    try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch (e) {}
    if (Date.now() - ultimaComprobacion >= 5 * 60 * 1000) comprobarSesion();
  }

  if (!window.supabase || !window.supabase.createClient || !window.kwSession) {
    mostrarErrorConexion();
    return;
  }

  window.kwSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch: window.kwSecureFetch } });

  // Un problema de conexión conserva la sesión y permite reintentar.
  // El contenido sigue oculto hasta recibir autorización del servidor.
  function mostrarErrorConexion() {
    document.documentElement.classList.remove('kw-auth-ok');
    montarCargando();
    var capa = capaCargando;
    capa.replaceChildren();
    var caja = document.createElement('div');
    caja.style.cssText = 'max-width:340px;padding:24px;text-align:center;background:white;border-radius:16px;color:#333';
    var mensaje = document.createElement('p');
    mensaje.textContent = 'No pudimos comprobar tu sesión. Revisa la conexión y vuelve a intentar.';
    var boton = document.createElement('button');
    boton.textContent = 'Reintentar';
    boton.type = 'button';
    boton.style.cssText = 'margin-top:16px;padding:10px 20px;border:0;border-radius:20px;background:#8a0000;color:white;cursor:pointer';
    boton.addEventListener('click', function () {
      boton.disabled = true;
      if (!window.kwSupabase) return location.reload();
      comprobarSesion();
    });
    caja.append(mensaje, boton);
    capa.appendChild(caja);
  }

  function comprobarSesion() {
    if (comprobacionPendiente) return comprobacionPendiente;
    comprobacionPendiente = window.kwSession.mfaState(window.kwSupabase).then(async function (estado) {
      if (estado.sin_sesion) return redirectToLogin();
      if (estado.requiere_login) {
        var salida = await window.kwSupabase.auth.signOut({ scope: 'local' });
        if (salida.error) throw salida.error;
        return redirectToLogin();
      }
      if (estado.requerido === true && estado.activo !== true) {
        location.replace(BASE_PATH + (estado.requiere_alta ? '/completar-registro.html' : '/activar-mfa.html'));
        return;
      }
      if (estado.activo === true && estado.verificado !== true) return redirectToLogin();
      ultimaComprobacion = Date.now();
      continuarConSesion();
    }).catch(mostrarErrorConexion).finally(function () { comprobacionPendiente = null; });
    return comprobacionPendiente;
  }
  window.kwRevisarSesion = comprobarSesion;
  comprobarSesion();

  function continuarConSesion() {
    document.documentElement.classList.add('kw-auth-ok');
    quitarCargando();
    if (sesionPreparada) return;
    sesionPreparada = true;
    marcarActividad();
    window.dispatchEvent(new CustomEvent('kw-auth-ready'));

    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(function (evt) {
      document.addEventListener(evt, marcarActividad, { passive: true });
    });
    setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      window.kwSupabase.auth.getSession().then(function (result) {
        var session = result.data && result.data.session;
        if (!session || window.kwSession.loginExpired(session) ||
            (Date.now() - ultimaActividad < 60000 && Date.now() - ultimaComprobacion >= 5 * 60 * 1000)) comprobarSesion();
      }).catch(mostrarErrorConexion);
    }, 60 * 1000);
  }

  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      document.documentElement.classList.remove('kw-auth-ok');
      montarCargando();
      comprobarSesion();
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { ultimaActividad = Date.now(); comprobarSesion(); }
  });
  window.addEventListener('online', comprobarSesion);

  window.kwLogout = function () {
    try { localStorage.removeItem(ACTIVITY_KEY); } catch (e) {}
    montarCargando();
    window.kwSupabase.auth.signOut({ scope: 'local' }).then(function () {
      location.replace(BASE_PATH + '/login.html');
    });
  };
})();
