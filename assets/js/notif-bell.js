// La campana y la página comparten historial, filas y estado de lectura.
(function () {
  const DIA = 24 * 60 * 60 * 1000;
  // Los avisos guardados ya incluyen estos datos; se ordenan al mostrarlos
  // para actualizar también el historial sin modificar registros existentes.
  function datosDictamen(n) {
    if (n.tipo !== 'dictamen') return null;
    const nuevo = /^Dictamen de expediente: (Autorizado|Autorizado condicionado|Devuelto|Sin dictaminar)$/.exec(n.titulo || '');
    const texto = (n.mensaje || '').replace(/\\n/g, '\n');
    const informativo = /^Dictamen de ([\s\S]+) con dirección:\n\n([\s\S]+)$/.exec(texto);
    if (nuevo && informativo) return { asesor: informativo[1], estatus: nuevo[1], direccion: informativo[2], folio: '' };
    const datos = /^Hola: ([\s\S]+), te compartimos el dictamen de expediente de tu listado con dirección:\n\n([\s\S]+)$/.exec(texto);
    if (nuevo && datos) return { asesor: datos[1], estatus: nuevo[1], direccion: datos[2], folio: '' };
    const titulo = /^(Devuelto|Autorizado condicionado|Autorizado para promoción):\s*([\s\S]+)$/.exec(n.titulo || '');
    const mensaje = /^Expediente de ([\s\S]+)\. Folio ([\s\S]+)\.$/.exec(n.mensaje || '');
    if (!titulo || !mensaje) return null;
    return { asesor: mensaje[1], estatus: titulo[1] === 'Autorizado para promoción' ? 'Autorizado' : titulo[1], direccion: titulo[2], folio: mensaje[2] };
  }
  function esReciente(n, ahora = Date.now()) {
    return !n.leido && new Date(n.created_at).getTime() > ahora - DIA;
  }
  async function cargarHistorial(client, uid) {
    const filas = [];
    // El historial completo no debe desaparecer tras las primeras 20 o 60 filas.
    const tamano = 100;
    for (let desde = 0; ; desde += tamano) {
      const { data, error } = await client.from('notificaciones')
        .select('id, tipo, titulo, mensaje, url, leido, created_at').eq('user_id', uid)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(desde, desde + tamano - 1);
      if (error) throw error;
      filas.push(...(data || []));
      if (!data || data.length < tamano) return filas;
    }
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { esReciente, cargarHistorial, datosDictamen };
    return;
  }

  let notificaciones = [];
  let abierta = false;
  let vistaPanel = 'recientes';
  let vistaPagina = 'recientes';
  let usuarioId = null;
  let cargando = false;
  let iniciado = false;
  let errorMensaje = '';
  let pendientes = new Set();
  const lecturasConfirmadas = new Set();
  let overflowAnterior = '';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function fmtRelativo(iso) {
    const minutos = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutos < 1) return 'ahora';
    if (minutos < 60) return `hace ${minutos} min`;
    if (minutos < 1440) return `hace ${Math.floor(minutos / 60)} h`;
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function destino(n) {
    return n.url && window.kwSecurity ? window.kwSecurity.notificationUrl(n.url, n.tipo) : '';
  }
  function contenido(vista, prefijo) {
    const ahora = Date.now();
    const recientes = notificaciones.filter(n => esReciente(n, ahora));
    const filas = vista === 'todas' ? notificaciones : recientes;
    const sinLeer = filas.filter(n => !n.leido);
    return `<div class="notif-tabs" role="tablist" aria-label="Filtrar notificaciones">
      <button type="button" role="tab" id="${prefijo}-recientes" aria-controls="${prefijo}-lista" aria-selected="${vista === 'recientes'}" tabindex="${vista === 'recientes' ? 0 : -1}" data-notif-tab="recientes">Recientes${recientes.length ? ` (${recientes.length})` : ''}</button>
      <button type="button" role="tab" id="${prefijo}-todas" aria-controls="${prefijo}-lista" aria-selected="${vista === 'todas'}" tabindex="${vista === 'todas' ? 0 : -1}" data-notif-tab="todas">Todas las notificaciones</button>
    </div>
    ${errorMensaje ? `<p class="notif-error" role="alert">${escapeHtml(errorMensaje)} <button type="button" data-notif-reintentar>Reintentar</button></p>` : ''}
    ${sinLeer.length ? `<div class="notif-acciones-lista"><button type="button" class="notif-marcar-todas" data-notif-todas ${pendientes.size ? 'disabled' : ''}>Marcar todas como leídas</button></div>` : ''}
    <div class="notif-dropdown-list notif-tarjetas" id="${prefijo}-lista" role="tabpanel" aria-labelledby="${prefijo}-${vista}" aria-busy="${cargando}">
    ${!filas.length ? `<div class="notif-vacio" role="status">${cargando ? 'Cargando notificaciones...' : vista === 'recientes' ? 'No tienes notificaciones recientes pendientes.' : 'No tienes notificaciones.'}</div>` : filas.map(n => {
      const url = destino(n);
      const dictamen = datosDictamen(n);
      const detalle = dictamen
        ? `<span class="notif-item-titulo">Dictamen de expediente: ${escapeHtml(dictamen.estatus)}</span>
          <span class="notif-item-msg">Dictamen de ${escapeHtml(dictamen.asesor)} con dirección:</span>
          <span class="notif-item-msg notif-item-direccion">${escapeHtml(dictamen.direccion)}</span>
          <span class="notif-item-folio">Ver en la plataforma</span>`
        : `<span class="notif-item-titulo">${escapeHtml(n.titulo)}</span>
          ${n.mensaje ? `<span class="notif-item-msg">${escapeHtml(n.mensaje)}</span>` : ''}`;
      return `<article class="notif-item${n.leido ? '' : ' notif-item-nuevo'}" data-notif-id="${escapeHtml(n.id)}">
        ${url ? `<a class="notif-item-enlace" href="${escapeHtml(url)}">${detalle}</a>` : `<div class="notif-item-contenido">${detalle}</div>`}
        <div class="notif-item-meta"><time class="notif-item-fecha" datetime="${escapeHtml(n.created_at)}">${fmtRelativo(n.created_at)}</time>${n.leido ? '<span class="notif-leida">Leída</span>' : ''}</div>
        ${!n.leido ? `<div class="notif-item-acciones"><button type="button" class="notif-marcar-leida" data-notif-leida="${escapeHtml(n.id)}" ${pendientes.has(n.id) ? 'disabled' : ''}>${pendientes.has(n.id) ? 'Guardando...' : 'Marcar como leída'}</button></div>` : ''}
      </article>`;
    }).join('')}
    </div><p class="notif-estado" role="status" aria-live="polite"></p>`;
  }
  function conectar(contenedor, esPagina) {
    contenedor.querySelectorAll('[data-notif-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (esPagina) vistaPagina = btn.dataset.notifTab;
        else vistaPanel = btn.dataset.notifTab;
        render();
        document.getElementById(`${esPagina ? 'notif-pagina' : 'notif-panel'}-${btn.dataset.notifTab}`)?.focus();
      });
      btn.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const vista = e.key === 'Home' ? 'recientes' : e.key === 'End' ? 'todas' : btn.dataset.notifTab === 'recientes' ? 'todas' : 'recientes';
        contenedor.querySelector(`[data-notif-tab="${vista}"]`).click();
      });
    });
    contenedor.querySelectorAll('[data-notif-leida]').forEach(btn => btn.addEventListener('click', () => marcarLeidas([btn.dataset.notifLeida], contenedor)));
    contenedor.querySelector('[data-notif-todas]')?.addEventListener('click', () => {
      const vista = esPagina ? vistaPagina : vistaPanel;
      const ids = notificaciones.filter(n => !n.leido && (vista === 'todas' || esReciente(n))).map(n => n.id);
      marcarLeidas(ids, contenedor);
    });
    contenedor.querySelector('[data-notif-reintentar]')?.addEventListener('click', cargar);
  }
  function render() {
    const slot = document.getElementById('notif-bell-slot');
    const pagina = document.getElementById('notif-centro');
    const cantidad = notificaciones.filter(n => esReciente(n)).length;
    if (slot) {
      slot.innerHTML = `<button type="button" class="notif-bell-btn" id="notif-bell-btn" aria-label="Notificaciones${cantidad ? `, ${cantidad} recientes sin leer` : ''}" aria-controls="notif-dropdown" aria-expanded="${abierta}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>${cantidad ? `<span class="notif-bell-badge">${cantidad > 9 ? '9+' : cantidad}</span>` : ''}</button>`;
      let panel = document.getElementById('notif-dropdown');
      if (!panel) {
        panel = document.createElement('section'); panel.id = 'notif-dropdown';
        panel.setAttribute('aria-label', 'Notificaciones');
        // Al dibujar las tarjetas se reemplaza el botón pulsado: el clic
        // debe quedarse dentro del panel aunque ese nodo ya no exista.
        panel.addEventListener('click', e => e.stopPropagation());
        document.body.appendChild(panel);
      }
      panel.className = 'notif-dropdown' + (abierta ? ' abierto' : '');
      panel.inert = !abierta;
      panel.setAttribute('aria-hidden', String(!abierta));
      const scroll = panel.querySelector('.notif-dropdown-list')?.scrollTop || 0;
      panel.innerHTML = `<div class="notif-dropdown-head"><span>Notificaciones</span><button type="button" class="notif-cerrar" id="notif-cerrar" aria-label="Cerrar notificaciones">✕</button></div>${contenido(vistaPanel, 'notif-panel')}`;
      panel.querySelector('.notif-dropdown-list').scrollTop = scroll;
      conectar(panel, false);
      panel.querySelector('.notif-cerrar').addEventListener('click', cerrar);
      document.getElementById('notif-bell-btn').addEventListener('click', e => {
        e.stopPropagation();
        if (abierta) return cerrar();
        abierta = true;
        overflowAnterior = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.classList.add('kw-header-anclado');
        render();
        document.querySelector('#notif-dropdown [aria-selected="true"]')?.focus();
      });
      let velo = document.getElementById('notif-backdrop');
      if (!velo) { velo = document.createElement('div'); velo.id = 'notif-backdrop'; document.body.appendChild(velo); velo.addEventListener('click', cerrar); }
      velo.className = 'notif-backdrop' + (abierta ? ' abierto' : '');
    }
    if (pagina) { pagina.innerHTML = contenido(vistaPagina, 'notif-pagina'); conectar(pagina, true); }
  }
  function cerrar() {
    if (!abierta) return;
    abierta = false;
    document.body.style.overflow = overflowAnterior;
    document.documentElement.classList.remove('kw-header-anclado');
    render();
    document.getElementById('notif-bell-btn')?.focus();
  }
  async function marcarLeidas(ids, contenedor) {
    ids = ids.filter(id => !pendientes.has(id));
    if (!ids.length || !usuarioId) return;
    const anteriores = new Map(notificaciones.filter(n => ids.includes(n.id)).map(n => [n.id, n.leido]));
    ids.forEach(id => pendientes.add(id));
    notificaciones.forEach(n => { if (pendientes.has(n.id)) n.leido = true; });
    errorMensaje = ''; render();
    contenedor?.querySelector('[data-notif-leida], [role="tab"][aria-selected="true"]')?.focus();
    const guardadas = new Set();
    try {
      const { data, error } = await window.kwSupabase.from('notificaciones').update({ leido: true })
        .eq('user_id', usuarioId).in('id', ids).select('id');
      if (error) throw error;
      (data || []).forEach(n => { guardadas.add(n.id); lecturasConfirmadas.add(n.id); });
      if (guardadas.size !== ids.length) throw new Error('No se guardó la lectura');
    } catch (_) {
      notificaciones.forEach(n => {
        if (anteriores.has(n.id) && !guardadas.has(n.id)) n.leido = anteriores.get(n.id);
      });
      errorMensaje = 'No se pudo marcar como leída. Intenta de nuevo.';
    }
    finally { ids.forEach(id => pendientes.delete(id)); render(); }
    if (contenedor) {
      const aviso = contenedor.querySelector('.notif-estado');
      if (aviso && !errorMensaje) aviso.textContent = 'Marcada como leída. Puedes consultarla en Todas las notificaciones.';
    }
  }
  async function cargar() {
    if (cargando || !window.kwSupabase?.auth) return;
    cargando = true; errorMensaje = ''; render();
    try {
      const result = await (window.kwSession?.usuarioInicial ? window.kwSession.usuarioInicial(window.kwSupabase) : window.kwSupabase.auth.getUser());
      const uid = result?.data?.user?.id;
      if (!uid) return;
      usuarioId = uid;
      notificaciones = await cargarHistorial(window.kwSupabase, uid);
      // Una respuesta iniciada antes del clic no debe deshacer la lectura.
      notificaciones.forEach(n => {
        if (pendientes.has(n.id) || lecturasConfirmadas.has(n.id)) n.leido = true;
      });
      if (!iniciado) {
        iniciado = true;
        window.kwSupabase.channel('notificaciones-' + uid)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones', filter: 'user_id=eq.' + uid }, () => cargar())
          .subscribe();
      }
    } catch (_) { errorMensaje = 'No se pudieron cargar tus notificaciones.'; }
    finally { cargando = false; render(); }
  }
  document.addEventListener('click', e => {
    if (abierta && !document.getElementById('notif-bell-slot')?.contains(e.target) && !document.getElementById('notif-dropdown')?.contains(e.target)) cerrar();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cargar(); });
  window.addEventListener('resize', cerrar);
  // Envejecer una notificación cambia su apartado, nunca su estado de lectura.
  setInterval(() => { if (!document.hidden && (abierta || document.getElementById('notif-centro'))) render(); }, 60000);
  window.kwNotifRefrescar = () => { render(); if (!iniciado) cargar(); };
  if (document.documentElement.classList.contains('kw-auth-ok')) { render(); cargar(); }
  else window.addEventListener('kw-auth-ready', () => { render(); cargar(); }, { once: true });
})();
