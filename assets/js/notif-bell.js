// Campanita de notificaciones — se incluye después de auth-guard.js en
// las páginas que quieran mostrarla. Requiere un elemento vacío con
// id="notif-bell-slot" en el header; este script se encarga de dibujar
// el ícono, el contador y el desplegable ahí adentro.
//
// En celular no se abre un desplegable (no hay espacio y se sentía
// encimado con el header): la campanita es un enlace que lleva a
// hub/notificaciones.html, una página completa con la misma lista.
(function () {
  const BASE = '/kwpremierweb';
  let notificaciones = [];
  let abierta = false;
  let backdropEl = null;

  function esMovil() {
    return window.matchMedia('(max-width: 700px)').matches;
  }

  function fmtRelativo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `hace ${d} d`;
    try { return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }); }
    catch (e) { return ''; }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  // El fondo oscuro/difuminado detrás del desplegable vive suelto en
  // <body>, no dentro del slot: así no lo recorta ningún contenedor con
  // overflow, y sobrevive a que render() rehaga el slot por dentro cada
  // vez que llega una notificación nueva.
  function getBackdrop() {
    if (backdropEl) return backdropEl;
    backdropEl = document.createElement('div');
    backdropEl.className = 'notif-backdrop';
    backdropEl.id = 'notif-backdrop';
    document.body.appendChild(backdropEl);
    return backdropEl;
  }

  function render() {
    const slot = document.getElementById('notif-bell-slot');
    if (!slot) return;
    const noLeidas = notificaciones.filter(n => !n.leido).length;
    const badge = noLeidas > 0 ? `<span class="notif-bell-badge">${noLeidas > 9 ? '9+' : noLeidas}</span>` : '';

    if (esMovil()) {
      // En celular no hay desplegable que animar ni fondo que oscurecer:
      // la campanita manda derecho a su propia página.
      slot.innerHTML = `
        <a href="${BASE}/hub/notificaciones.html" class="notif-bell-btn" id="notif-bell-btn" aria-label="Notificaciones">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          ${badge}
        </a>`;
      if (backdropEl) backdropEl.classList.remove('abierto');
      return;
    }

    slot.innerHTML = `
      <button type="button" class="notif-bell-btn" id="notif-bell-btn" aria-label="Notificaciones" aria-haspopup="true" aria-expanded="${abierta}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        ${badge}
      </button>
      <div class="notif-dropdown${abierta ? ' abierto' : ''}" id="notif-dropdown">
        <div class="notif-dropdown-head">
          <span>Notificaciones</span>
          ${noLeidas > 0 ? `<button type="button" class="notif-marcar-todas" id="notif-marcar-todas">Marcar todas como leídas</button>` : ''}
        </div>
        <div class="notif-dropdown-list">
          ${notificaciones.length === 0
            ? '<div class="notif-vacio">No tienes notificaciones.</div>'
            : notificaciones.map(n => `
              <button type="button" class="notif-item${n.leido ? '' : ' notif-item-nuevo'}" data-id="${n.id}" data-url="${escapeHtml(n.url || '')}">
                <span class="notif-item-titulo">${escapeHtml(n.titulo)}</span>
                ${n.mensaje ? `<span class="notif-item-msg">${escapeHtml(n.mensaje)}</span>` : ''}
                <span class="notif-item-fecha">${fmtRelativo(n.created_at)}</span>
              </button>`).join('')}
        </div>
      </div>`;

    document.getElementById('notif-bell-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      toggleDropdown();
    });
    const btnTodas = document.getElementById('notif-marcar-todas');
    if (btnTodas) btnTodas.addEventListener('click', marcarTodasLeidas);
    Array.from(slot.querySelectorAll('.notif-item')).forEach(function (btn) {
      btn.addEventListener('click', function () { abrirNotificacion(btn.dataset.id, btn.dataset.url); });
    });

    getBackdrop().classList.toggle('abierto', abierta);
  }

  function toggleDropdown() {
    abierta = !abierta;
    if (abierta) {
      const dd = document.getElementById('notif-dropdown');
      if (dd) dd.classList.add('abierto');
      getBackdrop().classList.add('abierto');
      // Dos candados distintos: el overflow evita que se mueva la página
      // de atrás, y la marca en <html> le dice a drawer.js que no
      // esconda el header. Hacen falta los dos: drawer.js escucha el
      // scroll en fase de captura, así que hasta el de adentro de esta
      // misma lista llegaba allá y escondía la barra al leer.
      document.body.style.overflow = 'hidden';
      document.documentElement.classList.add('kw-header-anclado');
      // Al abrirla ya se dio por vista: el numerito no debe esperar a
      // que se pique cada renglón para desaparecer. Se marca un poco
      // después (no de inmediato) porque marcarTodasLeidas() rehace el
      // desplegable entero, y hacerlo en el mismo instante del clic
      // interrumpía la animación de apertura antes de que se alcanzara
      // a ver.
      setTimeout(marcarTodasLeidas, 220);
    } else {
      cerrarDropdown();
    }
  }

  function cerrarDropdown() {
    abierta = false;
    const dd = document.getElementById('notif-dropdown');
    if (dd) dd.classList.remove('abierto');
    if (backdropEl) backdropEl.classList.remove('abierto');
    document.body.style.overflow = '';
    document.documentElement.classList.remove('kw-header-anclado');
  }

  function abrirNotificacion(id, url) {
    const n = notificaciones.find(function (x) { return x.id === id; });
    if (n && !n.leido) {
      n.leido = true;
      render();
      window.kwSupabase.from('notificaciones').update({ leido: true }).eq('id', id).then(function () {});
    }
    if (url) location.href = url;
  }

  function marcarTodasLeidas() {
    const idsNoLeidas = notificaciones.filter(function (n) { return !n.leido; }).map(function (n) { return n.id; });
    if (!idsNoLeidas.length) return;
    notificaciones.forEach(function (n) { n.leido = true; });
    render();
    window.kwSupabase.from('notificaciones').update({ leido: true }).in('id', idsNoLeidas).then(function () {});
  }

  function cargarNotificaciones() {
    window.kwSupabase.auth.getUser().then(function (result) {
      const uid = result && result.data && result.data.user && result.data.user.id;
      if (!uid) return;

      window.kwSupabase
        .from('notificaciones')
        .select('id, tipo, titulo, mensaje, url, leido, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(20)
        .then(function (res) {
          if (!res.error) {
            notificaciones = res.data || [];
            render();
          }
        });

      window.kwSupabase
        .channel('notificaciones-' + uid)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: 'user_id=eq.' + uid }, function (payload) {
          notificaciones.unshift(payload.new);
          render();
        })
        .subscribe();
    });
  }

  document.addEventListener('click', function (e) {
    if (!abierta) return;
    const slot = document.getElementById('notif-bell-slot');
    if (slot && !slot.contains(e.target)) cerrarDropdown();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && abierta) cerrarDropdown();
  });
  window.addEventListener('resize', function () {
    // Cruzar el punto de quiebre celular/escritorio con el desplegable
    // abierto lo dejaba en un estado raro (o el fondo oscuro suelto sin
    // nada que oscurecer). Más simple: se vuelve a dibujar tal cual.
    cerrarDropdown();
    render();
  });

  function init() {
    render();
    cargarNotificaciones();
  }

  if (document.documentElement.classList.contains('kw-auth-ok')) {
    init();
  } else {
    window.addEventListener('kw-auth-ready', init, { once: true });
  }
})();
