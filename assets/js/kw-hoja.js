// Dibuja la hoja de un documento a partir de sus bloques.
//
// Lo usan dos pantallas: el creador de formatos (para la vista previa) y
// la de llenado (para lo que ve e imprime el asesor). Al ser el mismo
// dibujante, lo que se arma es idéntico a lo que después sale.
//
// El logo y los márgenes van fijos: eso no se configura, para que todos
// los documentos de la oficina salgan parejos.
//
//   kwHoja.html(bloques, valores, opciones)  -> string con la hoja
//   kwHoja.campos(bloques)                   -> los campos que hay que llenar
//   kwHoja.estilos()                         -> el CSS de la hoja
//
// Tipos de bloque: titulo, texto, campo, tabla, casilla, firma, salto.
// Ver supabase/sql/031_plantillas_documentos.sql para la forma de cada uno.

(function (global) {
  'use strict';

  var LOGO = '/assets/img/logo-kw-premier.png';

  var ESTILOS = [
    '.hoja{background:#fff;width:21.6cm;min-height:27.9cm;padding:1.6cm 1.9cm;',
    'margin:0 auto;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;',
    'font-size:10pt;line-height:1.55;color:#000;box-shadow:0 2px 14px rgba(0,0,0,0.12)}',
    '.hoja + .hoja{margin-top:20px}',
    '.hoja-logo{margin-bottom:14px}',
    '.hoja-logo img{height:42px;width:auto;display:block}',
    '.h-titulo{font-size:13pt;font-weight:700;margin:10px 0 14px;line-height:1.3}',
    '.h-titulo.centro{text-align:center}',
    '.h-titulo.izquierda{text-align:left}',
    '.h-texto{margin:0 0 9px;text-align:justify;white-space:pre-line}',
    '.h-campo{margin:0 0 9px}',
    '.h-campo-linea{display:flex;align-items:baseline;gap:8px}',
    '.h-campo-etiqueta{font-weight:700;white-space:nowrap}',
    '.h-campo-valor{flex:1;border-bottom:1px solid #000;min-height:15px;padding:0 3px 1px}',
    '.h-campo.parrafo .h-campo-valor{border:1px solid #000;min-height:52px;padding:5px;',
    'white-space:pre-line;flex:none;display:block;width:100%}',
    '.h-campo.parrafo .h-campo-linea{display:block}',
    '.h-campo.parrafo .h-campo-etiqueta{display:block;margin-bottom:3px}',
    '.h-tabla{width:100%;border-collapse:collapse;margin:0 0 11px;font-size:9.5pt}',
    '.h-tabla th,.h-tabla td{border:1px solid #000;padding:5px 7px;text-align:left;vertical-align:top}',
    '.h-tabla th{background:#f0f0f0;font-weight:700}',
    '.h-casilla{display:flex;align-items:flex-start;gap:8px;margin:0 0 7px}',
    '.h-casilla-caja{width:12px;height:12px;border:1.4px solid #000;flex-shrink:0;',
    'margin-top:2px;display:flex;align-items:center;justify-content:center;',
    'font-size:10px;font-weight:700;line-height:1}',
    '.h-firmas{display:grid;grid-template-columns:1fr 1fr;gap:26px 40px;margin-top:44px}',
    '.h-firma{text-align:center}',
    '.h-firma-espacio{height:46px}',
    '.h-firma-linea{border-top:1px solid #000;padding-top:4px;font-size:9pt}',
    '.h-vacia{color:#999;text-align:center;padding:60px 20px;font-size:11pt}',
    '@media (max-width:760px){.hoja{width:100%;min-height:0;padding:20px 16px;font-size:11px}',
    '.hoja-logo img{height:30px}.h-titulo{font-size:14px}.h-firmas{gap:18px 20px}}',
  ].join('');

  function escapar(t) {
    return String(t === null || t === undefined ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatear(valor, formato) {
    if (valor === null || valor === undefined || valor === '') return '';
    if (formato === 'moneda') {
      var n = Number(String(valor).replace(/[^\d.-]/g, ''));
      if (isFinite(n)) return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 });
    }
    if (formato === 'fecha') {
      var d = new Date(valor + 'T12:00:00');
      if (!isNaN(d)) {
        return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
      }
    }
    return String(valor);
  }

  // Cambia {{clave}} por lo que se haya capturado. Se escapa primero y se
  // sustituye después, para que un valor con < o & no rompa la hoja.
  function conValores(texto, valores, mapaFormato) {
    return escapar(texto).replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, function (_, clave) {
      var v = valores ? valores[clave] : '';
      return escapar(formatear(v, mapaFormato && mapaFormato[clave]));
    });
  }

  function mapaDeFormatos(bloques) {
    var m = {};
    (bloques || []).forEach(function (b) {
      if (b && b.tipo === 'campo' && b.clave) m[b.clave] = b.formato || 'texto';
    });
    return m;
  }

  // Los campos que el asesor tiene que llenar, en el orden en que salen.
  function campos(bloques) {
    var lista = [];
    var vistos = {};
    (bloques || []).forEach(function (b) {
      if (!b || !b.clave || vistos[b.clave]) return;
      if (b.tipo === 'campo') {
        vistos[b.clave] = true;
        lista.push({ clave: b.clave, etiqueta: b.etiqueta || b.clave, formato: b.formato || 'texto' });
      } else if (b.tipo === 'casilla') {
        vistos[b.clave] = true;
        lista.push({ clave: b.clave, etiqueta: b.etiqueta || b.clave, formato: 'casilla' });
      }
    });
    return lista;
  }

  function bloqueHtml(b, valores, formatos) {
    if (!b || !b.tipo) return '';

    if (b.tipo === 'titulo') {
      var al = b.alineacion === 'izquierda' ? 'izquierda' : 'centro';
      return '<div class="h-titulo ' + al + '">' + conValores(b.texto, valores, formatos) + '</div>';
    }

    if (b.tipo === 'texto') {
      return '<p class="h-texto">' + conValores(b.texto, valores, formatos) + '</p>';
    }

    if (b.tipo === 'campo') {
      var v = valores ? valores[b.clave] : '';
      var clase = 'h-campo' + (b.formato === 'parrafo' ? ' parrafo' : '');
      return '<div class="' + clase + '"><div class="h-campo-linea">' +
        '<span class="h-campo-etiqueta">' + escapar(b.etiqueta || '') + ':</span>' +
        '<span class="h-campo-valor">' + escapar(formatear(v, b.formato)) + '</span>' +
        '</div></div>';
    }

    if (b.tipo === 'tabla') {
      var cols = Array.isArray(b.columnas) ? b.columnas : [];
      var filas = Array.isArray(b.filas) ? b.filas : [];
      if (!cols.length) return '';
      return '<table class="h-tabla"><thead><tr>' +
        cols.map(function (c) { return '<th>' + escapar(c) + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
        (filas.length ? filas : [cols.map(function () { return ''; })]).map(function (f) {
          return '<tr>' + cols.map(function (_, i) {
            return '<td>' + conValores((f && f[i]) || '', valores, formatos) + '</td>';
          }).join('') + '</tr>';
        }).join('') +
        '</tbody></table>';
    }

    if (b.tipo === 'casilla') {
      var marcada = valores && (valores[b.clave] === true || valores[b.clave] === 'si');
      return '<div class="h-casilla"><span class="h-casilla-caja">' +
        (marcada ? '&#10003;' : '') + '</span>' +
        '<span>' + conValores(b.etiqueta, valores, formatos) + '</span></div>';
    }

    if (b.tipo === 'firma') {
      return '<div class="h-firma"><div class="h-firma-espacio"></div>' +
        '<div class="h-firma-linea">' + escapar(b.etiqueta || '') + '</div></div>';
    }

    return '';
  }

  // Las firmas seguidas se acomodan de dos en dos; por eso se juntan antes
  // de dibujar, en vez de dejar cada una suelta.
  function agrupar(bloques) {
    var grupos = [];
    var firmas = null;
    (bloques || []).forEach(function (b) {
      if (b && b.tipo === 'firma') {
        if (!firmas) { firmas = []; grupos.push({ tipo: '_firmas', lista: firmas }); }
        firmas.push(b);
      } else {
        firmas = null;
        grupos.push(b);
      }
    });
    return grupos;
  }

  function html(bloques, valores, opciones) {
    var o = opciones || {};
    var formatos = mapaDeFormatos(bloques);
    var paginas = [[]];

    agrupar(bloques).forEach(function (b) {
      if (b && b.tipo === 'salto') { paginas.push([]); return; }
      paginas[paginas.length - 1].push(b);
    });

    return paginas.map(function (grupos, iPagina) {
      var cuerpo = grupos.map(function (g) {
        if (g && g.tipo === '_firmas') {
          return '<div class="h-firmas">' +
            g.lista.map(function (f) { return bloqueHtml(f, valores, formatos); }).join('') +
            '</div>';
        }
        return bloqueHtml(g, valores, formatos);
      }).join('');

      if (!cuerpo && paginas.length === 1) {
        cuerpo = '<div class="h-vacia">' +
          (o.mensajeVacio || 'Agrega bloques para ver aquí cómo va quedando la hoja.') +
          '</div>';
      }

      // El logo va en todas las hojas, como en los formatos de siempre.
      return '<div class="hoja" data-pagina="' + (iPagina + 1) + '">' +
        '<div class="hoja-logo"><img src="' + LOGO + '" alt="KW Premier" /></div>' +
        cuerpo +
      '</div>';
    }).join('');
  }

  global.kwHoja = { html: html, campos: campos, estilos: function () { return ESTILOS; }, LOGO: LOGO };
})(window);
