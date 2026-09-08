(function (global) {
  'use strict';

  var PX_MM = 25.4 / 96;

  function numero(valor, respaldo) {
    var n = parseFloat(valor);
    return isFinite(n) ? n : respaldo;
  }

  function color(css, respaldo) {
    if (!css || css === 'transparent') return respaldo || [0, 0, 0];
    var m = css.match(/rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    if (/^#[0-9a-f]{6}$/i.test(css)) {
      return [parseInt(css.slice(1, 3), 16), parseInt(css.slice(3, 5), 16), parseInt(css.slice(5, 7), 16)];
    }
    return respaldo || [0, 0, 0];
  }

  function esTransparente(css) {
    return !css || css === 'transparent' || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)/i.test(css);
  }

  function relativo(rect, paginaRect, margen) {
    return {
      x: margen.left + (rect.left - paginaRect.left) * PX_MM,
      y: margen.top + (rect.top - paginaRect.top) * PX_MM,
      w: rect.width * PX_MM,
      h: rect.height * PX_MM
    };
  }

  function visible(el, estilo) {
    if (!el || !estilo) return false;
    if (estilo.display === 'none' || estilo.visibility === 'hidden' || Number(estilo.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function fondo(pdf, el, estilo, paginaRect, margen) {
    if (esTransparente(estilo.backgroundColor)) return;
    var c = color(estilo.backgroundColor, [255, 255, 255]);
    // El papel ya es blanco; omitir blancos reduce mucho el archivo.
    if (c[0] > 248 && c[1] > 248 && c[2] > 248) return;
    var r = relativo(el.getBoundingClientRect(), paginaRect, margen);
    pdf.setFillColor(c[0], c[1], c[2]);
    pdf.rect(r.x, r.y, r.w, r.h, 'F');
  }

  function borde(pdf, el, estilo, paginaRect, margen) {
    var r = relativo(el.getBoundingClientRect(), paginaRect, margen);
    var lados = [
      ['Top', r.x, r.y, r.x + r.w, r.y],
      ['Right', r.x + r.w, r.y, r.x + r.w, r.y + r.h],
      ['Bottom', r.x, r.y + r.h, r.x + r.w, r.y + r.h],
      ['Left', r.x, r.y, r.x, r.y + r.h]
    ];
    lados.forEach(function (lado) {
      var nombre = lado[0];
      var ancho = numero(estilo['border' + nombre + 'Width'], 0);
      var tipo = estilo['border' + nombre + 'Style'];
      if (!ancho || tipo === 'none' || tipo === 'hidden') return;
      var c = color(estilo['border' + nombre + 'Color'], [0, 0, 0]);
      pdf.setDrawColor(c[0], c[1], c[2]);
      pdf.setLineWidth(Math.max(0.1, ancho * PX_MM));
      pdf.line(lado[1], lado[2], lado[3], lado[4]);
    });
  }

  function estiloFuente(estilo) {
    var peso = parseInt(estilo.fontWeight, 10);
    var negrita = estilo.fontWeight === 'bold' || (isFinite(peso) && peso >= 600);
    var cursiva = estilo.fontStyle === 'italic' || estilo.fontStyle === 'oblique';
    if (negrita && cursiva) return 'bolditalic';
    if (negrita) return 'bold';
    if (cursiva) return 'italic';
    return 'normal';
  }

  function textos(pdf, pagina, paginaRect, margen) {
    var doc = pagina.ownerDocument;
    var walker = doc.createTreeWalker(pagina, doc.defaultView.NodeFilter.SHOW_TEXT);
    var nodo;
    while ((nodo = walker.nextNode())) {
      var padre = nodo.parentElement;
      if (!padre) continue;
      var estilo = doc.defaultView.getComputedStyle(padre);
      if (!visible(padre, estilo)) continue;
      var original = nodo.nodeValue || '';
      var re = /\S+/g;
      var match;
      while ((match = re.exec(original))) {
        var rango = doc.createRange();
        rango.setStart(nodo, match.index);
        rango.setEnd(nodo, match.index + match[0].length);
        var rect = rango.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        var r = relativo(rect, paginaRect, margen);
        var tamanoPx = numero(estilo.fontSize, 13.333);
        var c = color(estilo.color, [0, 0, 0]);
        pdf.setFont('helvetica', estiloFuente(estilo));
        pdf.setFontSize(tamanoPx * 0.75);
        pdf.setTextColor(c[0], c[1], c[2]);
        if (pdf.setCharSpace) {
          var espacio = numero(estilo.letterSpacing, 0);
          pdf.setCharSpace(isFinite(espacio) ? espacio * PX_MM : 0);
        }
        pdf.text(match[0], r.x, r.y + r.h * 0.82, { baseline: 'alphabetic' });
        if ((estilo.textDecorationLine || '').indexOf('underline') !== -1) {
          pdf.setDrawColor(c[0], c[1], c[2]);
          pdf.setLineWidth(0.18);
          pdf.line(r.x, r.y + r.h * 0.93, r.x + r.w, r.y + r.h * 0.93);
        }
      }
    }
    if (pdf.setCharSpace) pdf.setCharSpace(0);
  }

  async function esperarImagenes(doc) {
    var imagenes = Array.prototype.slice.call(doc.images || []);
    await Promise.all(imagenes.map(function (img) {
      if (img.complete && img.naturalWidth) return Promise.resolve();
      return new Promise(function (resolve) {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 2000);
      });
    }));
  }

  function imagenes(pdf, pagina, paginaRect, margen) {
    pagina.querySelectorAll('img').forEach(function (img) {
      if (!img.complete || !img.naturalWidth) return;
      var estilo = pagina.ownerDocument.defaultView.getComputedStyle(img);
      if (!visible(img, estilo)) return;
      var r = relativo(img.getBoundingClientRect(), paginaRect, margen);
      try {
        var formato = /jpe?g/i.test(img.src) ? 'JPEG' : 'PNG';
        pdf.addImage(img, formato, r.x, r.y, r.w, r.h, undefined, 'FAST');
      } catch (e) {
        // Un logo que no cargó nunca debe impedir descargar el contrato.
      }
    });
  }

  async function crear(documento, opciones) {
    var JsPDF = global.jspdf && global.jspdf.jsPDF;
    if (!JsPDF) throw new Error('El generador vectorial de PDF no terminó de cargar.');

    await esperarImagenes(documento);
    var margen = Object.assign({ top: 8, right: 19, bottom: 2.7, left: 19 }, opciones || {});
    var paginas = Array.prototype.slice.call(documento.querySelectorAll('.print-page'));
    if (!paginas.length) paginas = [documento.body];

    var pdf = new JsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'letter',
      compress: true,
      putOnlyUsedFonts: true,
      hotfixes: ['px_scaling']
    });

    paginas.forEach(function (pagina, indice) {
      if (indice) pdf.addPage('letter', 'portrait');
      var paginaRect = pagina.getBoundingClientRect();
      var elementos = [pagina].concat(Array.prototype.slice.call(pagina.querySelectorAll('*')));
      elementos.forEach(function (el) {
        var estilo = documento.defaultView.getComputedStyle(el);
        if (visible(el, estilo)) fondo(pdf, el, estilo, paginaRect, margen);
      });
      elementos.forEach(function (el) {
        var estilo = documento.defaultView.getComputedStyle(el);
        if (visible(el, estilo)) borde(pdf, el, estilo, paginaRect, margen);
      });
      imagenes(pdf, pagina, paginaRect, margen);
      textos(pdf, pagina, paginaRect, margen);
    });

    return pdf;
  }

  async function generar(documento, opciones) {
    var pdf = await crear(documento, opciones);
    return pdf.output('blob');
  }

  async function descargar(documento, nombre, opciones) {
    var pdf = await crear(documento, opciones);
    pdf.save(nombre);
  }

  global.kwPDFVector = { crear: crear, generar: generar, descargar: descargar };
})(window);
