(function (global) {
  'use strict';

  var ANCHO = 1600;
  var ALTO = 2070;
  var COLORES = {
    rojo: '#cc0000',
    rojoOscuro: '#8a0000',
    texto: '#302c2c',
    gris: '#66615f',
    fondo: '#f0f0ef',
    linea: '#d7d3d1',
    blanco: '#ffffff'
  };
  var estilosInstalados = false;
  var jsPdfPromesa = null;

  var ESTILOS = [
    '.kw-ficha-overlay{position:fixed;inset:0;z-index:9500;padding:18px;background:rgba(28,24,24,.56);',
    'display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .18s ease}',
    '.kw-ficha-overlay.abierto{opacity:1}',
    '.kw-ficha-dialog{width:min(100%,520px);max-height:calc(100vh - 36px);overflow:auto;',
    'background:#fff;border-radius:20px;padding:18px;box-shadow:0 20px 55px rgba(0,0,0,.28);',
    'transform:translateY(10px) scale(.98);transition:transform .18s ease}',
    '.kw-ficha-overlay.abierto .kw-ficha-dialog{transform:none}',
    '.kw-ficha-top{display:flex;align-items:center;gap:10px;margin-bottom:13px}',
    '.kw-ficha-titulo{flex:1;color:#302c2c;font-size:16px;font-weight:700}',
    '.kw-ficha-cerrar{width:34px;height:34px;border:0;border-radius:50%;background:#f2f1f0;',
    'color:#555;display:flex;align-items:center;justify-content:center;cursor:pointer}',
    '.kw-ficha-cerrar:hover{background:#e8e5e3;color:#8a0000}',
    '.kw-ficha-cerrar:focus-visible{outline:2px solid #cc0000;outline-offset:2px}',
    '.kw-ficha-cerrar svg{width:17px;height:17px}',
    '.kw-ficha-vista{padding:10px;border-radius:15px;background:#f2f1f0;min-height:220px;',
    'display:flex;align-items:center;justify-content:center}',
    '.kw-ficha-canvas{display:block;width:100%;height:auto;border-radius:7px;box-shadow:0 5px 18px rgba(38,30,30,.18)}',
    '.kw-ficha-cargando{color:#777;font-size:12px;text-align:center;padding:70px 20px}',
    '.kw-ficha-estado{min-height:18px;margin:11px 2px 8px;color:#777;font-size:11.5px;text-align:center}',
    '.kw-ficha-botones{display:grid;grid-template-columns:1fr 1fr;gap:9px}',
    '.kw-ficha-boton{min-height:43px;padding:10px 12px;border-radius:11px;font:600 12.5px Poppins,Arial,sans-serif;',
    'cursor:pointer;transition:filter .15s,transform .12s}',
    '.kw-ficha-boton:active{transform:translateY(1px)}',
    '.kw-ficha-boton:disabled{cursor:wait;opacity:.55}',
    '.kw-ficha-boton-png{border:1.5px solid #d9d5d3;background:#fff;color:#302c2c}',
    '.kw-ficha-boton-png:hover:not(:disabled){background:#faf8f7;border-color:#bdb7b4}',
    '.kw-ficha-boton-pdf{border:0;background:#cc0000;color:#fff;box-shadow:0 3px 10px rgba(204,0,0,.22)}',
    '.kw-ficha-boton-pdf:hover:not(:disabled){filter:brightness(1.06)}',
    '@media(max-width:440px){.kw-ficha-overlay{padding:10px}.kw-ficha-dialog{max-height:calc(100vh - 20px);padding:13px}',
    '.kw-ficha-vista{padding:6px}.kw-ficha-boton{font-size:12px}}'
  ].join('');

  function instalarEstilos() {
    if (estilosInstalados || document.getElementById('kw-ficha-estilos')) return;
    var style = document.createElement('style');
    style.id = 'kw-ficha-estilos';
    style.textContent = ESTILOS;
    document.head.appendChild(style);
    estilosInstalados = true;
  }

  function texto(valor, respaldo) {
    return valor === null || valor === undefined || String(valor).trim() === ''
      ? (respaldo || '') : String(valor).trim();
  }

  function numero(valor) {
    var n = Number(valor);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function precio(valor, moneda) {
    if (!numero(valor)) return '';
    try {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency', currency: moneda || 'MXN', maximumFractionDigits: 0
      }).format(valor);
    } catch (error) {
      return '$' + Number(valor).toLocaleString('es-MX');
    }
  }

  function limpiarUrl(url) {
    return texto(url).replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }

  function slug(valor) {
    return texto(valor, 'propiedad').toLocaleLowerCase('es-MX')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'propiedad';
  }

  function nombreAsesor(asesor, propiedad) {
    var nombre = [asesor && asesor.nombre, asesor && asesor.apellido].filter(Boolean).join(' ');
    return texto(nombre, texto(propiedad && propiedad.asesor_nombre, 'KW Premier'));
  }

  function listaCaracteristicas(propiedad) {
    var fuente = Array.isArray(propiedad && propiedad.caracteristicas)
      ? propiedad.caracteristicas : [];
    return fuente.map(function (item) {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') return texto(item.nombre || item.label || item.valor || item.value);
      return '';
    }).filter(Boolean).slice(0, 8);
  }

  function crearModelo(opciones) {
    var propiedad = opciones.propiedad || {};
    var asesor = opciones.asesor || {};
    var direccion = [propiedad.calle, propiedad.colonia, propiedad.municipio,
      propiedad.estado, propiedad.cp].filter(Boolean).join(', ');
    if (!direccion) direccion = 'Ubicación no disponible';

    var features = [];
    if (numero(propiedad.recamaras)) features.push({ valor: propiedad.recamaras, etiqueta: propiedad.recamaras === 1 ? 'RECÁMARA' : 'RECÁMARAS' });
    if (numero(propiedad.banos)) features.push({ valor: propiedad.banos, etiqueta: propiedad.banos === 1 ? 'BAÑO' : 'BAÑOS' });
    if (numero(propiedad.estacionamientos)) features.push({ valor: propiedad.estacionamientos, etiqueta: propiedad.estacionamientos === 1 ? 'COCHERA' : 'COCHERAS' });
    if (numero(propiedad.m2_construccion)) features.push({ valor: propiedad.m2_construccion + ' m²', etiqueta: 'CONSTRUCCIÓN' });
    if (numero(propiedad.m2_terreno) && !numero(propiedad.m2_construccion)) features.push({ valor: propiedad.m2_terreno + ' m²', etiqueta: 'TERRENO' });
    if (!features.length && propiedad.tipo) features.push({ valor: texto(propiedad.tipo), etiqueta: 'TIPO DE PROPIEDAD' });

    return {
      operacion: propiedad.operacion === 'renta' ? 'RENTA' : 'VENTA',
      titulo: texto(propiedad.titulo, 'Propiedad KW Premier'),
      tipo: texto(propiedad.tipo),
      direccion: direccion,
      precio: precio(propiedad.precio, propiedad.moneda),
      features: features.slice(0, 4),
      extras: listaCaracteristicas(propiedad),
      fotos: (Array.isArray(propiedad.imagenes) ? propiedad.imagenes : []).filter(function (u) {
        return typeof u === 'string' && u.trim();
      }).slice(0, 3),
      asesor: {
        nombre: nombreAsesor(asesor, propiedad),
        puesto: texto(asesor.puesto, texto(propiedad.market_center, 'Asesor inmobiliario')),
        market_center: texto(propiedad.market_center),
        whatsapp: texto(asesor.whatsapp, texto(asesor.telefono)),
        email: texto(asesor.email),
        sitio: limpiarUrl(asesor.sitio_web),
        foto: texto(asesor.foto_url)
      },
      enlace: texto(opciones.url, window.location.href),
      logo: '/assets/img/logo-kw-premier.png'
    };
  }

  function cargarImagen(url) {
    if (!url) return Promise.resolve(null);
    return new Promise(function (resolver) {
      var imagen = new Image();
      try {
        var origen = new URL(url, window.location.href).origin;
        if (origen !== window.location.origin) imagen.crossOrigin = 'anonymous';
      } catch (error) { /* URL inválida: el evento de error resuelve con espacio vacío */ }
      imagen.onload = function () { resolver(imagen); };
      imagen.onerror = function () { resolver(null); };
      imagen.src = url;
    });
  }

  function cargarImagenes(modelo) {
    return Promise.all([
      cargarImagen(modelo.logo),
      cargarImagen(modelo.fotos[0]),
      cargarImagen(modelo.fotos[1]),
      cargarImagen(modelo.fotos[2]),
      cargarImagen(modelo.asesor.foto)
    ]).then(function (imagenes) {
      modelo._logo = imagenes[0];
      modelo._fotos = imagenes.slice(1, 4);
      modelo._asesorFoto = imagenes[4];
      return modelo;
    });
  }

  function rutaRedondeada(ctx, x, y, w, h, r) {
    var radio = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radio, y);
    ctx.arcTo(x + w, y, x + w, y + h, radio);
    ctx.arcTo(x + w, y + h, x, y + h, radio);
    ctx.arcTo(x, y + h, x, y, radio);
    ctx.arcTo(x, y, x + w, y, radio);
    ctx.closePath();
  }

  function imagenCubierta(ctx, imagen, x, y, w, h, radio) {
    ctx.save();
    rutaRedondeada(ctx, x, y, w, h, radio || 0);
    ctx.clip();
    ctx.fillStyle = '#d9d8d4';
    ctx.fillRect(x, y, w, h);
    if (imagen && imagen.naturalWidth) {
      var escala = Math.max(w / imagen.naturalWidth, h / imagen.naturalHeight);
      var ancho = w / escala;
      var alto = h / escala;
      var sx = (imagen.naturalWidth - ancho) / 2;
      var sy = (imagen.naturalHeight - alto) / 2;
      ctx.drawImage(imagen, sx, sy, ancho, alto, x, y, w, h);
    } else {
      ctx.fillStyle = '#bcbcb7';
      ctx.font = '600 21px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Foto no disponible', x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  function envolver(ctx, valor, maximo) {
    var palabras = texto(valor).split(/\s+/).filter(Boolean);
    var lineas = [];
    var linea = '';
    palabras.forEach(function (palabra) {
      var candidata = linea ? linea + ' ' + palabra : palabra;
      if (linea && ctx.measureText(candidata).width > maximo) {
        lineas.push(linea);
        linea = palabra;
      } else {
        linea = candidata;
      }
    });
    if (linea) lineas.push(linea);
    return lineas;
  }

  function textoEnvuelto(ctx, valor, x, y, maximo, alto, maxLineas, alineacion) {
    var lineas = envolver(ctx, valor, maximo).slice(0, maxLineas || 99);
    var anterior = ctx.textAlign;
    ctx.textAlign = alineacion || 'left';
    lineas.forEach(function (linea, i) { ctx.fillText(linea, x, y + i * alto); });
    ctx.textAlign = anterior;
    return lineas.length;
  }

  function pin(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = COLORES.rojo;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORES.blanco;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function dibujarCaracteristica(ctx, dato, x, y, w) {
    ctx.fillStyle = COLORES.rojo;
    ctx.fillRect(x, y, 72, 5);
    ctx.fillStyle = COLORES.texto;
    ctx.font = '700 38px Arial, sans-serif';
    ctx.fillText(texto(dato.valor, '-'), x, y + 57);
    ctx.fillStyle = COLORES.gris;
    ctx.font = '600 16px Arial, sans-serif';
    textoEnvuelto(ctx, dato.etiqueta, x, y + 88, w - 12, 21, 2);
  }

  function dibujarModelo(modelo) {
    var canvas = document.createElement('canvas');
    canvas.width = ANCHO;
    canvas.height = ALTO;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = COLORES.blanco;
    ctx.fillRect(0, 0, ANCHO, ALTO);

    imagenCubierta(ctx, modelo._fotos[0], 575, 0, 1025, 700, 0);
    imagenCubierta(ctx, modelo._fotos[1], 575, 700, 505, 270, 0);
    imagenCubierta(ctx, modelo._fotos[2], 1095, 700, 505, 270, 0);

    ctx.fillStyle = COLORES.blanco;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(835, 0); ctx.lineTo(770, 245);
    ctx.lineTo(735, 245); ctx.lineTo(785, 460); ctx.lineTo(720, 460);
    ctx.lineTo(690, 760); ctx.lineTo(620, 760); ctx.lineTo(575, 970);
    ctx.lineTo(0, 970); ctx.closePath(); ctx.fill();

    if (modelo._logo && modelo._logo.naturalWidth) {
      var logoAncho = 315;
      var logoAlto = logoAncho * modelo._logo.naturalHeight / modelo._logo.naturalWidth;
      ctx.drawImage(modelo._logo, 82, 74, logoAncho, logoAlto);
    } else {
      ctx.fillStyle = COLORES.rojo;
      ctx.font = '700 42px Arial, sans-serif';
      ctx.fillText('kw', 84, 125);
      ctx.fillStyle = COLORES.texto;
      ctx.fillText('PREMIER', 160, 125);
    }

    ctx.fillStyle = COLORES.texto;
    ctx.font = '400 112px Georgia, serif';
    ctx.fillText(modelo.operacion, 76, 330);
    ctx.fillStyle = COLORES.rojoOscuro;
    ctx.font = '700 19px Arial, sans-serif';
    if (modelo.tipo) ctx.fillText(modelo.tipo.toLocaleUpperCase('es-MX'), 80, 385);
    ctx.fillStyle = COLORES.texto;
    ctx.font = '700 36px Arial, sans-serif';
    var lineasTitulo = textoEnvuelto(ctx, modelo.titulo.toLocaleUpperCase('es-MX'), 80, 440, 500, 47, 3);
    if (modelo.precio) {
      ctx.fillStyle = COLORES.rojo;
      ctx.font = '700 25px Arial, sans-serif';
      ctx.fillText(modelo.precio, 80, Math.max(520, 440 + lineasTitulo * 47 + 35));
    }

    ctx.strokeStyle = COLORES.texto;
    ctx.lineWidth = 3;
    ctx.strokeRect(34, 645, 510, 165);
    pin(ctx, 88, 686);
    ctx.fillStyle = COLORES.texto;
    ctx.font = '500 22px Arial, sans-serif';
    textoEnvuelto(ctx, modelo.direccion.toLocaleUpperCase('es-MX'), 289, 746, 430, 29, 3, 'center');

    ctx.fillStyle = COLORES.rojo;
    ctx.beginPath();
    ctx.moveTo(0, 835); ctx.lineTo(555, 835); ctx.lineTo(530, 915); ctx.lineTo(0, 915);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = COLORES.blanco;
    ctx.font = '700 28px Arial, sans-serif';
    ctx.fillText('CONTACTA AL ASESOR', 75, 885);

    ctx.fillStyle = COLORES.fondo;
    ctx.fillRect(0, 970, ANCHO, 355);
    ctx.fillStyle = COLORES.rojoOscuro;
    ctx.font = '700 20px Arial, sans-serif';
    ctx.fillText('CARACTERÍSTICAS', 76, 1035);
    var cantidad = Math.max(modelo.features.length, 1);
    var anchoDato = (ANCHO - 152) / cantidad;
    (modelo.features.length ? modelo.features : [{ valor: '-', etiqueta: 'DATOS NO DISPONIBLES' }]).forEach(function (dato, i) {
      dibujarCaracteristica(ctx, dato, 76 + i * anchoDato, 1080, anchoDato);
      if (i) {
        ctx.fillStyle = COLORES.linea;
        ctx.fillRect(76 + i * anchoDato - 1, 1080, 2, 120);
      }
    });
    if (modelo.extras.length) {
      ctx.fillStyle = COLORES.gris;
      ctx.font = '500 18px Arial, sans-serif';
      textoEnvuelto(ctx, modelo.extras.join('  ·  '), 76, 1255, 1440, 25, 2);
    }

    ctx.fillStyle = '#e7e7e6';
    ctx.fillRect(0, 1325, ANCHO, ALTO - 1325);
    ctx.fillStyle = COLORES.rojo;
    ctx.fillRect(76, 1405, 5, 445);
    if (modelo._asesorFoto && modelo._asesorFoto.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(245, 1565, 142, 0, Math.PI * 2);
      ctx.clip();
      var foto = modelo._asesorFoto;
      var escalaFoto = Math.max(284 / foto.naturalWidth, 284 / foto.naturalHeight);
      var fotoAncho = 284 / escalaFoto;
      var fotoAlto = 284 / escalaFoto;
      ctx.drawImage(foto, (foto.naturalWidth - fotoAncho) / 2, (foto.naturalHeight - fotoAlto) / 2, fotoAncho, fotoAlto, 103, 1423, 284, 284);
      ctx.restore();
      ctx.strokeStyle = COLORES.rojo;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(245, 1565, 142, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = COLORES.rojo;
      ctx.beginPath(); ctx.arc(245, 1565, 142, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORES.blanco;
      ctx.font = '700 76px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(modelo.asesor.nombre.split(/\s+/).slice(0, 2).map(function (n) { return n[0]; }).join('').toUpperCase(), 245, 1592);
      ctx.textAlign = 'left';
    }

    ctx.fillStyle = COLORES.texto;
    ctx.font = '700 39px Arial, sans-serif';
    ctx.fillText(modelo.asesor.nombre.toLocaleUpperCase('es-MX'), 505, 1485);
    ctx.fillStyle = COLORES.rojo;
    ctx.font = '700 22px Arial, sans-serif';
    textoEnvuelto(ctx, modelo.asesor.puesto.toLocaleUpperCase('es-MX'), 505, 1525, 1000, 28, 2);
    ctx.fillStyle = COLORES.texto;
    ctx.font = '500 23px Arial, sans-serif';
    var contactos = [
      modelo.asesor.whatsapp ? 'WhatsApp: ' + modelo.asesor.whatsapp : '',
      modelo.asesor.email ? 'Correo: ' + modelo.asesor.email : '',
      modelo.asesor.sitio ? modelo.asesor.sitio : '',
      texto(modelo.asesor.market_center)
    ].filter(Boolean);
    contactos.forEach(function (dato, i) { textoEnvuelto(ctx, dato, 505, 1615 + i * 47, 980, 28, 1); });
    ctx.fillStyle = COLORES.rojo;
    ctx.fillRect(505, 1905, 940, 3);
    ctx.fillStyle = COLORES.gris;
    ctx.font = '400 17px Arial, sans-serif';
    textoEnvuelto(ctx, modelo.enlace, 505, 1950, 980, 24, 2);
    ctx.fillStyle = COLORES.rojoOscuro;
    ctx.font = '700 16px Arial, sans-serif';
    ctx.fillText('KW PREMIER | FICHA TÉCNICA', 76, 2015);
    return canvas;
  }

  function descargar(blob, nombre) {
    var url = URL.createObjectURL(blob);
    var enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
  }

  function convertirPNG(canvas) {
    return new Promise(function (resolver, rechazar) {
      canvas.toBlob(function (blob) {
        blob ? resolver(blob) : rechazar(new Error('No se pudo generar el PNG.'));
      }, 'image/png');
    });
  }

  function cargarJsPDF() {
    if (global.jspdf && global.jspdf.jsPDF) return Promise.resolve(global.jspdf.jsPDF);
    if (jsPdfPromesa) return jsPdfPromesa;
    jsPdfPromesa = new Promise(function (resolver, rechazar) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.async = true;
      script.onload = function () {
        if (global.jspdf && global.jspdf.jsPDF) resolver(global.jspdf.jsPDF);
        else rechazar(new Error('No se pudo cargar el generador PDF.'));
      };
      script.onerror = function () { rechazar(new Error('No se pudo cargar el generador PDF.')); };
      document.head.appendChild(script);
    });
    return jsPdfPromesa;
  }

  async function convertirPDF(canvas) {
    var JsPDF = await cargarJsPDF();
    var pdf = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 612, 792, undefined, 'FAST');
    return pdf.output('blob');
  }

  function iconoCerrar() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  }

  async function abrir(opciones) {
    instalarEstilos();
    var anterior = document.querySelector('.kw-ficha-overlay');
    if (anterior) anterior.remove();
    var modelo = crearModelo(opciones || {});
    var overlay = document.createElement('div');
    overlay.className = 'kw-ficha-overlay';
    overlay.innerHTML = '<div class="kw-ficha-dialog" role="dialog" aria-modal="true" aria-labelledby="kw-ficha-titulo">' +
      '<div class="kw-ficha-top"><div class="kw-ficha-titulo" id="kw-ficha-titulo">Ficha técnica</div>' +
      '<button type="button" class="kw-ficha-cerrar" aria-label="Cerrar">' + iconoCerrar() + '</button></div>' +
      '<div class="kw-ficha-vista"><div class="kw-ficha-cargando">Preparando ficha técnica...</div></div>' +
      '<div class="kw-ficha-estado" role="status" aria-live="polite">Puedes descargarla como PNG o PDF.</div>' +
      '<div class="kw-ficha-botones"><button type="button" class="kw-ficha-boton kw-ficha-boton-png" disabled>Descargar PNG</button>' +
      '<button type="button" class="kw-ficha-boton kw-ficha-boton-pdf" disabled>Descargar PDF</button></div>' +
      '</div>';
    var dialog = overlay.firstChild;
    var vista = dialog.querySelector('.kw-ficha-vista');
    var estado = dialog.querySelector('.kw-ficha-estado');
    var botonPNG = dialog.querySelector('.kw-ficha-boton-png');
    var botonPDF = dialog.querySelector('.kw-ficha-boton-pdf');
    var cerrar = function () {
      document.removeEventListener('keydown', teclado);
      overlay.classList.remove('abierto');
      window.setTimeout(function () { if (overlay.parentNode) overlay.remove(); }, 180);
      if (opciones && typeof opciones.alCerrar === 'function') opciones.alCerrar();
    };
    var teclado = function (evento) { if (evento.key === 'Escape') cerrar(); };
    dialog.querySelector('.kw-ficha-cerrar').addEventListener('click', cerrar);
    overlay.addEventListener('click', function (evento) { if (evento.target === overlay) cerrar(); });
    document.addEventListener('keydown', teclado);
    document.body.appendChild(overlay);
    window.requestAnimationFrame(function () { overlay.classList.add('abierto'); });

    var canvas;
    try {
      await cargarImagenes(modelo);
      canvas = dibujarModelo(modelo);
      vista.replaceChildren(canvas);
      canvas.className = 'kw-ficha-canvas';
      botonPNG.disabled = false;
      botonPDF.disabled = false;
      estado.textContent = 'Selecciona el formato que quieres descargar.';
    } catch (error) {
      vista.innerHTML = '<div class="kw-ficha-cargando">No se pudo preparar la ficha técnica.</div>';
      estado.textContent = 'Intenta nuevamente en unos segundos.';
      return;
    }

    async function descargarFormato(tipo, boton) {
      boton.disabled = true;
      boton.textContent = tipo === 'png' ? 'Generando PNG...' : 'Generando PDF...';
      estado.textContent = 'Preparando descarga...';
      try {
        var blob = tipo === 'png' ? await convertirPNG(canvas) : await convertirPDF(canvas);
        descargar(blob, 'ficha-' + slug(modelo.titulo) + '.' + tipo);
        estado.textContent = 'Descarga lista.';
      } catch (error) {
        estado.textContent = error.message || 'No se pudo generar el archivo.';
      } finally {
        boton.disabled = false;
        boton.textContent = tipo === 'png' ? 'Descargar PNG' : 'Descargar PDF';
      }
    }

    botonPNG.addEventListener('click', function () { descargarFormato('png', botonPNG); });
    botonPDF.addEventListener('click', function () { descargarFormato('pdf', botonPDF); });
  }

  global.kwFichaPropiedad = { abrir: abrir, crearModelo: crearModelo, dibujar: dibujarModelo };
})(window);
