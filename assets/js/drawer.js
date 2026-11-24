// Menu lateral (hamburguesa) compartido - se incluye en cualquier
// pagina agregando, justo antes de cerrar </body>:
//
//   <script src="/assets/js/drawer.js" data-menu="publico"></script>
//   <script src="/assets/js/drawer.js" data-menu="hub"></script>
//
// "publico" dibuja el menu de las paginas sin sesion (Inicio, Asesores,
// Liderazgo, Nuestro Market Center + Accede al Portal). "hub" dibuja el
// menu de las paginas con sesion (Hub + Cuenta, con Cerrar sesion).
// El boton y el panel se insertan solos; no requieren nada mas en el
// HTML de la pagina que los usa. Estilos en kw-base.css.
(function () {
  const script = document.currentScript;
  const modo = (script && script.getAttribute('data-menu')) || 'hub';
  const BASE = '';
  const temaNavegacion = document.createElement('link');
  temaNavegacion.rel = 'stylesheet';
  temaNavegacion.href = '/assets/css/kw-navegacion-oscura.css?v=20261124home1';
  document.head.append(temaNavegacion);
  const LOGO = '/assets/img/kweb-logo-flecha.png?v=20261124home1';

  const ICONS = {
    // Cinco entradas del menú traían la misma hoja genérica. En el panel
    // ancho se distinguían por el nombre de al lado; en el riel angosto,
    // donde solo queda el dibujo, eran cinco íconos idénticos. Cada una
    // estrena el suyo.
    nube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 16.5a4 4 0 0 0-1.2-7.8 6 6 0 0 0-11.5 1.7A3.5 3.5 0 0 0 6 16.5z"/><polyline points="9 13 12 10 15 13"/><line x1="12" y1="10" x2="12" y2="18"/></svg>',
    plantilla: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
    pluma: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18c3.5 0 4-6 7.5-6 2 0 2.5 2 4.5 2 2.5 0 3-3 6-3"/><path d="M3 21h18"/></svg>',
    dictamen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z"/><path d="M16 5h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1"/><polyline points="9 13 11 15 15 11"/></svg>',
    globo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>',
    liderazgo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"/><polyline points="12 1 13 3.2 15.5 3.5 13.7 5.2 14.2 7.6 12 6.4 9.8 7.6 10.3 5.2 8.5 3.5 11 3.2"/></svg>',
    tablero: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    persona: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    prospecto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    llave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="11" r="2"/><path d="M12 13v4"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    estrella: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    carpeta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    basura: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  };

  const NAV_PUBLICO = [
    { href: `${BASE}/index.html`, label: 'Inicio', icon: 'globo' },
    { href: `${BASE}/propiedades.html`, label: 'Propiedades', icon: 'llave' },
    { href: `${BASE}/asesores.html`, label: 'Asesores', icon: 'users' },
    { href: `${BASE}/staff.html`, label: 'Liderazgo', icon: 'liderazgo' },
    { href: `${BASE}/market-center.html`, label: 'Nuestro Market Center', icon: 'building' },
  ];

  const NAV_HUB = [
    { href: `${BASE}/portal.html`, label: 'Inicio del Hub', icon: 'home' },
    { href: `${BASE}/hub/prospectos-gmail.html`, label: 'Prospectos', icon: 'prospecto', prospectos: true },
    { href: `${BASE}/hub/dashboard.html`, label: 'Dashboard', icon: 'tablero', roles: ['master', 'admin', 'staff'] },
    { href: `${BASE}/hub/propiedades-pruebas.html`, label: 'Propiedades (pruebas)', icon: 'llave', roles: ['master', 'admin'] },
    { href: `${BASE}/hub/perfil-comprador.html`, label: 'Perfil comprador', icon: 'prospecto' },
    { href: `${BASE}/propiedades.html`, label: 'Propiedades', icon: 'llave' },
    { href: `${BASE}/hub/tickets.html`, label: 'Reporta una Incidencia', icon: 'alert' },
    { href: `${BASE}/documentos/documentos.html`, label: 'Acuerdos y Contratos', icon: 'carpeta' },
    { href: `${BASE}/hub/firmas.html`, label: 'Firmas Digitales', icon: 'pluma' },
    { href: `${BASE}/hub/resenas.html`, label: 'Reseñas', icon: 'tablero', roles: ['master', 'admin', 'staff'] },
    { href: `${BASE}/hub/dictamenes.html`, label: 'Dictaminación de Expedientes', icon: 'dictamen' },
    { href: `${BASE}/hub/drive.html`, label: 'Documentos de Drive', icon: 'nube' },
    { href: `${BASE}/documentos/operatividad.html`, label: 'Operatividad', icon: 'plantilla', roles: ['admin', 'master', 'staff'] },
    { href: `${BASE}/documentos/internos/index.html`, label: 'Liderazgo', icon: 'liderazgo', roles: ['master', 'admin', 'staff'] },
    { href: `${BASE}/hub/admin.html?v=20260919f#asesores`, label: 'Panel Máster', icon: 'tablero', roles: ['master', 'admin', 'staff'] },
  ];

  let rolNavegacion = null, prospectosNavegacion = false;
  function accesoPermitido(item) {
    const ruta = new URL(item.href || item.url, location.origin).pathname;
    const destino = NAV_HUB.find(enlace => new URL(enlace.href, location.origin).pathname === ruta);
    if ((item.prospectos || (destino && destino.prospectos)) && !prospectosNavegacion) return false;
    const roles = item.roles || (destino && destino.roles) ||
      (/\/documentos\/internos\//.test(ruta) ? ['master', 'admin', 'staff'] : null);
    return !roles || roles.includes(rolNavegacion);
  }

  function estaActivo(href) {
    const ruta = location.pathname.replace(/\/+$/, '');
    const objetivo = new URL(href, location.origin).pathname.replace(/\/+$/, '');
    return ruta === objetivo || ruta.endsWith(objetivo);
  }

  function construirNav(items) {
    return items.map((item) => {
      if (item.section) return `<div class="drawer-section-label">${item.section}</div>`;
      const activo = estaActivo(item.href) ? ' activo' : '';
      const permisos = item.prospectos ? ' data-drawer-prospectos hidden' : item.roles ? ` data-drawer-roles="${item.roles.join(' ')}" hidden` : '';
      return `<a href="${item.href}" class="drawer-link${activo}"${permisos}>${ICONS[item.icon]}<span>${item.label}</span></a>`;
    }).join('');
  }

  // ── Índice de búsqueda del sitio ──
  // Aparte del menú (que solo trae las secciones grandes), aquí va cada
  // destino puntual - cada acuerdo, cada contrato - para poder llegar
  // directo escribiendo "renta" o "colaboración" en vez de navegar
  // Documentos > Acuerdos > buscarlo a ojo. `alias` son palabras que no
  // están en el título pero con las que alguien buscaría lo mismo.
  const INDICE_BUSQUEDA = [
    { label: 'Prospectos', href: `${BASE}/hub/prospectos-gmail.html`, cat: 'Hub', alias: 'leads gmail inmuebles24 contactos', prospectos: true },
    { label: 'Inicio del Hub', href: `${BASE}/portal.html`, cat: 'Hub' },
    { label: 'Dashboard', href: `${BASE}/hub/dashboard.html`, cat: 'Hub', alias: 'lore tracker comparativa indicadores produccion asociados' },
    { label: 'Propiedades (pruebas)', href: `${BASE}/hub/propiedades-pruebas.html`, cat: 'Hub', alias: 'feed xml json inventario conexion recepciones portal', roles: ['master','admin'] },
    { label: 'Accesos Directos', href: `${BASE}/hub/accesosdirectos.html`, cat: 'Hub', alias: 'command weetrust kw one' },
    { label: 'Acuerdos y Contratos', href: `${BASE}/documentos/documentos.html`, cat: 'Hub', alias: 'documentos' },
    { label: 'Documentos de Drive', href: `${BASE}/hub/drive.html`, cat: 'Hub', alias: 'drive carpeta archivos formatos manuales' },
    { label: 'Creador de formatos', href: `${BASE}/hub/plantillas.html`, cat: 'Hub', alias: 'plantillas' },
    { label: 'Reseñas', href: `${BASE}/hub/resenas.html`, cat: 'Hub', alias: 'resena aprobar testimonios publicacion' },
    { label: 'Firmas Digitales', href: `${BASE}/hub/firmas.html`, cat: 'Hub', alias: 'firma electronica weetrust firmar documento' },
    { label: 'Dictámenes', href: `${BASE}/hub/dictamenes.html`, cat: 'Hub', alias: 'dictamen expediente revision legal observaciones subsanar' },
    { label: 'Reporta una Incidencia', href: `${BASE}/hub/tickets.html`, cat: 'Hub', alias: 'ticket soporte tecnico ayuda' },
    { label: 'Asesores (Proceso de Alta)', href: `${BASE}/hub/admin.html?v=20260919f#asesores`, cat: 'Hub', alias: 'dar de alta asesor nuevo bajas back office celulas' },
    { label: 'Panel de Admin', href: `${BASE}/hub/admin.html?v=20260919f`, cat: 'Hub', alias: 'administracion' },
    { label: 'Configuración de cuenta', href: `${BASE}/perfil.html`, cat: 'Hub', alias: 'nombre contraseña seguridad' },

    { label: 'Carta de Terminación Anticipada', href: `${BASE}/documentos/acuerdos/cartaterminacion.html`, cat: 'Acuerdos', alias: 'terminar cancelar' },
    { label: 'Aceptación de Oferta de Arrendamiento', href: `${BASE}/documentos/acuerdos/aceptacionoferta.html`, cat: 'Acuerdos', alias: 'oferta arrendamiento' },
    { label: 'Contrapropuesta de Arrendamiento', href: `${BASE}/documentos/acuerdos/contrapropuesta.html`, cat: 'Acuerdos', alias: 'arrendamiento' },
    { label: 'Check List Vendedor y Comprador', href: `${BASE}/documentos/acuerdos/checklist.html`, cat: 'Acuerdos', alias: 'checklist vendedor comprador' },
    { label: 'Acuerdo de Colaboración entre Asesores', href: `${BASE}/documentos/acuerdos/colaboracion.html`, cat: 'Acuerdos', alias: 'colaboracion' },
    { label: 'Cédula de Registro de Cliente', href: `${BASE}/documentos/acuerdos/cedularegistro.html`, cat: 'Acuerdos', alias: 'registro cliente' },
    { label: 'Aviso de Privacidad', href: `${BASE}/documentos/acuerdos/avisodeprivacidad.html`, cat: 'Acuerdos', alias: 'privacidad' },
    { label: 'Acuerdo de Referido', href: `${BASE}/documentos/acuerdos/acuerdoreferido.html`, cat: 'Acuerdos', alias: 'referidos market center vendedor comprador' },

    { label: 'Acuerdo de Renta', href: `${BASE}/documentos/contratos/renta.html`, cat: 'Contratos', alias: 'renta arrendamiento contrato' },
    { label: 'Contrato de Compraventa PROFECO', href: `${BASE}/documentos/contratos/profeco.html`, cat: 'Contratos', alias: 'profeco compraventa venta residencial' },
    { label: 'ABC · Seguimiento de asesores', href: `${BASE}/documentos/internos/dt/abc-tracker.html`, cat: 'Internos (DT)', alias: 'abc tracker adopcion tecnologia avance palomear checklist dt' },
    { label: 'GPS · Programa Trimestral', href: `${BASE}/documentos/internos/gps.html`, cat: 'Internos (Liderazgo)', alias: 'gps trimestral seguimiento pc program' },
    { label: 'Constancia ABC de la Tecnología', href: `${BASE}/documentos/internos/abc.html`, cat: 'Internos (Liderazgo)', alias: 'abc tecnologia' },

    { label: 'Inicio', href: `${BASE}/index.html`, cat: 'Sitio público' },
    { label: 'Asesores', href: `${BASE}/asesores.html`, cat: 'Sitio público' },
    { label: 'Liderazgo', href: `${BASE}/staff.html`, cat: 'Sitio público' },
    { label: 'Nuestro Market Center', href: `${BASE}/market-center.html`, cat: 'Sitio público', alias: 'oficina mc' },
    { label: 'Déjanos una reseña', href: `${BASE}/resena.html`, cat: 'Sitio público', alias: 'review calificacion' },
  ];

  function normalizar(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // Drive y Calendario se agregan al buscador solo con sesión (hub), y
  // solo se piden una vez por apertura del panel - no en cada tecla - para
  // no golpear las APIs de Google en cada letra escrita. `null` = todavía
  // no se pidieron; una vez que llegan quedan en memoria para el resto de
  // la sesión de la pestaña.
  let driveItems = null;
  let calendarItems = null;
  let extrasPromise = null;

  function formatoFechaEvento(ev) {
    const d = new Date(ev.start);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function cargarExtras() {
    if (extrasPromise || esPublico || !window.kwSupabase) return;
    extrasPromise = window.kwSupabase.auth.getSession().then(({ data }) => {
      const token = data && data.session && data.session.access_token;
      if (!token) return;

      const pDrive = fetch('https://iloetojomzqtadkithtv.supabase.co/functions/v1/hyper-processor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ accion: 'drive_arbol' }),
      })
        .then((r) => r.json())
        .then((data) => {
          driveItems = (data.elementos || [])
            .filter((e) => e.link)
            .map((e) => ({
              label: e.nombre,
              href: e.link,
              cat: e.tipo === 'carpeta' ? 'Carpeta de Drive' : 'Archivo de Drive',
              externo: true,
            }));
        })
        .catch(() => { driveItems = []; });

      const pCalendario = fetch('https://iloetojomzqtadkithtv.supabase.co/functions/v1/calendar-events', {
        headers: { Authorization: 'Bearer ' + token },
      })
        .then((r) => {
          if (!r.ok) throw new Error('No se pudo cargar el calendario');
          return r.json();
        })
        .then((data) => {
          calendarItems = (data.events || []).map((ev) => {
            const fecha = formatoFechaEvento(ev);
            return {
              label: ev.title,
              href: ev.htmlLink,
              cat: fecha ? `Calendario · ${fecha}` : 'Calendario',
              externo: true,
            };
          });
        })
        .catch(() => { calendarItems = []; });

      return Promise.all([pDrive, pCalendario]).then(() => {
        // Si la búsqueda se sigue viendo, se repinta con lo que ya se
        // tenía escrito para que los resultados nuevos aparezcan sin que
        // la persona tenga que volver a teclear.
        if (busquedaAbierta()) pintarResultados(buscarInput.value);
      });
    }).catch(() => {});
  }

  let cargaBusquedaPortal;
  function buscarEnIndice(termino) {
    const q = normalizar(termino).trim();
    if (!q) return [];
    const palabras = q.split(/\s+/);
    if (!globalThis.kwBusquedaPortal && !cargaBusquedaPortal) {
      cargaBusquedaPortal = import('/assets/js/kw-busqueda-portal.js?v=20261110portal')
        .then(() => { if (busquedaAbierta()) pintarResultados(buscarInput.value); })
        .catch(() => {});
    }
    const buscar = globalThis.kwBusquedaPortal?.preparar(termino);
    const destinos = new Set(INDICE_BUSQUEDA.map((item) => new URL(item.href, location.origin).pathname));
    const accesos = NAV_HUB.concat(NAV_PUBLICO).filter((item) => {
      const ruta = new URL(item.href, location.origin).pathname;
      if (destinos.has(ruta)) return false;
      destinos.add(ruta);
      return true;
    }).map((item) => ({ ...item, cat: 'Secciones' }));
    return INDICE_BUSQUEDA.concat(accesos, driveItems || [], calendarItems || []).filter(accesoPermitido)
      .map((item) => {
        const texto = normalizar(item.label + ' ' + item.cat + ' ' + (item.alias || ''));
        // Todas las palabras escritas tienen que aparecer en algún lado
        // (en cualquier orden), no la frase completa tal cual.
        const coincidencia = buscar?.puntuar(texto) ?? (palabras.every(p => texto.includes(p)) ? 0 : Infinity);
        if (!Number.isFinite(coincidencia)) return null;
        // Coincidir desde el principio del título puntúa más alto que
        // coincidir a media palabra o solo en el alias.
        const enTitulo = normalizar(item.label).indexOf(q) >= 0;
        const alInicio = normalizar(item.label).indexOf(q) === 0;
        const puntaje = coincidencia * 3 + (alInicio ? 0 : enTitulo ? 1 : 2);
        return { item, puntaje };
      })
      .filter(Boolean)
      .sort((a, b) => a.puntaje - b.puntaje)
      .slice(0, 10)
      .map((r) => r.item);
  }

  const esPublico = modo === 'publico';
  const rutaPagina = location.pathname.replace(/\/+$/, '').toLowerCase();
  const esInicioHub = /\/portal\.html$/.test(rutaPagina);
  const esIndiceDocumentos = document.body.classList.contains('kw-indice-documentos') ||
    /\/documentos\/(acuerdos|contratos)(?:\/index\.html)?$/.test(rutaPagina);
  // El riel: en las pantallas de trabajo el menú deja de ser un panel que
  // aparece y desaparece, y pasa a ser una franja de íconos siempre a la
  // vista que se ensancha al acercarse. En el sitio público no: ahí el
  // menú se usa de vez en cuando y una franja fija le robaría ancho a las
  // propiedades. La marca va en el <html> para que el CSS pueda recorrer
  // el contenido y el header, que son de la página y no del menú.
  if (!esPublico) document.documentElement.classList.add('kw-riel');
  if (esInicioHub) document.documentElement.classList.add('kw-riel-inicio');
  if (esIndiceDocumentos) document.body.classList.add('kw-indice-documentos');
  if (esIndiceDocumentos) {
    const paginaDocumental = document.querySelector('main.page');
    const pieDocumental = paginaDocumental && paginaDocumental.querySelector(':scope > .footer');
    if (paginaDocumental && pieDocumental) {
      paginaDocumental.style.setProperty('display', 'flex', 'important');
      paginaDocumental.style.setProperty('flex-direction', 'column', 'important');
      paginaDocumental.style.setProperty('box-sizing', 'border-box', 'important');
      paginaDocumental.style.setProperty('min-height', '100vh', 'important');
      paginaDocumental.style.setProperty('padding-bottom', '12px', 'important');
      pieDocumental.style.setProperty('flex-shrink', '0', 'important');
      paginaDocumental.style.setProperty('position', 'relative', 'important');
      function ajustarPieDocumental() {
        pieDocumental.style.setProperty('position', 'static', 'important');
        pieDocumental.style.setProperty('inset', 'auto', 'important');
        pieDocumental.style.setProperty('margin-top', '48px', 'important');
        const anterior = pieDocumental.previousElementSibling;
        if (!anterior) return;
        const finContenido = anterior.offsetTop + anterior.offsetHeight;
        const inicioPieAlFondo = paginaDocumental.clientHeight - 12 - pieDocumental.offsetHeight;
        if (finContenido + 48 <= inicioPieAlFondo) {
          pieDocumental.style.setProperty('position', 'absolute', 'important');
          pieDocumental.style.setProperty('left', '18px', 'important');
          pieDocumental.style.setProperty('right', '24px', 'important');
          pieDocumental.style.setProperty('bottom', '12px', 'important');
          pieDocumental.style.setProperty('margin-top', '0', 'important');
        }
      }
      requestAnimationFrame(() => requestAnimationFrame(ajustarPieDocumental));
      window.addEventListener('resize', ajustarPieDocumental);
      window.addEventListener('kw-auth-ready', () => requestAnimationFrame(ajustarPieDocumental));
      window.setTimeout(ajustarPieDocumental, 600);
    }
  }
  const navHtml = construirNav(esPublico ? NAV_PUBLICO : NAV_HUB);
  const homeHref = esPublico ? `${BASE}/index.html` : `${BASE}/portal.html`;
  const footerHtml = esPublico
    ? `<a href="#" class="drawer-link" id="drawer-cta" style="color: var(--red);">${ICONS.logout}<span>Inicia Sesión</span></a>`
    : `<a href="#" class="drawer-link" id="drawer-logout">${ICONS.logout}<span>Cerrar sesión</span></a>`;

  const contenedor = document.createElement('div');
  contenedor.innerHTML = `
    <div class="drawer-overlay" id="drawer-overlay"></div>
    <div class="drawer" id="drawer">
      <div class="drawer-header">
        <button type="button" class="drawer-hamburguesa" id="drawer-hamburguesa" aria-label="Menú">${ICONS.menu}</button>
        <a href="${homeHref}" class="logo" aria-label="KW Premier">
          <img src="${LOGO}" alt="KWEB" />
        </a>
        <button type="button" class="drawer-close" id="drawer-close" aria-label="Cerrar menú">${ICONS.close}</button>
      </div>
      ${esPublico ? '' : `
      <a href="${BASE}/perfil.html" class="drawer-usuario" id="drawer-usuario">
        <span class="drawer-usuario-foto" id="drawer-usuario-foto">${ICONS.persona}</span>
        <span class="drawer-usuario-txt">
          <span class="drawer-usuario-nombre" id="drawer-usuario-nombre">Configuración de cuenta</span>
          <span class="drawer-usuario-rol" id="drawer-usuario-rol"></span>
        </span>
      </a>`}
      <nav class="drawer-nav">
        ${esPublico ? '' : `
        <div class="drawer-buscar-acceso" id="drawer-buscar">
          <button type="button" class="drawer-link drawer-buscar-toggle" id="drawer-buscar-toggle" aria-label="Buscar en el sitio" aria-controls="search-bar" aria-expanded="false">
            ${ICONS.search}<span>Buscar en el sitio</span>
          </button>
        </div>`}
        ${navHtml}
      </nav>
      <div class="drawer-footer">${footerHtml}</div>
    </div>
    ${esPublico ? '' : `
    <div class="drawer drawer-der" id="drawer-accesos">
      <div class="drawer-header">
        <div class="drawer-titulo">${ICONS.estrella}<span>Mis accesos</span></div>
        <button type="button" class="drawer-close" id="drawer-accesos-close" aria-label="Cerrar accesos">${ICONS.close}</button>
      </div>
      <nav class="drawer-nav" id="accesos-lista"></nav>
      <div class="drawer-footer">
        <button type="button" class="drawer-link drawer-agregar" id="accesos-agregar">${ICONS.mas}<span>Guardar esta página</span></button>
      </div>
    </div>`}
  `;
  while (contenedor.firstChild) document.body.appendChild(contenedor.firstChild);

  // En Nuevo asesor el Hub permanece expandido: fijamos los textos
  // directamente para que ninguna regla del riel contraído los oculte.
  function fijarTextosNuevoAsesor() {
    if (!document.body.classList.contains('en-ficha-asesor') &&
        !document.body.classList.contains('cargando-nuevo')) return;
    const d = document.getElementById('drawer');
    if (!d) return;
    d.style.width = '292px';
    d.style.minWidth = '292px';
    d.style.maxWidth = '292px';
    d.querySelectorAll('.drawer-link > span, .drawer-section-label, .drawer-usuario-txt')
      .forEach((el) => {
        el.style.setProperty('display', 'inline-flex', 'important');
        el.style.setProperty('opacity', '1', 'important');
        el.style.setProperty('visibility', 'visible', 'important');
        el.style.setProperty('width', 'auto', 'important');
        el.style.setProperty('max-width', 'none', 'important');
        el.style.setProperty('flex', '1 1 auto', 'important');
        el.style.setProperty('overflow', 'visible', 'important');
      });
  }
  fijarTextosNuevoAsesor();
  new MutationObserver(fijarTextosNuevoAsesor).observe(document.body, {
    attributes: true, attributeFilter: ['class']
  });

  // El botón vive dentro del <header> de la página (si existe) para que
  // quede junto al logo; si la página no tiene header (ej. index.html),
  // flota fijo en la esquina.
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.id = 'kw-drawer-toggle';
  toggleBtn.className = 'hamburger-btn';
  toggleBtn.setAttribute('aria-label', 'Menú');
  toggleBtn.innerHTML = ICONS.menu;

  // A la derecha del de hamburguesa, siempre - se crea junto con él y se
  // inserta justo después, sin importar cómo esté armado el header de
  // cada página.
  const searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.id = 'kw-buscar-toggle';
  searchBtn.className = 'hamburger-btn kw-buscar-btn';
  searchBtn.setAttribute('aria-label', 'Buscar en el sitio');
  searchBtn.setAttribute('aria-controls', 'search-bar');
  searchBtn.setAttribute('aria-expanded', 'false');
  searchBtn.innerHTML = ICONS.search;

  const header = document.querySelector('header');
  if (header) {
    header.insertBefore(toggleBtn, header.firstElementChild);
    toggleBtn.insertAdjacentElement('afterend', searchBtn);
  } else {
    toggleBtn.classList.add('fijo');
    searchBtn.classList.add('fijo', 'fijo-buscar');
    document.body.insertBefore(searchBtn, document.body.firstChild);
    document.body.insertBefore(toggleBtn, document.body.firstChild);
  }

  // ── Los botones de acción salen de la cápsula ──
  // Perfil, la campanita y Panel no son parte de navegar por la página:
  // son atajos a otro lado. Se sacan de la cápsula y se ponen a su lado,
  // cada uno en su propia pastilla, igual que el botón de buscar en la
  // barra de Música de iOS. Se hace aquí y no en el HTML de cada página
  // porque la hamburguesa y la lupa también se insertan desde aquí.
  if (header && header.classList.contains('kw-header')) {
    // ── La campanita, en todas ──
    // Vivía en el HTML de cada pantalla, y solo cuatro la traían: en las
    // demás no había manera de enterarse de nada sin ir al portal.
    // Nueve cargaban el script y cinco de esas ni siquiera tenían el
    // hueco donde dibujarse, así que corría para nada. Se crea aquí, que
    // es donde ya se arma el header, y así está en las mismas pantallas
    // que tienen menú.
    if (!esPublico) {
      if (!document.getElementById('notif-bell-slot')) {
        const hueco = document.createElement('div');
        hueco.id = 'notif-bell-slot';
        header.appendChild(hueco);
      }
      if (!document.querySelector('script[src*="notif-bell.js"]')) {
        const sc = document.createElement('script');
        sc.src = `${BASE}/assets/js/notif-bell.js?v=20261030dictamen-liderazgo`;
        document.head.appendChild(sc);
      } else {
        // Ya estaba cargado. Se le avisa de todos modos, sin importar si
        // el hueco lo acabamos de crear o ya venía en el HTML: notif-bell
        // se dibuja una sola vez, al enterarse de que hay sesión, y
        // quién llega primero entre ese aviso, este script y el suyo
        // depende de en qué orden los baje el navegador. Volver a
        // pedírselo no cuesta (dibujar es idempotente) y quita la
        // carrera de en medio.
        // Entre try y catch a propósito: esto corre en pleno armado del
        // menú, y lo que le pase a la campanita no puede dejar sin menú
        // a la pantalla entera.
        const avisar = () => {
          try {
            if (typeof window.kwNotifRefrescar === 'function') window.kwNotifRefrescar();
          } catch (e) {
            console.error('No se pudo avisar a la campanita:', e);
          }
        };
        avisar();
        window.addEventListener('kw-auth-ready', avisar, { once: true });
      }
    }

    const sueltos = Array.from(
      header.querySelectorAll('#btn-perfil-header, #notif-bell-slot, #btn-admin'));

    if (sueltos.length) {
      const capsula = document.createElement('div');
      capsula.className = 'kw-header-capsula';
      while (header.firstChild) capsula.appendChild(header.firstChild);
      header.appendChild(capsula);

      const grupo = document.createElement('div');
      grupo.className = 'kw-header-sueltos';
      sueltos.forEach((el) => {
        // Traía márgenes pensados para acomodarse DENTRO de la barra;
        // fuera de ella sobran y descuadran el renglón.
        el.style.marginRight = '';
        el.style.marginLeft = '';
        grupo.appendChild(el);
      });
      header.appendChild(grupo);

      // Los envoltorios que quedaron vacíos al sacarles sus botones
      // seguirían ocupando lugar en la cápsula.
      capsula.querySelectorAll('.header-socials, .header-right').forEach((w) => {
        if (!w.children.length) w.remove();
      });

      header.classList.add('kw-header-partido');
    }
  }

  // ── El Atrás, en la punta contraria a la hamburguesa ──
  // Cada página lo trae donde le tocó (suelto, o dentro de un envoltorio
  // junto a la campanita), y así quedaba pegado a la lupa, en la punta
  // equivocada. Se lleva al final de la cápsula, y sin envoltorio: dentro
  // de uno, el margen automático que lo empuja a la derecha no tendría
  // contra qué empujar.
  //
  // Va aquí y no en el HTML de cada página porque el campo de búsqueda se
  // agrega más abajo y tiene que quedar después de él.
  const accionesMq = window.matchMedia('(min-width: 1024px)');
  let campanaRaf = 0;
  function obtenerAccionesDePagina() {
    const grupos = Array.from(document.querySelectorAll('.kw-page-acciones'));
    const visibles = grupos.find((el) => {
      const encabezado = el.closest('.kw-page-encabezado, .page-head');
      return (encabezado || el).offsetParent !== null;
    });
    if (visibles) return visibles;

    const encabezados = Array.from(document.querySelectorAll('.kw-page-encabezado, .page-head'));
    // Una vista puede conservar su encabezado en el DOM mientras está
    // oculta (por ejemplo, el historial mientras se prepara un documento).
    // No crear ahí otro grupo de acciones: al volver, su margen automático
    // comparte el espacio con el grupo original y termina centrándolo.
    const encabezado = encabezados.find((el) => el.offsetParent !== null);
    if (!encabezado) return null;
    if (encabezado) {
      encabezado.classList.add('con-acciones', 'kw-acciones-universales');
      const accionDirecta = Array.from(encabezado.children).find((el) =>
        el.matches('#btn-nuevo, .btn-nuevo, .btn-nuevo-doc, .btn-nuevo-asesor, .btn-reportar'));
      const acciones = document.createElement('div');
      acciones.className = 'kw-page-acciones';
      encabezado.appendChild(acciones);
      if (accionDirecta) acciones.appendChild(accionDirecta);
      return acciones;
    }

    // Las pantallas anteriores al encabezado compartido tienen el título
    // directamente dentro de .page. Se les arma el mismo renglón sin
    // cambiar el texto ni el resto de su contenido.
    const titulos = Array.from(document.querySelectorAll('main > .page-title, .page > .page-title'));
    const titulo = titulos.find((el) => el.offsetParent !== null) || titulos[0];
    if (!titulo || !titulo.parentElement) return null;
    const encabezadoAuto = document.createElement('div');
    encabezadoAuto.className = 'kw-page-encabezado con-acciones kw-acciones-universales';
    titulo.parentElement.insertBefore(encabezadoAuto, titulo);
    encabezadoAuto.appendChild(titulo);
    const acciones = document.createElement('div');
    acciones.className = 'kw-page-acciones';
    encabezadoAuto.appendChild(acciones);
    return acciones;
  }
  function colocarCampanaEnAcciones() {
    const campana = document.getElementById('notif-bell-slot');
    if (!campana) return;
    const destino = document.querySelector('[data-notificaciones-header]');
    if (destino && accionesMq.matches) {
      if (campana.parentElement !== destino) destino.appendChild(campana);
      return;
    }
    const sueltos = header && header.querySelector('.kw-header-sueltos');
    if (!accionesMq.matches) {
      if (sueltos) sueltos.appendChild(campana);
      return;
    }
    const acciones = obtenerAccionesDePagina();
    if (!acciones) return;
    const engrane = acciones.querySelector('.kw-menu-ancla');
    const accionPrincipal = acciones.querySelector('#btn-nuevo, .btn-nuevo, .btn-nuevo-doc, .btn-nuevo-asesor, .btn-reportar');
    if (engrane) {
      acciones.insertBefore(engrane, acciones.firstChild);
      engrane.insertAdjacentElement('afterend', campana);
    } else {
      acciones.insertBefore(campana, acciones.firstChild);
    }
    if (accionPrincipal) acciones.appendChild(accionPrincipal);
  }
  function programarCampanaEnAcciones() {
    cancelAnimationFrame(campanaRaf);
    campanaRaf = requestAnimationFrame(colocarCampanaEnAcciones);
  }
  programarCampanaEnAcciones();
  document.addEventListener('DOMContentLoaded', colocarCampanaEnAcciones, { once: true });
  window.addEventListener('kw-auth-ready', programarCampanaEnAcciones);
  accionesMq.addEventListener('change', programarCampanaEnAcciones);
  if (document.body) {
    new MutationObserver(programarCampanaEnAcciones).observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  const atras = header && header.querySelector('.back-btn');
  if (atras) {
    if (!atras.hasAttribute('aria-label')) atras.setAttribute('aria-label', atras.textContent.trim() || 'Volver');
    const caja = header.querySelector('.kw-header-capsula') || header;
    const envoltorio = atras.parentElement;
    caja.appendChild(atras);
    if (envoltorio !== caja && !envoltorio.children.length) envoltorio.remove();
  }

  // ── Buscador ──
  // La busqueda universal conserva los filtros propios de cada pagina.
  const capsula = header
    ? (header.querySelector('.kw-header-capsula') || header)
    : null;
  const areaBuscarRiel = document.getElementById('drawer-buscar');
  const searchCheck = document.getElementById('search-btn');

  const buscarInput = document.createElement('input');
  buscarInput.type = 'text';
  buscarInput.id = 'search-bar';
  buscarInput.className = 'kw-buscar-campo-inline';
  buscarInput.autocomplete = 'off';
  buscarInput.placeholder = 'Buscar en el sitio…';
  buscarInput.setAttribute('aria-label', 'Buscar en el sitio');
  buscarInput.setAttribute('aria-controls', 'kw-buscar-resultados');

  const buscarCerrar = document.createElement('button');
  buscarCerrar.type = 'button';
  buscarCerrar.className = 'kw-buscar-cerrar-inline';
  buscarCerrar.setAttribute('aria-label', 'Cerrar búsqueda');
  buscarCerrar.innerHTML = ICONS.close;

  // Los resultados cuelgan de la cápsula, no de un panel a pantalla
  // completa. En las páginas con buscador propio no hay lista: los
  // resultados los pinta la página misma.
  const buscarResultados = document.createElement('div');
  buscarResultados.className = 'kw-buscar-resultados-inline';
  buscarResultados.id = 'kw-buscar-resultados';
  buscarResultados.hidden = true;

  function buscadorVaEnRiel() {
    return Boolean(areaBuscarRiel && window.matchMedia('(min-width: 1024px)').matches);
  }

  function colocarBuscador() {
    const destino = buscadorVaEnRiel() ? areaBuscarRiel : capsula;
    if (!destino || buscarInput.parentElement === destino) return;
    const abierta = busquedaAbierta();
    const enfocado = document.activeElement === buscarInput;
    destino.appendChild(buscarInput);
    destino.appendChild(buscarCerrar);
    destino.appendChild(buscarResultados);
    if (abierta) {
      if (header) header.classList.toggle('kw-buscando', !buscadorVaEnRiel());
      if (areaBuscarRiel) {
        const riel = areaBuscarRiel.closest('.drawer');
        riel.classList.toggle('buscando', buscadorVaEnRiel());
        if (buscadorVaEnRiel()) riel.classList.add('open');
        riel.classList.toggle('busqueda-con-resultados', buscadorVaEnRiel() && Boolean(buscarInput.value.trim()));
      }
      if (enfocado) requestAnimationFrame(() => buscarInput.focus());
    }
  }
  colocarBuscador();
  window.addEventListener('resize', colocarBuscador);

  function busquedaAbierta() {
    return Boolean((header && header.classList.contains('kw-buscando')) ||
      (areaBuscarRiel && areaBuscarRiel.closest('.drawer').classList.contains('buscando')));
  }

  function abrirBuscar() {
    colocarBuscador();
    if (!capsula && !areaBuscarRiel) return;
    [searchBtn, document.getElementById('drawer-buscar-toggle')].filter(Boolean)
      .forEach((boton) => boton.setAttribute('aria-expanded', 'true'));
    if (buscadorVaEnRiel() || document.body.classList.contains('en-ficha-asesor')) {
      buscarInput.placeholder = 'Buscar en el sitio';
    }
    if (searchCheck) searchCheck.checked = true;
    if (buscadorVaEnRiel()) {
      const riel = areaBuscarRiel.closest('.drawer');
      riel.classList.remove('sin-hover');
      riel.classList.add('open', 'buscando');
    } else if (header) {
      cerrarPaneles();
      header.classList.add('kw-buscando');
    }
    buscarResultados.hidden = true;
    buscarResultados.innerHTML = '';
    // La búsqueda global se conserva aunque la página también tenga un
    // filtro local: ambos reciben el texto al mismo tiempo.
    cargarExtras();
    // El foco espera al siguiente cuadro: pedirlo en el mismo tick en que
    // la cápsula todavía se está estirando hace que algunos navegadores
    // lo ignoren.
    requestAnimationFrame(() => buscarInput.focus());
  }
  function cerrarBuscar(devolverFoco) {
    if (!capsula && !areaBuscarRiel) return;
    [searchBtn, document.getElementById('drawer-buscar-toggle')].filter(Boolean)
      .forEach((boton) => boton.setAttribute('aria-expanded', 'false'));
    if (searchCheck) searchCheck.checked = false;
    if (header) header.classList.remove('kw-buscando');
    if (areaBuscarRiel) {
      const riel = areaBuscarRiel.closest('.drawer');
      riel.classList.remove('buscando', 'busqueda-con-resultados');
      if (esRielFijo(riel)) {
        riel.classList.remove('sin-hover');
        riel.classList.add('open');
      } else {
        if (enRiel(riel)) riel.classList.add('sin-hover');
        riel.classList.remove('open');
      }
    }
    buscarInput.blur();
    buscarResultados.hidden = true;
    buscarInput.value = '';
    buscarResultados.innerHTML = '';
    if (devolverFoco) {
      const acceso = buscadorVaEnRiel() ? document.getElementById('drawer-buscar-toggle') : searchBtn;
      if (acceso) acceso.focus({ preventScroll: true });
    }
  }

  function pintarResultados(termino) {
    const q = termino.trim();
    if (areaBuscarRiel) {
      areaBuscarRiel.closest('.drawer').classList.toggle('busqueda-con-resultados', Boolean(q));
    }
    // Con el campo vacío no se enseña nada: el recuadro decía "escribe
    // para buscar" justo debajo de donde se está escribiendo, y lo único
    // que hacía era tapar la página. Aparece hasta que hay algo que
    // contestar.
    if (!q) {
      buscarResultados.hidden = true;
      buscarResultados.innerHTML = '';
      return;
    }
    buscarResultados.hidden = false;
    const resultados = buscarEnIndice(q);
    if (!resultados.length) {
      buscarResultados.innerHTML = `<div class="kw-buscar-vacio">Sin resultados para "${q.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}".</div>`;
      return;
    }
    buscarResultados.innerHTML = resultados.map((item) => `
      <a class="kw-buscar-item" href="${item.href}"${item.externo ? ' target="_blank" rel="noopener"' : ''}>
        <span class="kw-buscar-item-texto">
          <span class="kw-buscar-item-label">${item.label}</span>
          <span class="kw-buscar-item-cat">${item.cat}</span>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </a>
    `).join('');
  }

  function volverAlAccesoBuscar() {
    cerrarBuscar();
  }

  searchBtn.addEventListener('click', () => {
    if (busquedaAbierta()) cerrarBuscar();
    else abrirBuscar();
  });
  buscarCerrar.addEventListener('click', () => cerrarBuscar(true));

  buscarInput.addEventListener('input', () => {
    // La búsqueda del riel es universal. Los filtros particulares de
    // cada pantalla viven en su propia barra y no reciben este texto.
    pintarResultados(buscarInput.value);
  });
  buscarInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarBuscar(true); return; }
    if (e.key === 'Enter') {
      const primero = buscarResultados.querySelector('.kw-buscar-item');
      if (primero) location.href = primero.getAttribute('href');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && busquedaAbierta()) cerrarBuscar(true);
  });
  // Picar fuera cierra la búsqueda y devuelve el riel a su ancho angosto.
  // Los resultados viven dentro del área de búsqueda, así que se pueden
  // seleccionar sin activar este cierre.
  document.addEventListener('click', (e) => {
    if (!busquedaAbierta()) return;
    if ((header && header.contains(e.target)) ||
        (areaBuscarRiel && areaBuscarRiel.contains(e.target))) return;
    volverAlAccesoBuscar();
    e.kwBuscadorContraido = true;
  });

  const drawerIzq = document.getElementById('drawer');
  const drawerDer = document.getElementById('drawer-accesos');
  const velo = document.getElementById('drawer-overlay');

  // En escritorio la lupa abre el campo dentro del propio riel.
  const buscarRiel = document.getElementById('drawer-buscar-toggle');
  if (buscarRiel) buscarRiel.addEventListener('click', (e) => {
    e.stopPropagation();
    if (busquedaAbierta()) cerrarBuscar();
    else abrirBuscar();
  });

  // Los dos paneles se manejan igual, solo cambia de qué lado entran.
  // "signo" es hacia dónde se sale de la pantalla: -1 el de la izquierda,
  // +1 el de la derecha.
  const PANELES = [
    { el: drawerIzq, signo: -1 },
    { el: drawerDer, signo: 1 },
  ].filter((p) => p.el);

  // ¿El menú de la izquierda está de riel ahora mismo? Solo entonces se
  // porta como una gaveta que se ensancha; en celular, en el sitio
  // público y en el panel de accesos sigue siendo un panel que se abre
  // encima de la página.
  function enRiel(el) {
    return el === drawerIzq &&
      document.documentElement.classList.contains('kw-riel') &&
      window.matchMedia('(min-width: 1024px)').matches;
  }

  function esRielFijo(el) {
    return enRiel(el) && !esInicioHub &&
      !document.body.classList.contains('firmas-riel-contraido');
  }

  // En escritorio el menú del Hub es navegación permanente, no una
  // gaveta temporal. En celular conserva el panel superpuesto de siempre.
  const rielFijoMq = window.matchMedia('(min-width: 1024px)');
  function sincronizarRielFijo() {
    if (esRielFijo(drawerIzq)) {
      drawerIzq.classList.remove('sin-hover');
      drawerIzq.classList.add('open');
    } else {
      drawerIzq.classList.remove('open', 'sin-hover');
    }
  }
  sincronizarRielFijo();
  rielFijoMq.addEventListener('change', sincronizarRielFijo);

  function abrirPanel(panel) {
    if (!panel || !panel.el) return;
    PANELES.forEach((otro) => {
      if (otro !== panel && !esRielFijo(otro.el)) otro.el.classList.remove('open');
    });
    panel.el.classList.remove('sin-hover');
    panel.el.classList.add('open');
    // El riel no tapa la página: vive en su propia franja. Trabarle el
    // scroll al cuerpo y echarle el velo encima son cosas de un panel
    // que sí la tapa. Con el riel, picar la hamburguesa dejaba la página
    // sin poder rodarse y sin nada visible que explicara por qué.
    if (!enRiel(panel.el)) {
      velo.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    if (panel.el === drawerDer && typeof cargarAccesos === 'function') cargarAccesos();
  }
  function cerrarPaneles() {
    PANELES.forEach((p) => {
      if (esRielFijo(p.el)) {
        p.el.classList.remove('sin-hover');
        p.el.classList.add('open');
        return;
      }
      // Al soltar el riel, el cursor sigue encima (se acaba de picar un
      // botón de adentro), así que el :hover lo mantendría ancho y
      // parecería que no pasó nada. Se le fuerza el ancho angosto hasta
      // que el cursor salga; de ahí en adelante manda el hover otra vez.
      if (enRiel(p.el) && p.el.classList.contains('open')) p.el.classList.add('sin-hover');
      p.el.classList.remove('open');
    });
    velo.classList.remove('open');
    document.body.style.overflow = '';
  }

  // En cuanto el cursor sale del riel, el freno se levanta.
  drawerIzq.addEventListener('mouseleave', () => drawerIzq.classList.remove('sin-hover'));

  // Sin velo que atrape los clics, es esto lo que cierra el riel al picar
  // fuera de él.
  document.addEventListener('click', (e) => {
    if (e.kwBuscadorContraido) return;
    if (!drawerIzq.classList.contains('open') || !enRiel(drawerIzq)) return;
    if (e.target instanceof Element && e.target.closest('#drawer, #kw-drawer-toggle')) return;
    cerrarPaneles();
  });
  // Nombres de siempre, para no tocar lo que ya los usaba.
  function abrir() { abrirPanel(PANELES[0]); }
  function cerrar() { cerrarPaneles(); }

  document.getElementById('kw-drawer-toggle').addEventListener('click', abrir);
  // La hamburguesa que vive dentro del riel: angosto es lo único que se
  // ve de ese renglón, y al picarla deja el menú abierto sin tener que
  // mantener el cursor encima. Vuelta a picar, se cierra.
  const hamRiel = document.getElementById('drawer-hamburguesa');
  if (hamRiel) hamRiel.addEventListener('click', () => {
    if (esRielFijo(drawerIzq)) return;
    if (drawerIzq.classList.contains('open')) cerrar(); else abrir();
  });
  velo.addEventListener('click', cerrar);
  document.getElementById('drawer-close').addEventListener('click', cerrar);
  const cerrarDer = document.getElementById('drawer-accesos-close');
  if (cerrarDer) cerrarDer.addEventListener('click', cerrar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && PANELES.some(panel => panel.el.classList.contains('open'))) cerrar();
  });

  // Los paneles se abren y cierran mediante sus botones.

  // ── Accesos guardados (la barra de la derecha) ─────────────────
  // Viven en Supabase, uno por persona (tabla accesos_rapidos, fase 50).
  // Si la tabla todavía no existe, o no hay sesión, el panel se queda
  // con su mensaje de vacío en vez de tronar: es un extra, no puede
  // tumbar el resto de la página.
  let cargados = false;

  function iconoDe(clave) { return ICONS[clave] || ICONS.doc; }

  // De qué es la página en la que uno está, para ponerle su dibujito.
  function adivinarIcono(ruta) {
    if (/drive/.test(ruta)) return 'carpeta';
    if (/calendario/.test(ruta)) return 'calendar';
    if (/micrositio|perfil/.test(ruta)) return 'user';
    if (/propiedad/.test(ruta)) return 'llave';
    if (/prospecto/.test(ruta)) return 'prospecto';
    if (/ticket|incidencia/.test(ruta)) return 'alert';
    return 'doc';
  }

  function tituloDeEstaPagina() {
    const enCapsula = document.querySelector('.kw-header-title');
    const desdeCapsula = enCapsula && enCapsula.textContent.trim();
    if (desdeCapsula) return desdeCapsula;
    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    return (document.title || 'Página').replace(/\s*[|-].*$/, '').trim();
  }

  function pintarAccesos(filas) {
    filas = filas.filter(accesoPermitido);
    const lista = document.getElementById('accesos-lista');
    if (!lista) return;
    if (!filas.length) {
      lista.innerHTML = '<div class="drawer-vacio">Todavía no guardas ningún acceso.' +
        '<span>Entra a donde quieras y dale a "Guardar esta página".</span></div>';
      return;
    }
    lista.innerHTML = filas.map((f) => {
      const t = document.createElement('div');
      t.textContent = f.titulo;
      return `<div class="drawer-acceso">
        <a class="drawer-link" href="${window.kwSecurity.escapeHtml(window.kwSecurity.safeUrl(f.url, true))}">${iconoDe(f.icono)}<span>${t.innerHTML}</span></a>
        <button type="button" class="drawer-quitar" data-quitar="${f.id}" title="Quitar" aria-label="Quitar ${window.kwSecurity.escapeHtml(f.titulo)}">${ICONS.basura}</button>
      </div>`;
    }).join('');
    lista.querySelectorAll('[data-quitar]').forEach((btn) => {
      btn.addEventListener('click', () => quitarAcceso(btn.dataset.quitar));
    });
  }

  // ── Quién está adentro, hasta arriba del menú ──
  // El nombre y el puesto de quien tiene la sesión, con su foto si la
  // subió. Es también la manera de llegar al perfil: antes eso vivía en
  // una pastilla suelta del header, que solo estaba en el portal.
  const ROLES_TXT = { master: 'Master', admin: 'Admin', staff: 'Liderazgo', asociado: 'Asociado' };

  async function cargarUsuario() {
    const caja = document.getElementById('drawer-usuario');
    if (!caja || !window.kwSupabase) return;
    try {
      const { data: u } = await (window.kwSession.usuarioInicial ? window.kwSession.usuarioInicial(window.kwSupabase) : window.kwSession.usuario(window.kwSupabase));
      if (!u || !u.user) return;
      const { data: perfil } = await (window.kwSession && window.kwSession.perfilInicial ? window.kwSession.perfilInicial(window.kwSupabase) : window.kwSupabase
        .from('profiles')
        .select('nombre, apellido, role, puesto, foto_url')
        .eq('id', u.user.id)
        .single());
      if (!perfil) return;
      if (u.user.id === '2bd46b9a-68d8-476c-844c-27f10097816e') {
        Promise.resolve().then(() => window.kwSupabase.rpc('prospectos_habilitado')).then(acceso => {
          prospectosNavegacion = !acceso.error && acceso.data === true;
          document.querySelectorAll('[data-drawer-prospectos]').forEach(enlace => { enlace.hidden = !prospectosNavegacion; });
        }).catch(() => { prospectosNavegacion = false; });
      }
      document.querySelectorAll('[data-drawer-prospectos]').forEach(enlace => { enlace.hidden = !prospectosNavegacion; });
      rolNavegacion = perfil.role;
      document.querySelectorAll('[data-drawer-roles]').forEach((enlace) => {
        enlace.hidden = !enlace.dataset.drawerRoles.split(' ').includes(perfil.role);
      });

      const nombre = [perfil.nombre, perfil.apellido].filter(Boolean).join(' ').trim();
      if (nombre) document.getElementById('drawer-usuario-nombre').textContent = nombre;

      const rol = document.getElementById('drawer-usuario-rol');
      if (rol && perfil.role) {
        rol.textContent = perfil.role === 'staff' && String(perfil.puesto || '').trim()
          ? String(perfil.puesto).trim() : ROLES_TXT[perfil.role] || perfil.role;
        rol.title = rol.textContent;
        rol.className = 'drawer-usuario-rol rol-' + perfil.role;
      }

      if (perfil.foto_url) {
        const foto = document.getElementById('drawer-usuario-foto');
        const img = document.createElement('img');
        img.src = perfil.foto_url;
        img.alt = '';
        // Si la foto no carga, se queda el monito de siempre.
        img.addEventListener('error', () => img.remove());
        img.addEventListener('load', () => { foto.textContent = ''; foto.appendChild(img); });
      }
    } catch (e) {
      // Sin datos, el bloque se queda con "Mi perfil": el enlace sirve igual.
    }
  }

  async function cargarAccesos(forzar) {
    const lista = document.getElementById('accesos-lista');
    if (!lista || (cargados && !forzar)) return;
    if (!window.kwSupabase) { pintarAccesos([]); return; }
    try {
      const { data: u } = await window.kwSession.usuario(window.kwSupabase);
      if (!u || !u.user) { pintarAccesos([]); return; }
      const { data, error } = await window.kwSupabase
        .from('accesos_rapidos')
        .select('id, titulo, url, icono, orden')
        .eq('user_id', u.user.id)
        .order('orden')
        .order('created_at');
      if (error) throw error;
      cargados = true;
      pintarAccesos(data || []);
    } catch (err) {
      console.error('No se pudieron cargar los accesos:', err);
      const div = document.createElement('div');
      div.textContent = porQueFallo(err);
      lista.innerHTML = '<div class="drawer-vacio">No se pudo cargar la lista.' +
        '<span>' + div.innerHTML + '</span></div>';
    }
  }

  async function quitarAcceso(id) {
    if (!window.kwSupabase) return;
    try {
      await window.kwSupabase.from('accesos_rapidos').delete().eq('id', id);
      await cargarAccesos(true);
    } catch (err) { /* si falla, la lista se queda como estaba */ }
  }

  // Un "no se pudo" a secas no dice qué arreglar. Los dos motivos que de
  // verdad pasan se nombran; de lo demás se muestra lo que dijo el
  // servidor, y el detalle completo queda en la consola.
  function porQueFallo(err) {
    const msg = (err && (err.message || err.error_description)) || '';
    const code = (err && err.code) || '';
    // Dos redacciones para lo mismo: 42P01 es como lo dice Postgres y
    // PGRST205 ("Could not find the table") como lo dice PostgREST, que
    // es la que llega desde el navegador.
    if (code === '42P01' || code === 'PGRST205' ||
        /does not exist|no existe|could not find the table/i.test(msg)) {
      return 'Falta crear la tabla (migración 050)';
    }
    if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
      return 'Sin permiso para guardar';
    }
    if (/sin sesión/i.test(msg)) return 'Necesitas iniciar sesión';
    return msg ? msg.slice(0, 44) : 'No se pudo guardar';
  }

  async function guardarEstaPagina() {
    const btn = document.getElementById('accesos-agregar');
    if (!btn || !window.kwSupabase) return;
    const textoAntes = btn.innerHTML;
    btn.disabled = true;
    let cuantoDura = 1600;
    try {
      const { data: u } = await window.kwSession.usuario(window.kwSupabase);
      if (!u || !u.user) throw new Error('sin sesión');
      const url = location.pathname + location.search;
      const { error } = await window.kwSupabase.from('accesos_rapidos').insert({
        user_id: u.user.id,
        titulo: tituloDeEstaPagina().slice(0, 80),
        url: url,
        icono: adivinarIcono(url),
      });
      // El índice único hace que guardar dos veces la misma página no
      // sea un error de verdad: ya estaba, y con eso basta.
      if (error && !/duplicate|unique/i.test(error.message || '')) throw error;
      btn.innerHTML = ICONS.estrella + '<span>Guardada</span>';
      await cargarAccesos(true);
    } catch (err) {
      console.error('No se pudo guardar el acceso:', err);
      const div = document.createElement('div');
      div.textContent = porQueFallo(err);
      btn.innerHTML = ICONS.mas + '<span>' + div.innerHTML + '</span>';
      // El motivo se queda más tiempo, que hay que alcanzar a leerlo.
      cuantoDura = 4000;
    }
    setTimeout(() => { btn.innerHTML = textoAntes; btn.disabled = false; }, cuantoDura);
  }

  if (!esPublico) {
    const btnAgregar = document.getElementById('accesos-agregar');
    if (btnAgregar) btnAgregar.addEventListener('click', guardarEstaPagina);
  }

  if (esPublico) {
    const cta = document.getElementById('drawer-cta');
    cta.addEventListener('click', (e) => {
      e.preventDefault();
      cerrar();
      if (typeof window.irAlPortal === 'function') window.irAlPortal();
      else location.href = `${BASE}/login.html`;
    });
  } else {
    const logout = document.getElementById('drawer-logout');
    logout.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof window.kwLogout === 'function') window.kwLogout();
      else location.href = `${BASE}/login.html`;
    });
  }

  // La ficha del usuario abre la configuración de cuenta. El micrositio
  // público queda pausado hasta retomar esa experiencia visual.

  // El bloque de quien tiene la sesión se llena en cuanto la hay, no al
  // abrir el menú: si se esperara, el nombre aparecería un parpadeo
  // después de que ya se está viendo.
  if (!esPublico) {
    function cargarPersonalizacion() {
      if (document.getElementById('kw-marca-script')) return;
      var script = document.createElement('script');
      script.id = 'kw-marca-script';
      script.src = '/assets/js/kw-marca-perfil.js?v=20261003b';
      document.head.appendChild(script);
    }
    if (document.documentElement.classList.contains('kw-auth-ok')) cargarPersonalizacion();
    else window.addEventListener('kw-auth-ready', cargarPersonalizacion, { once: true });
    window.addEventListener('kw-marca-actualizada', cargarUsuario);
    if (document.documentElement.classList.contains('kw-auth-ok')) cargarUsuario();
    else window.addEventListener('kw-auth-ready', cargarUsuario, { once: true });
  }
})();
