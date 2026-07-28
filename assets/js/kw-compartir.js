// Hoja de "Compartir" reutilizable.
//
// Abre una ventana con el enlace, los botones de cada red y el código QR
// (que genera kw-qr.js con la identidad de KW). Se usa en el perfil
// público y en "Mi Perfil", pero sirve para compartir cualquier enlace.
//
// Uso:
//   kwCompartir({
//     url: 'https://…/micrositio.html?id=…',
//     titulo: 'Ana López',
//     texto: 'Conoce el perfil de Ana López en KW Premier',
//     archivo: 'ana-lopez'          // nombre del PNG del QR
//   });
//
// Requiere que la página incluya antes kw-qr.js.

(function (global) {
  'use strict';

  var ESTILOS = [
    '.kwc-fondo{position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;',
    'align-items:center;justify-content:center;z-index:9000;padding:20px;',
    'opacity:0;transition:opacity .16s ease}',
    '.kwc-fondo.abierto{opacity:1}',
    '.kwc-caja{background:#fff;border-radius:20px;width:100%;max-width:390px;',
    'padding:22px 20px 20px;box-shadow:0 18px 50px rgba(0,0,0,0.28);',
    'transform:translateY(10px) scale(0.98);transition:transform .16s ease;',
    'max-height:calc(100vh - 40px);overflow-y:auto}',
    '.kwc-fondo.abierto .kwc-caja{transform:none}',
    '.kwc-top{display:flex;align-items:center;gap:10px;margin-bottom:16px}',
    '.kwc-titulo{font-size:16px;font-weight:700;flex:1;color:#1a1a1a}',
    '.kwc-icono-btn{width:30px;height:30px;border:none;background:#f2f2f1;',
    'border-radius:50%;cursor:pointer;color:#555;display:flex;align-items:center;',
    'justify-content:center;flex-shrink:0;transition:background .15s,transform .12s}',
    '.kwc-icono-btn:hover{background:#e6e6e5}',
    '.kwc-icono-btn:active{transform:scale(0.9)}',
    '.kwc-icono-btn svg{width:15px;height:15px}',
    '.kwc-enlace{display:flex;gap:8px;margin-bottom:18px}',
    '.kwc-enlace input{flex:1;min-width:0;border:1.5px solid #e3e3e1;border-radius:11px;',
    'padding:10px 12px;font-size:12.5px;color:#555;background:#fafafa;font-family:inherit}',
    '.kwc-copiar{border:none;border-radius:11px;padding:10px 15px;font-size:13px;',
    'font-weight:700;cursor:pointer;color:#fff;flex-shrink:0;font-family:inherit;',
    'background:linear-gradient(180deg,#e81010 0%,#CC0000 100%);',
    'box-shadow:0 1px 0 rgba(255,255,255,0.25) inset,0 3px 10px rgba(204,0,0,0.28);',
    'transition:filter .15s,transform .12s}',
    '.kwc-copiar:hover{filter:brightness(1.07)}',
    '.kwc-copiar:active{transform:translateY(1px) scale(0.97)}',
    '.kwc-opciones{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}',
    '.kwc-op{border:1.5px solid #ececeb;background:#fff;border-radius:14px;',
    'padding:13px 6px 10px;cursor:pointer;display:flex;flex-direction:column;',
    'align-items:center;gap:7px;font-family:inherit;font-size:11.5px;font-weight:600;',
    'color:#3a3a3a;transition:border-color .15s,background .15s,transform .12s}',
    '.kwc-op:hover{background:#fafafa;border-color:#dcdcda}',
    '.kwc-op:active{transform:scale(0.95)}',
    '.kwc-op .kwc-circ{width:36px;height:36px;border-radius:50%;display:flex;',
    'align-items:center;justify-content:center;color:#fff}',
    '.kwc-op svg{width:17px;height:17px;fill:currentColor}',
    '.kwc-nota{font-size:11.5px;color:#8a8a88;text-align:center;margin-top:14px;line-height:1.5}',
    '.kwc-qr-caja{text-align:center}',
    // Cuanto más grande se vea en pantalla, más fácil lo lee la cámara
    // de otro celular, que es como se comparte de persona a persona.
    '.kwc-qr{width:100%;max-width:340px;margin:0 auto 14px;display:block}',
    '.kwc-qr svg{width:100%;height:auto;display:block}',
    '.kwc-acciones{display:flex;gap:9px}',
    '.kwc-acciones button{flex:1;border-radius:12px;padding:11px;font-size:13px;',
    'font-weight:700;cursor:pointer;font-family:inherit;transition:filter .15s,transform .12s}',
    '.kwc-acciones button:active{transform:translateY(1px) scale(0.97)}',
    '.kwc-sec{border:1.5px solid #e3e3e1;background:#fff;color:#3a3a3a}',
    '.kwc-sec:hover{background:#fafafa}',
    '.kwc-pri{border:none;color:#fff;background:linear-gradient(180deg,#e81010 0%,#CC0000 100%);',
    'box-shadow:0 1px 0 rgba(255,255,255,0.25) inset,0 3px 10px rgba(204,0,0,0.28)}',
    '.kwc-pri:hover{filter:brightness(1.07)}',
    '.kwc-aviso{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);',
    'background:#1a1a1a;color:#fff;padding:11px 20px;border-radius:30px;font-size:13px;',
    'font-weight:600;z-index:9100;box-shadow:0 8px 24px rgba(0,0,0,0.3);',
    'opacity:0;transition:opacity .2s}',
    '.kwc-aviso.visible{opacity:1}',
    '@media (max-width:400px){.kwc-opciones{gap:7px}.kwc-op{font-size:11px;padding:11px 4px 9px}}',
  ].join('');

  var ICONOS = {
    whatsapp: '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>',
    correo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
    facebook: '<svg viewBox="0 0 24 24"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.514c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>',
    qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z"/></svg>',
    mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    atras: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>',
  };

  function escapar(t) {
    var d = document.createElement('div');
    d.textContent = t == null ? '' : t;
    return d.innerHTML;
  }

  function aviso(texto) {
    var el = document.createElement('div');
    el.className = 'kwc-aviso';
    el.textContent = texto;
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('visible'); });
    setTimeout(function () {
      el.classList.remove('visible');
      setTimeout(function () { el.remove(); }, 250);
    }, 2200);
  }

  // Copiar al portapapeles. En navegadores viejos, o si la página no va
  // por https, la API moderna no existe: ahí se cae al método de toda la
  // vida con un campo de texto oculto.
  function copiar(texto) {
    if (navigator.clipboard && global.isSecureContext) {
      return navigator.clipboard.writeText(texto);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      ok ? resolve() : reject(new Error('No se pudo copiar.'));
    });
  }

  function inyectarEstilos() {
    if (document.getElementById('kwc-estilos')) return;
    var s = document.createElement('style');
    s.id = 'kwc-estilos';
    s.textContent = ESTILOS;
    document.head.appendChild(s);
  }

  function abrir(op) {
    if (!op || !op.url) return;
    inyectarEstilos();

    var url = op.url;
    var titulo = op.titulo || document.title;
    var texto = op.texto || titulo;
    var archivo = op.archivo || 'kw-premier';

    var fondo = document.createElement('div');
    fondo.className = 'kwc-fondo';
    fondo.innerHTML = '<div class="kwc-caja" role="dialog" aria-modal="true"></div>';
    var caja = fondo.firstChild;

    function cerrar() {
      fondo.classList.remove('abierto');
      document.removeEventListener('keydown', alTeclado);
      setTimeout(function () { fondo.remove(); }, 180);
    }
    function alTeclado(e) { if (e.key === 'Escape') cerrar(); }

    fondo.addEventListener('click', function (e) { if (e.target === fondo) cerrar(); });
    document.addEventListener('keydown', alTeclado);

    // ── Pantalla principal ──
    function vistaOpciones() {
      caja.innerHTML =
        '<div class="kwc-top">' +
          '<div class="kwc-titulo">Compartir perfil</div>' +
          '<button class="kwc-icono-btn" data-accion="cerrar" aria-label="Cerrar">' + ICONOS.cerrar + '</button>' +
        '</div>' +
        '<div class="kwc-enlace">' +
          '<input type="text" readonly value="' + escapar(url) + '" aria-label="Enlace del perfil" />' +
          '<button class="kwc-copiar" data-accion="copiar">Copiar</button>' +
        '</div>' +
        '<div class="kwc-opciones">' +
          op1('whatsapp', 'WhatsApp', '#25D366') +
          op1('correo', 'Correo', '#6b7280') +
          op1('facebook', 'Facebook', '#1877F2') +
          op1('instagram', 'Instagram', '#C13584') +
          op1('qr', 'Código QR', '#CC0000') +
          (navigator.share ? op1('mas', 'Más', '#3a3a3a') : '') +
        '</div>' +
        '<div class="kwc-nota">Quien abra el enlace verá tu perfil, tus datos de contacto y tus redes.</div>';

      caja.querySelectorAll('[data-accion]').forEach(function (b) {
        b.addEventListener('click', function () { ejecutar(b.getAttribute('data-accion')); });
      });
      var input = caja.querySelector('input');
      input.addEventListener('focus', function () { input.select(); });
    }

    function op1(clave, etiqueta, color) {
      return '<button class="kwc-op" data-accion="' + clave + '">' +
        '<span class="kwc-circ" style="background:' + color + '">' + ICONOS[clave] + '</span>' +
        '<span>' + etiqueta + '</span></button>';
    }

    function ejecutar(accion) {
      if (accion === 'cerrar') return cerrar();

      if (accion === 'copiar') {
        return copiar(url).then(function () { aviso('Enlace copiado'); })
                          .catch(function () { aviso('No se pudo copiar'); });
      }
      if (accion === 'whatsapp') {
        return window.open('https://wa.me/?text=' + encodeURIComponent(texto + ' ' + url), '_blank', 'noopener');
      }
      if (accion === 'correo') {
        location.href = 'mailto:?subject=' + encodeURIComponent(titulo) +
                        '&body=' + encodeURIComponent(texto + '\n\n' + url);
        return;
      }
      if (accion === 'facebook') {
        return window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url),
                           '_blank', 'noopener,width=620,height=560');
      }
      if (accion === 'instagram') {
        // Instagram no deja mandar enlaces desde fuera de su app, así que
        // lo copiamos y abrimos Instagram para pegarlo en la historia o
        // en la biografía.
        return copiar(url).then(function () {
          aviso('Enlace copiado — pégalo en tu historia o bio');
          setTimeout(function () { window.open('https://www.instagram.com/', '_blank', 'noopener'); }, 700);
        }).catch(function () { aviso('No se pudo copiar'); });
      }
      if (accion === 'mas') {
        return navigator.share({ title: titulo, text: texto, url: url }).catch(function () {});
      }
      if (accion === 'qr') return vistaQR();
    }

    // ── Pantalla del código QR ──
    function vistaQR() {
      if (!global.kwQR) { aviso('No se pudo generar el código QR'); return; }
      var codigo;
      try {
        codigo = global.kwQR.svg(url);
      } catch (e) {
        aviso('No se pudo generar el código QR');
        return;
      }
      caja.innerHTML =
        '<div class="kwc-top">' +
          '<button class="kwc-icono-btn" data-qr="atras" aria-label="Volver">' + ICONOS.atras + '</button>' +
          '<div class="kwc-titulo">Código QR</div>' +
          '<button class="kwc-icono-btn" data-qr="cerrar" aria-label="Cerrar">' + ICONOS.cerrar + '</button>' +
        '</div>' +
        '<div class="kwc-qr-caja">' +
          '<div class="kwc-qr">' + codigo + '</div>' +
          '<div class="kwc-acciones">' +
            '<button class="kwc-sec" data-qr="descargar">Descargar</button>' +
            (navigator.share ? '<button class="kwc-pri" data-qr="compartir">Compartir</button>'
                             : '<button class="kwc-pri" data-qr="copiar">Copiar enlace</button>') +
          '</div>' +
          '<div class="kwc-nota">Imprímelo en tu tarjeta, en un anuncio o compártelo:' +
          ' con la cámara del celular llega directo a tu perfil.</div>' +
        '</div>';

      caja.querySelectorAll('[data-qr]').forEach(function (b) {
        b.addEventListener('click', function () { accionQR(b.getAttribute('data-qr'), b); });
      });
    }

    async function accionQR(accion, boton) {
      if (accion === 'cerrar') return cerrar();
      if (accion === 'atras') return vistaOpciones();
      if (accion === 'copiar') {
        return copiar(url).then(function () { aviso('Enlace copiado'); })
                          .catch(function () { aviso('No se pudo copiar'); });
      }

      boton.disabled = true;
      try {
        if (accion === 'descargar') {
          await global.kwQR.descargar(url, 'qr-' + archivo);
          aviso('Código QR descargado');
        } else if (accion === 'compartir') {
          var blob = await global.kwQR.png(url, 900);
          var img = new File([blob], 'qr-' + archivo + '.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [img] })) {
            await navigator.share({ files: [img], title: titulo, text: texto });
          } else {
            await navigator.share({ title: titulo, text: texto, url: url });
          }
        }
      } catch (e) {
        // Cancelar el diálogo del sistema no es un error que valga avisar
        if (!e || e.name !== 'AbortError') aviso('No se pudo completar');
      } finally {
        boton.disabled = false;
      }
    }

    vistaOpciones();
    document.body.appendChild(fondo);
    requestAnimationFrame(function () { fondo.classList.add('abierto'); });
  }

  global.kwCompartir = abrir;
})(window);
