/* ─────────────────────────────────────────────────────────────
   Menú de tres puntos para las tarjetas de documentos.

   Se le pega solo a las tarjetas que ya existen (`a.card` dentro de un
   `.grid`), sin tocar el HTML de cada página: las envuelve en un
   contenedor y le cuelga el botón al lado del enlace. Se hace así, y no
   metiendo el botón dentro de la tarjeta, porque la tarjeta es un <a> y
   un botón dentro de un enlace es HTML inválido — además de que el clic
   navegaría en vez de abrir el menú.

   Dos opciones:

   · Compartir — la ve cualquiera. En celular usa el compartir del
     sistema; en escritorio copia la liga.

   · Hacer visible para — solo Staff/Admin/Master, y solo en tarjetas
     que traigan data-doc-id (o sea, documentos internos registrados en
     la base). Cambia en qué carpetas de rol aparece el documento.

   Uso: incluir el script y llamar a window.kwDocMenu.init(). Si la
   página no tiene sesión de Supabase, el menú igual funciona con puro
   Compartir.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var ROLES_CACHE = null;
  var puedeEditar = false;
  var menuAbierto = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── Estilos ──
  function inyectarEstilos() {
    if (document.getElementById('kw-doc-menu-estilos')) return;
    var s = document.createElement('style');
    s.id = 'kw-doc-menu-estilos';
    s.textContent = [
      '.doc-wrap { position: relative; display: flex; }',
      '.doc-wrap > .card { flex: 1; min-width: 0; }',
      /* Chip blanco fijo: la tarjeta se pone roja al pasar el mouse, y un
         chip claro con puntos oscuros se lee bien sobre los dos fondos,
         así no hace falta cambiarle el color según el hover. */
      '.doc-menu-btn { position: absolute; top: 10px; right: 10px; width: 30px; height: 30px;',
      '  border: 1px solid var(--border, #e5e5e5); border-radius: 8px; background: #fff;',
      '  display: flex; align-items: center; justify-content: center; cursor: pointer;',
      '  color: #666; padding: 0; z-index: 3; box-shadow: 0 1px 3px rgba(0,0,0,.08);',
      '  transition: background .15s, color .15s; }',
      '.doc-menu-btn:hover { background: #f2f2f2; color: #111; }',
      '.doc-menu-btn svg { width: 15px; height: 15px; pointer-events: none; }',

      '.doc-menu { position: absolute; top: 44px; right: 10px; min-width: 208px; background: #fff;',
      '  border: 1px solid var(--border, #e5e5e5); border-radius: 11px; box-shadow: 0 12px 32px rgba(0,0,0,.14);',
      '  z-index: 20; overflow: hidden; padding: 5px; }',
      '.doc-menu button { display: flex; align-items: center; gap: 9px; width: 100%; border: none;',
      '  background: none; font-family: inherit; font-size: 13.5px; color: var(--text, #111);',
      '  padding: 9px 10px; border-radius: 8px; cursor: pointer; text-align: left; }',
      '.doc-menu button:hover { background: #f5f5f5; }',
      '.doc-menu button svg { width: 15px; height: 15px; flex-shrink: 0; color: #666; }',

      '.doc-toast { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%) translateY(10px);',
      '  background: #111; color: #fff; font-size: 13.5px; padding: 11px 18px; border-radius: 10px;',
      '  z-index: 900; opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; }',
      '.doc-toast.ver { opacity: 1; transform: translateX(-50%) translateY(0); }',

      '.doc-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.42); z-index: 800;',
      '  display: flex; align-items: center; justify-content: center; padding: 20px;',
      '  opacity: 0; pointer-events: none; transition: opacity .2s; }',
      '.doc-modal-bg.ver { opacity: 1; pointer-events: auto; }',
      '.doc-modal { background: #fff; border-radius: 15px; width: 100%; max-width: 400px;',
      '  transform: translateY(12px); transition: transform .2s; overflow: hidden; }',
      '.doc-modal-bg.ver .doc-modal { transform: none; }',
      '.doc-modal-cab { padding: 18px 20px 12px; border-bottom: 1px solid var(--border, #e5e5e5); }',
      '.doc-modal-tit { font-size: 16px; font-weight: 700; }',
      '.doc-modal-sub { font-size: 12.5px; color: var(--muted, #777); margin-top: 3px; }',
      '.doc-modal-cuerpo { padding: 12px 14px; max-height: 52vh; overflow-y: auto; }',
      '.doc-rol { display: flex; align-items: flex-start; gap: 11px; padding: 10px; border-radius: 9px; cursor: pointer; }',
      '.doc-rol:hover { background: #f7f7f7; }',
      '.doc-rol input { width: 17px; height: 17px; margin: 1px 0 0; accent-color: #CC0000; cursor: pointer; flex-shrink: 0; }',
      '.doc-rol-nom { font-size: 13.5px; font-weight: 600; }',
      '.doc-rol-desc { font-size: 11.5px; color: var(--muted, #777); margin-top: 1px; }',
      '.doc-modal-pie { display: flex; gap: 9px; justify-content: flex-end; padding: 13px 18px;',
      '  border-top: 1px solid var(--border, #e5e5e5); }',
      '.doc-btn { height: 38px; padding: 0 16px; border-radius: 9px; font-family: inherit; font-size: 13.5px;',
      '  font-weight: 600; cursor: pointer; border: 1.5px solid var(--border, #e5e5e5); background: #fff; color: var(--text, #111); }',
      '.doc-btn:hover { background: #f5f5f5; }',
      '.doc-btn.ok { background: #CC0000; border-color: #CC0000; color: #fff; }',
      '.doc-btn.ok:hover { background: #b30000; }',
      '.doc-btn:disabled { opacity: .55; cursor: default; }',
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Avisos ──
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'doc-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('ver'); });
    setTimeout(function () {
      t.classList.remove('ver');
      setTimeout(function () { t.remove(); }, 250);
    }, 2200);
  }

  // ── Compartir ──
  async function compartir(url, titulo) {
    // En celular conviene el compartir del sistema (WhatsApp, correo…);
    // en escritorio casi siempre lo que se quiere es la liga pegada.
    if (navigator.share && matchMedia('(max-width: 820px)').matches) {
      try {
        await navigator.share({ title: titulo, url: url });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // lo canceló, no es error
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Liga copiada');
    } catch (e) {
      // clipboard falla sin https o sin permiso: se deja seleccionada
      // para que se copie a mano en vez de quedarse sin nada.
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999;width:80%;padding:10px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      toast(ok ? 'Liga copiada' : 'No se pudo copiar automáticamente');
    }
  }

  // ── Visibilidad por rol ──
  async function cargarRoles() {
    if (ROLES_CACHE) return ROLES_CACHE;
    var r = await window.kwSupabase
      .from('roles_kw').select('id, nombre, descripcion').eq('activo', true).order('orden');
    if (r.error) throw r.error;
    ROLES_CACHE = r.data || [];
    return ROLES_CACHE;
  }

  async function abrirVisibilidad(docId, titulo) {
    var bg = document.createElement('div');
    bg.className = 'doc-modal-bg';
    bg.innerHTML =
      '<div class="doc-modal">' +
        '<div class="doc-modal-cab">' +
          '<div class="doc-modal-tit">Hacer visible para</div>' +
          '<div class="doc-modal-sub">' + esc(titulo) + '</div>' +
        '</div>' +
        '<div class="doc-modal-cuerpo"><div style="padding:18px;color:#777;font-size:13px">Cargando…</div></div>' +
        '<div class="doc-modal-pie">' +
          '<button type="button" class="doc-btn" data-cancelar>Cancelar</button>' +
          '<button type="button" class="doc-btn ok" data-guardar disabled>Guardar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bg);
    requestAnimationFrame(function () { bg.classList.add('ver'); });

    function cerrar() {
      bg.classList.remove('ver');
      setTimeout(function () { bg.remove(); }, 220);
    }
    bg.addEventListener('click', function (e) { if (e.target === bg) cerrar(); });
    bg.querySelector('[data-cancelar]').addEventListener('click', cerrar);

    try {
      var roles = await cargarRoles();
      var doc = await window.kwSupabase
        .from('documentos_internos').select('roles').eq('id', docId).single();
      if (doc.error) throw doc.error;
      var actuales = doc.data.roles || [];

      bg.querySelector('.doc-modal-cuerpo').innerHTML = roles.map(function (r) {
        return '<label class="doc-rol">' +
          '<input type="checkbox" value="' + esc(r.id) + '"' +
            (actuales.indexOf(r.id) >= 0 ? ' checked' : '') + ' />' +
          '<span><span class="doc-rol-nom">' + esc(r.id) + ' · ' + esc(r.nombre) + '</span>' +
          (r.descripcion ? '<span class="doc-rol-desc">' + esc(r.descripcion) + '</span>' : '') +
          '</span></label>';
      }).join('');

      var btn = bg.querySelector('[data-guardar]');
      btn.disabled = false;
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        btn.textContent = 'Guardando…';
        var elegidos = Array.prototype.map.call(
          bg.querySelectorAll('.doc-modal-cuerpo input:checked'), function (c) { return c.value; }
        );
        try {
          var up = await window.kwSupabase
            .from('documentos_internos').update({ roles: elegidos }).eq('id', docId);
          if (up.error) throw up.error;
          cerrar();
          toast(elegidos.length ? 'Visible para ' + elegidos.join(', ') : 'Ya no aparece en ninguna carpeta');
          // La pantalla que lista documentos se entera para volver a
          // pintar: el documento puede salirse de la carpeta abierta.
          window.dispatchEvent(new CustomEvent('kw-doc-visibilidad', { detail: { id: docId, roles: elegidos } }));
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Guardar';
          toast('No se pudo guardar: ' + (err.message || err));
        }
      });
    } catch (err) {
      bg.querySelector('.doc-modal-cuerpo').innerHTML =
        '<div style="padding:18px;color:#b00;font-size:13px">No se pudo cargar: ' + esc(err.message || err) + '</div>';
    }
  }

  // ── Menú ──
  function cerrarMenu() {
    if (menuAbierto) { menuAbierto.remove(); menuAbierto = null; }
  }

  function abrirMenu(wrap, datos) {
    cerrarMenu();
    var m = document.createElement('div');
    m.className = 'doc-menu';

    var svgCompartir = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>';
    var svgOjo = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';

    var html = '<button type="button" data-accion="compartir">' + svgCompartir + 'Compartir</button>';
    if (puedeEditar && datos.docId) {
      html += '<button type="button" data-accion="visibilidad">' + svgOjo + 'Hacer visible para…</button>';
    }
    m.innerHTML = html;

    m.querySelector('[data-accion="compartir"]').addEventListener('click', function () {
      cerrarMenu();
      compartir(datos.url, datos.titulo);
    });
    var bv = m.querySelector('[data-accion="visibilidad"]');
    if (bv) {
      bv.addEventListener('click', function () {
        cerrarMenu();
        abrirVisibilidad(datos.docId, datos.titulo);
      });
    }

    wrap.appendChild(m);
    menuAbierto = m;
  }

  // ── Enganche ──
  function montar(raiz) {
    var tarjetas = (raiz || document).querySelectorAll('a.card:not([data-doc-menu])');
    Array.prototype.forEach.call(tarjetas, function (card) {
      card.setAttribute('data-doc-menu', '1');

      var wrap = document.createElement('div');
      wrap.className = 'doc-wrap';
      card.parentNode.insertBefore(wrap, card);
      wrap.appendChild(card);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'doc-menu-btn';
      btn.setAttribute('aria-label', 'Opciones del documento');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (menuAbierto && menuAbierto.parentNode === wrap) { cerrarMenu(); return; }
        var tituloEl = card.querySelector('.card-title');
        abrirMenu(wrap, {
          url: card.href,
          titulo: tituloEl ? tituloEl.textContent.trim() : document.title,
          docId: card.getAttribute('data-doc-id'),
        });
      });

      wrap.appendChild(btn);
    });
  }

  document.addEventListener('click', function (e) {
    if (menuAbierto && !menuAbierto.contains(e.target) && !e.target.closest('.doc-menu-btn')) cerrarMenu();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarMenu(); });

  async function init(raiz) {
    inyectarEstilos();

    // Quién puede editar visibilidad. Es solo para decidir si se pinta la
    // opción: el candado de verdad está en las políticas RLS de la tabla,
    // así que aunque alguien fuerce el botón, la escritura se rechaza.
    try {
      if (window.kwSupabase) {
        var u = await window.kwSupabase.auth.getUser();
        if (u.data && u.data.user) {
          var p = await window.kwSupabase
            .from('profiles').select('role').eq('id', u.data.user.id).single();
          var rol = p.data ? p.data.role : null;
          puedeEditar = ['master', 'admin', 'staff'].indexOf(rol) >= 0;
        }
      }
    } catch (e) {
      puedeEditar = false;
    }

    montar(raiz);
  }

  window.kwDocMenu = { init: init, montar: montar, compartir: compartir };
})();
