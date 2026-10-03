(function (global) {
  'use strict';

  var ANCHO = 1600;
  var ALTO = 1900;
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
  var pdfJsPromesa = null;

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

  var PERFILES_KW_FALLBACK = {
    'daniguerrero.kw.com': {
      nombre: 'Daniel Barush',
      apellido: 'Guerrero',
      puesto: 'Coordinador de Tecnología',
      whatsapp: '+52 55 8577 2232',
      email: 'dani.guerrero@kwmexico.mx',
      sitio_web: 'https://daniguerrero.kw.com',
      market_center: 'KW Premier',
      foto_url: 'https://storage.googleapis.com/attachment-prod-e2ad/2000132866/d9ufqddpq4ac70pfit4g.png'
    }
  };

  function perfilKwFallback(sitio) {
    try {
      var hostname = new URL(sitio || '', window.location.href).hostname.toLowerCase();
      return PERFILES_KW_FALLBACK[hostname] || {};
    } catch (error) { return {}; }
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

  function urlFoto(valor) {
    if (typeof valor === 'string') return valor.trim();
    if (!valor || typeof valor !== 'object') return '';
    return texto(valor.url || valor.href || valor.src || valor.link || valor.foto || valor.imagen);
  }

  function listaFotos(propiedad) {
    var urls = [];
    var vistos = Object.create(null);
    var fuentes = ['imagenes', 'fotos', 'photos', 'galeria', 'gallery'];

    function agregar(valor) {
      if (Array.isArray(valor)) {
        valor.forEach(agregar);
        return;
      }
      var url = urlFoto(valor);
      if (!url) return;
      var clave = url;
      try {
        var parsed = new URL(url, window.location.href);
        parsed.hash = '';
        clave = parsed.href;
      } catch (error) { /* Se conserva la URL para que el cargador decida. */ }
      if (vistos[clave]) return;
      vistos[clave] = true;
      urls.push(url);
    }

    fuentes.forEach(function (campo) { agregar(propiedad && propiedad[campo]); });
    return urls.slice(0, 12);
  }

  function listaCaracteristicas(propiedad) {
    var fuente = propiedad && propiedad.caracteristicas;
    if (typeof fuente === 'string') {
      try { fuente = JSON.parse(fuente); } catch (error) { fuente = [fuente]; }
    }
    if (!Array.isArray(fuente)) fuente = [];
    return fuente.map(function (item) {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') return texto(item.nombre || item.label || item.valor || item.value);
      return '';
    }).filter(Boolean).slice(0, 8);
  }

  function crearModelo(opciones) {
    var propiedad = opciones.propiedad || {};
    var asesor = Object.assign({}, perfilKwFallback(opciones.asesor && opciones.asesor.sitio_web), opciones.asesor || {});
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
      operacion: String(propiedad.operacion || '').toLowerCase() === 'renta' ? 'RENTA' : 'VENTA',
      titulo: texto(propiedad.titulo, 'Propiedad KW Premier'),
      tipo: texto(propiedad.tipo),
      direccion: direccion,
      precio: precio(propiedad.precio, propiedad.moneda),
      moneda: texto(propiedad.moneda, 'MXN').toUpperCase(),
      features: features.slice(0, 4),
      extras: listaCaracteristicas(propiedad),
      fotos: listaFotos(propiedad),
      asesor: {
        nombre: nombreAsesor(asesor, propiedad),
        puesto: 'Asesor Inmobiliario',
        market_center: texto(asesor.market_center, texto(propiedad.market_center, 'KW Premier')),
        whatsapp: texto(asesor.whatsapp, texto(asesor.telefono)),
        email: texto(asesor.email),
        sitio: limpiarUrl(asesor.sitio_web),
        foto: texto(asesor.foto_url),
        kw_id: texto(propiedad.asesor_kw_id)
      },
      enlace: texto(opciones.url, window.location.href),
      logo: '/assets/img/logo-kw-premier.png'
    };
  }

  function candidatosImagen(url) {
    var original = texto(url);
    if (!original) return [];
    var candidatos = [original];
    try {
      var parsed = new URL(original, window.location.href);
      if (parsed.origin !== window.location.origin && /^https?:$/i.test(parsed.protocol)) {
        var remoto = parsed.host + parsed.pathname + parsed.search;
        candidatos.push('https://images.weserv.nl/?url=' + encodeURIComponent(remoto) + '&output=jpg&q=88');
      }
    } catch (error) { /* Una URL invalida se descarta en el manejador de error. */ }
    return candidatos;
  }

  function cargarImagen(url) {
    var candidatos = candidatosImagen(url);
    function intentar(indice) {
      if (indice >= candidatos.length) return Promise.resolve(null);
      return new Promise(function (resolver) {
        var imagen = new Image();
        try {
          var origen = new URL(candidatos[indice], window.location.href).origin;
          if (origen !== window.location.origin) imagen.crossOrigin = 'anonymous';
        } catch (error) { /* La imagen se resolvera como vacia si la URL no es valida. */ }
        imagen.decoding = 'async';
        imagen.onload = function () { resolver(imagen); };
        imagen.onerror = function () { resolver(null); };
        imagen.src = candidatos[indice];
      }).then(function (imagen) { return imagen || intentar(indice + 1); });
    }
    return intentar(0);
  }

  function cargarFotosDisponibles(urls) {
    if (!urls.length) return Promise.resolve([]);
    var resultados = new Array(urls.length);
    var siguiente = 0;
    var exitosas = 0;
    var trabajadores = Math.min(3, urls.length);

    function trabajador() {
      if (exitosas >= 4) return Promise.resolve();
      var indice = siguiente++;
      if (indice >= urls.length) return Promise.resolve();
      return cargarImagen(urls[indice]).then(function (imagen) {
        if (imagen && imagen.naturalWidth) {
          resultados[indice] = imagen;
          exitosas++;
        }
        return trabajador();
      });
    }

    return Promise.all(Array.from({ length: trabajadores }, trabajador))
      .then(function () {
        return resultados.filter(function (imagen) { return imagen && imagen.naturalWidth; }).slice(0, 4);
      });
  }

  function cargarImagenes(modelo) {
    return Promise.all([
      cargarImagen(modelo.logo),
      cargarFotosDisponibles(modelo.fotos),
      cargarImagen(modelo.asesor.foto)
    ]).then(function (imagenes) {
      modelo._logo = imagenes[0];
      modelo._fotos = imagenes[1];
      modelo._asesorFoto = imagenes[2];
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

  function marcaSinFoto(ctx, x, y, w, h, principal) {
    ctx.fillStyle = principal ? '#e3dfd9' : '#eceae7';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = principal ? 'rgba(204,0,0,.08)' : 'rgba(48,44,44,.035)';
    ctx.beginPath();
    ctx.moveTo(x + w * .58, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h * .7);
    ctx.lineTo(x + w * .23, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = principal ? 'rgba(255,255,255,.48)' : 'rgba(255,255,255,.65)';
    ctx.beginPath();
    ctx.moveTo(x + w * .82, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h * .28);
    ctx.closePath();
    ctx.fill();
    if (principal) {
      ctx.fillStyle = '#c6c0b9';
      ctx.font = '700 150px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('KW', x + w * .72, y + h * .54);
      ctx.fillStyle = '#a49b93';
      ctx.font = '700 22px Arial, sans-serif';
      ctx.fillText('IMAGEN DE LA PROPIEDAD', x + w * .72, y + h * .64);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = COLORES.rojo;
      ctx.fillRect(x + 34, y + 34, 54, 5);
    }
  }

  function imagenCubierta(ctx, imagen, x, y, w, h, radio, principal) {
    ctx.save();
    rutaRedondeada(ctx, x, y, w, h, radio || 0);
    ctx.clip();
    if (imagen && imagen.naturalWidth) {
      ctx.fillStyle = '#d9d8d4';
      ctx.fillRect(x, y, w, h);
      var escala = Math.max(w / imagen.naturalWidth, h / imagen.naturalHeight);
      var ancho = w / escala;
      var alto = h / escala;
      var sx = (imagen.naturalWidth - ancho) / 2;
      var sy = (imagen.naturalHeight - alto) / 2;
      ctx.drawImage(imagen, sx, sy, ancho, alto, x, y, w, h);
    } else {
      marcaSinFoto(ctx, x, y, w, h, !!principal);
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

  function trazosCaracteristica(etiqueta) {
    var nombre = texto(etiqueta).toLowerCase();
    if (nombre.indexOf('rec') !== -1 || nombre.indexOf('cama') !== -1) return [
      [[-30,20],[-30,-16],[-25,-22],[25,-22],[30,-16],[30,20]],
      [[-34,9],[-34,-3],[-29,-8],[29,-8],[34,-3],[34,9],[-34,9]],
      [[-25,-8],[-25,-17],[-3,-17],[-3,-8]], [[3,-8],[3,-17],[25,-17],[25,-8]],
      [[-28,10],[-28,20]], [[28,10],[28,20]]
    ];
    if (nombre.indexOf('ba') !== -1) return [
      [[-34,-3],[34,-3],[29,12],[19,20],[-19,20],[-29,12],[-34,-3]],
      [[-23,-3],[-23,-30],[-18,-35],[-9,-35],[-5,-29]],
      [[-12,-25],[-2,-29]], [[-20,20],[-23,26]], [[20,20],[23,26]]
    ];
    if (nombre.indexOf('coch') !== -1 || nombre.indexOf('estac') !== -1) return [
      [[-32,17],[-32,-5],[-24,-11],[-17,-26],[17,-26],[24,-11],[32,-5],[32,17],[-32,17]],
      [[-24,-11],[24,-11]], [[-17,-21],[17,-21],[21,-12],[-21,-12],[-17,-21]],
      [[-24,0],[-14,0],[-14,7],[-24,7],[-24,0]], [[14,0],[24,0],[24,7],[14,7],[14,0]],
      [[-10,12],[10,12]], [[-25,18],[-25,24],[-17,24],[-17,18]], [[17,18],[17,24],[25,24],[25,18]]
    ];
    return [
      [[-22,-25],[25,-25],[25,22],[-22,22],[-22,-25]],
      [[-35,-25],[-35,22]], [[-39,-20],[-35,-25],[-31,-20]], [[-39,17],[-35,22],[-31,17]],
      [[-22,34],[25,34]], [[-17,30],[-22,34],[-17,38]], [[20,30],[25,34],[20,38]]
    ];
  }

  function dibujarIconoFicha(ctx, etiqueta, x, y) {
    ctx.save();
    ctx.strokeStyle = COLORES.rojo;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    trazosCaracteristica(etiqueta).forEach(function (puntos) {
      ctx.beginPath();
      puntos.forEach(function (punto, i) { ctx[i ? 'lineTo' : 'moveTo'](x + punto[0] * .8, y + punto[1] * .8); });
      ctx.stroke();
    });
    ctx.restore();
  }

  function dibujarDatoFicha(ctx, dato, x, y) {
    dibujarIconoFicha(ctx, dato.etiqueta, x, y);
    ctx.fillStyle = COLORES.texto;
    ctx.font = '700 25px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(texto(dato.valor, '-'), x, y + 48);
    ctx.fillStyle = COLORES.gris;
    ctx.font = '500 16px Arial, sans-serif';
    textoEnvuelto(ctx, texto(dato.etiqueta).toLocaleUpperCase('es-MX'), x, y + 76, 190, 20, 1, 'center');
    ctx.textAlign = 'left';
  }

  function dibujarContactoIcono(ctx, tipo, x, y) {
    ctx.save();
    ctx.strokeStyle = COLORES.texto;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (tipo === 0) {
      ctx.fillStyle = COLORES.texto;
      ctx.moveTo(x + 2, y + -19);
      ctx.lineTo(x + 10, y + -12);
      ctx.lineTo(x + 6, y + -5);
      ctx.lineTo(x + 10, y + 3);
      ctx.lineTo(x + 18, y + 8);
      ctx.lineTo(x + 25, y + 3);
      ctx.lineTo(x + 32, y + 11);
      ctx.lineTo(x + 27, y + 18);
      ctx.lineTo(x + 19, y + 19);
      ctx.lineTo(x + 7, y + 12);
      ctx.lineTo(x + -1, y + 2);
      ctx.lineTo(x + -5, y + -10);
      ctx.lineTo(x + -2, y + -17);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    } else if (tipo === 1) {
      ctx.rect(x - 11, y - 14, 38, 28);
      ctx.moveTo(x - 10, y - 12);
      ctx.lineTo(x + 8, y + 2);
      ctx.lineTo(x + 25, y - 12);
    } else {
      ctx.arc(x + 8, y, 18, 0, Math.PI * 2);
      ctx.moveTo(x - 10, y);
      ctx.lineTo(x + 26, y);
      ctx.moveTo(x + 8, y - 18);
      ctx.bezierCurveTo(x - 3, y - 10, x - 3, y + 10, x + 8, y + 18);
      ctx.bezierCurveTo(x + 19, y + 10, x + 19, y - 10, x + 8, y - 18);
    }
    ctx.stroke();
    ctx.restore();
  }

  function dibujarContactoFicha(ctx, valor, x, y, tipo) {
    if (!valor) return;
    dibujarContactoIcono(ctx, tipo, x, y - 8);
    ctx.fillStyle = COLORES.texto;
    ctx.font = '500 27px Arial, sans-serif';
    textoEnvuelto(ctx, valor, x + 58, y, 650, 29, 1);
  }

  function dibujarFotoAsesorFicha(ctx, foto, nombre, x, y, radio) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radio, 0, Math.PI * 2);
    ctx.clip();
    if (foto && foto.naturalWidth) {
      var lado = radio * 2;
      var escala = Math.max(lado / foto.naturalWidth, lado / foto.naturalHeight);
      var ancho = lado / escala;
      var alto = lado / escala;
      ctx.drawImage(foto, (foto.naturalWidth - ancho) / 2, (foto.naturalHeight - alto) / 2, ancho, alto, x - radio, y - radio, lado, lado);
    } else {
      ctx.fillStyle = COLORES.rojo;
      ctx.fill();
      ctx.fillStyle = COLORES.blanco;
      ctx.font = '700 64px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(nombre.split(/\s+/).slice(0, 2).map(function (n) { return n[0]; }).join('').toUpperCase(), x, y + 22);
      ctx.textAlign = 'left';
    }
    ctx.restore();
    ctx.strokeStyle = COLORES.rojo;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, radio, 0, Math.PI * 2);
    ctx.stroke();
  }

  function dibujarPrecioFicha(ctx, modelo) {
    var x = 80;
    var y = 1201;
    var limiteDerecho = 600;
    var separacion = 26;
    var moneda = texto(modelo.moneda, 'MXN');
    var tamano = 53;
    var anchoMoneda;

    ctx.font = '700 ' + tamano + 'px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORES.blanco;
    ctx.font = '700 28px Arial, sans-serif';
    anchoMoneda = ctx.measureText(moneda).width;
    ctx.font = '700 ' + tamano + 'px Arial, sans-serif';
    while (tamano > 31 && ctx.measureText(modelo.precio || 'PRECIO A CONSULTAR').width + separacion + anchoMoneda > limiteDerecho - x) {
      tamano--;
      ctx.font = '700 ' + tamano + 'px Arial, sans-serif';
    }

    var precioTexto = modelo.precio || 'PRECIO A CONSULTAR';
    ctx.fillText(precioTexto, x, y);
    if (modelo.precio) {
      ctx.font = '700 28px Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(moneda, limiteDerecho, y);
    }
    ctx.textAlign = 'left';
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

    var anchoPanel = 680;
    var altoFotos = 1230;
    var hayFotos = modelo._fotos.some(function (foto) { return foto && foto.naturalWidth; });
    if (hayFotos) {
      imagenCubierta(ctx, modelo._fotos[0], anchoPanel, 0, ANCHO - anchoPanel, 1230, 0, true);

    } else {
      marcaSinFoto(ctx, anchoPanel, 0, ANCHO - anchoPanel, altoFotos, true);
    }

    ctx.fillStyle = COLORES.blanco;
    ctx.fillRect(0, 0, anchoPanel, altoFotos);
    for (var fotoIndice = 0; fotoIndice < 3; fotoIndice++) {
      imagenCubierta(ctx, modelo._fotos[fotoIndice + 1] || modelo._fotos[fotoIndice], 24 + fotoIndice * 522, 1246, 510, 301, 0, false);
    }

    if (modelo._logo && modelo._logo.naturalWidth) {
      var logoAncho = 286;
      var logoAlto = logoAncho * modelo._logo.naturalHeight / modelo._logo.naturalWidth;
      ctx.drawImage(modelo._logo, 78, 112, logoAncho, logoAlto);
    } else {
      ctx.fillStyle = COLORES.rojo;
      ctx.font = '700 42px Arial, sans-serif';
      ctx.fillText('kw', 78, 160);
      ctx.fillStyle = COLORES.texto;
      ctx.fillText('PREMIER', 154, 160);
    }

    ctx.fillStyle = COLORES.texto;
    ctx.font = '400 154px Georgia, serif';
    ctx.fillText(modelo.operacion, 58, 470);
    ctx.fillStyle = COLORES.texto;
    ctx.font = '500 36px Arial, sans-serif';
    textoEnvuelto(ctx, modelo.titulo.toLocaleUpperCase('es-MX'), 340, 605, 570, 42, 2, 'center');

    ctx.strokeStyle = COLORES.rojo;
    ctx.lineWidth = 3;
    ctx.strokeRect(36, 745, 590, 345);
    ctx.fillStyle = COLORES.rojo;
    ctx.font = '400 42px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DIRECCI\u00d3N:', 331, 818);
    ctx.fillStyle = COLORES.gris;
    ctx.font = '500 27px Arial, sans-serif';
    textoEnvuelto(ctx, modelo.direccion.toLocaleUpperCase('es-MX'), 331, 900, 505, 34, 6, 'center');
    ctx.textAlign = 'left';

    ctx.fillStyle = COLORES.rojo;
    ctx.fillRect(40, 1134, 590, 96);
    dibujarPrecioFicha(ctx, modelo);

    ctx.fillStyle = '#eeeeec';
    ctx.fillRect(0, 1565, ANCHO, 335);
    dibujarFotoAsesorFicha(ctx, modelo._asesorFoto, modelo.asesor.nombre, 183, 1735, 138);

    ctx.fillStyle = COLORES.texto;
    var nombreAsesorFicha = modelo.asesor.nombre.toLocaleUpperCase('es-MX');
    var tamanoNombreAsesor = 47;
    ctx.font = '700 ' + tamanoNombreAsesor + 'px Arial, sans-serif';
    while (tamanoNombreAsesor > 29 && ctx.measureText(nombreAsesorFicha).width > 680) {
      tamanoNombreAsesor--;
      ctx.font = '700 ' + tamanoNombreAsesor + 'px Arial, sans-serif';
    }
    ctx.fillText(nombreAsesorFicha, 370, 1645);
    ctx.fillStyle = COLORES.rojo;
    ctx.font = '700 29px Arial, sans-serif';
    ctx.fillText(modelo.asesor.puesto.toLocaleUpperCase('es-MX'), 370, 1690);
    ctx.fillStyle = COLORES.texto;
    var contactos = [
      modelo.asesor.whatsapp,
      modelo.asesor.email,
      modelo.asesor.sitio ? limpiarUrl(modelo.asesor.sitio) : ''
    ].filter(Boolean);
    contactos.slice(0, 3).forEach(function (dato, i) { dibujarContactoFicha(ctx, dato, 370, 1745 + i * 46, i); });

    ctx.fillStyle = COLORES.rojo;
    ctx.fillRect(1088, 1635, 3, 200);
    var datos = modelo.features.slice(0, 4);
    var posicionesDatos = [
      { x: 1260, y: 1650 }, { x: 1490, y: 1650 },
      { x: 1260, y: 1790 }, { x: 1490, y: 1790 }
    ];
    datos.forEach(function (dato, i) {
      var posicion = posicionesDatos[i];
      dibujarDatoFicha(ctx, dato, posicion.x, posicion.y, 205);
    });
    if (modelo.extras.length) {
      ctx.fillStyle = COLORES.gris;
      ctx.font = '500 16px Arial, sans-serif';
      textoEnvuelto(ctx, modelo.extras.slice(0, 4).join(' / ').toLocaleUpperCase('es-MX'), 331, 1060, 505, 20, 2, 'center');
    }
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

  function cargarPdfJs() {
    if (global.pdfjsLib && global.pdfjsLib.getDocument) return Promise.resolve(global.pdfjsLib);
    if (pdfJsPromesa) return pdfJsPromesa;
    pdfJsPromesa = new Promise(function (resolver, rechazar) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.async = true;
      script.onload = function () {
        if (!global.pdfjsLib || !global.pdfjsLib.getDocument) {
          rechazar(new Error('No se pudo cargar el lector PDF.'));
          return;
        }
        global.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolver(global.pdfjsLib);
      };
      script.onerror = function () {
        pdfJsPromesa = null;
        rechazar(new Error('No se pudo cargar el lector PDF.'));
      };
      document.head.appendChild(script);
    });
    return pdfJsPromesa;
  }

  function pdfFuente(pdf, tamano, color, estilo) {
    pdf.setFont('helvetica', estilo || 'normal');
    pdf.setFontSize(tamano);
    pdf.setTextColor(color || COLORES.texto);
  }

  function pdfTextoEnvuelto(pdf, valor, x, y, maximo, alto, maxLineas, alineacion, tamano, color, estilo, escala) {
    pdfFuente(pdf, tamano * escala, color, estilo);
    var lineas = pdf.splitTextToSize(texto(valor), maximo * escala).slice(0, maxLineas || 99);
    pdf.text(lineas, x * escala, y * escala, {
      align: alineacion || 'left',
      lineHeightFactor: alto / tamano
    });
    return lineas.length;
  }

  function pdfTextoAjustado(pdf, valor, x, y, maximo, tamano, minimo, color, estilo, escala) {
    var actual = tamano;
    var contenido = texto(valor);
    pdfFuente(pdf, actual * escala, color, estilo);
    while (actual > minimo && pdf.getTextWidth(contenido) > maximo * escala) {
      actual--;
      pdfFuente(pdf, actual * escala, color, estilo);
    }
    pdf.text(contenido, x * escala, y * escala);
  }

  function rasterizarImagen(imagen, ancho, alto, modo, calidad) {
    if (!imagen || !imagen.naturalWidth) return null;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(ancho));
    canvas.height = Math.max(1, Math.round(alto));
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (modo === 'contain') {
      var escalaContain = Math.min(canvas.width / imagen.naturalWidth, canvas.height / imagen.naturalHeight);
      var anchoContain = imagen.naturalWidth * escalaContain;
      var altoContain = imagen.naturalHeight * escalaContain;
      ctx.drawImage(imagen, (canvas.width - anchoContain) / 2, (canvas.height - altoContain) / 2, anchoContain, altoContain);
    } else {
      var escalaCover = Math.max(canvas.width / imagen.naturalWidth, canvas.height / imagen.naturalHeight);
      var anchoCover = canvas.width / escalaCover;
      var altoCover = canvas.height / escalaCover;
      ctx.drawImage(imagen, (imagen.naturalWidth - anchoCover) / 2, (imagen.naturalHeight - altoCover) / 2,
        anchoCover, altoCover, 0, 0, canvas.width, canvas.height);
    }
    return {
      data: canvas.toDataURL(modo === 'contain' ? 'image/png' : 'image/jpeg', modo === 'contain' ? undefined : (calidad || 0.9)),
      formato: modo === 'contain' ? 'PNG' : 'JPEG'
    };
  }

  function rasterizarFotoCircular(imagen, lado) {
    if (!imagen || !imagen.naturalWidth) return null;
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(lado);
    canvas.height = Math.round(lado);
    var ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(lado / 2, lado / 2, lado / 2, 0, Math.PI * 2);
    ctx.clip();
    var escala = Math.max(lado / imagen.naturalWidth, lado / imagen.naturalHeight);
    var ancho = lado / escala;
    var alto = lado / escala;
    ctx.drawImage(imagen, (imagen.naturalWidth - ancho) / 2, (imagen.naturalHeight - alto) / 2, ancho, alto, 0, 0, lado, lado);
    return { data: canvas.toDataURL('image/png'), formato: 'PNG' };
  }

  function pdfImagen(pdf, raster, x, y, ancho, alto, escala) {
    if (!raster) return false;
    pdf.addImage(raster.data, raster.formato, x * escala, y * escala, ancho * escala, alto * escala, undefined, 'FAST');
    return true;
  }

  function pdfMarcaSinFoto(pdf, x, y, ancho, alto, principal, escala) {
    pdf.setFillColor(principal ? '#e3dfd9' : '#eceae7');
    pdf.rect(x * escala, y * escala, ancho * escala, alto * escala, 'F');
    pdf.setFillColor(principal ? '#d6d2cc' : '#dedbd7');
    pdf.triangle((x + ancho * .58) * escala, y * escala,
      (x + ancho) * escala, y * escala, (x + ancho) * escala, (y + alto * .7) * escala, 'F');
    pdf.setFillColor('#f6f5f3');
    pdf.triangle((x + ancho * .82) * escala, y * escala,
      (x + ancho) * escala, y * escala, (x + ancho) * escala, (y + alto * .28) * escala, 'F');
    if (principal) {
      pdfFuente(pdf, 150 * escala, '#c6c0b9', 'bold');
      pdf.text('KW', (x + ancho * .72) * escala, (y + alto * .54) * escala, { align: 'center' });
      pdfFuente(pdf, 22 * escala, '#a49b93', 'bold');
      pdf.text('IMAGEN DE LA PROPIEDAD', (x + ancho * .72) * escala, (y + alto * .64) * escala, { align: 'center' });
    } else {
      pdf.setFillColor(COLORES.rojo);
      pdf.rect((x + 34) * escala, (y + 34) * escala, 54 * escala, 5 * escala, 'F');
    }
  }

  function pdfImagenCubierta(pdf, imagen, x, y, ancho, alto, principal, escala) {
    if (!pdfImagen(pdf, rasterizarImagen(imagen, ancho, alto, 'cover', 0.92), x, y, ancho, alto, escala)) {
      pdfMarcaSinFoto(pdf, x, y, ancho, alto, principal, escala);
    }
  }

  function pdfIconoFicha(pdf, etiqueta, x, y, escala) {
    pdf.setDrawColor(COLORES.rojo);
    pdf.setLineWidth(2.5 * escala);
    pdf.setLineCap('round');
    pdf.setLineJoin('round');
    trazosCaracteristica(etiqueta).forEach(function (puntos) {
      var segmentos = puntos.slice(1).map(function (punto, i) {
        return [(punto[0] - puntos[i][0]) * .8, (punto[1] - puntos[i][1]) * .8];
      });
      pdf.lines(segmentos, (x + puntos[0][0] * .8) * escala, (y + puntos[0][1] * .8) * escala, [escala, escala], 'S', false);
    });
  }

  function pdfDatoFicha(pdf, dato, x, y, ancho, escala) {
    pdfIconoFicha(pdf, dato.etiqueta, x, y, escala);
    pdfTextoEnvuelto(pdf, texto(dato.valor, '-'), x, y + 72, ancho, 25, 1, 'center', 25, COLORES.texto, 'bold', escala);
    pdfTextoEnvuelto(pdf, texto(dato.etiqueta).toLocaleUpperCase('es-MX'), x, y + 104, ancho - 12, 20, 1, 'center', 16, COLORES.gris, 'normal', escala);
  }

  function pdfIconoContacto(pdf, tipo, x, y, escala) {
    pdf.setDrawColor(COLORES.texto);
    pdf.setLineWidth(4 * escala);
    if (tipo === 0) {
      pdf.setFillColor(COLORES.texto);
      pdf.lines([[8,7],[-4,7],[4,8],[8,5],[7,-5],[7,8],[-5,7],[-8,1],[-12,-7],[-8,-10],[-4,-12],[3,-7]], (x + 2) * escala, (y - 19) * escala, [escala, escala], 'F', true);
    } else if (tipo === 1) {
      pdf.rect((x - 11) * escala, (y - 14) * escala, 38 * escala, 28 * escala, 'S');
      pdf.line((x - 10) * escala, (y - 12) * escala, (x + 8) * escala, (y + 2) * escala);
      pdf.line((x + 8) * escala, (y + 2) * escala, (x + 25) * escala, (y - 12) * escala);
    } else {
      pdf.circle((x + 8) * escala, y * escala, 18 * escala, 'S');
      pdf.line((x - 10) * escala, y * escala, (x + 26) * escala, y * escala);
      pdf.ellipse((x + 8) * escala, y * escala, 9 * escala, 18 * escala, 'S');
    }
  }

  function pdfContactoFicha(pdf, valor, x, y, tipo, escala) {
    if (!valor) return;
    pdfIconoContacto(pdf, tipo, x + 8, y - 8, escala);
    pdfTextoEnvuelto(pdf, valor, x + 58, y, 650, 29, 1, 'left', 27, COLORES.texto, 'normal', escala);
  }

  function pdfFotoAsesorFicha(pdf, foto, nombre, x, y, radio, escala) {
    var lado = radio * 2;
    var raster = rasterizarFotoCircular(foto, lado);
    if (raster) {
      pdfImagen(pdf, raster, x - radio, y - radio, lado, lado, escala);
    } else {
      pdf.setFillColor(COLORES.rojo);
      pdf.circle(x * escala, y * escala, radio * escala, 'F');
      pdfFuente(pdf, 64 * escala, COLORES.blanco, 'bold');
      pdf.text(nombre.split(/\s+/).slice(0, 2).map(function (n) { return n[0]; }).join('').toUpperCase(), x * escala, (y + 22) * escala, { align: 'center' });
    }
    pdf.setDrawColor(COLORES.rojo);
    pdf.setLineWidth(4 * escala);
    pdf.circle(x * escala, y * escala, radio * escala, 'S');
  }

  function dibujarPDFVector(pdf, modelo, escala) {
    var anchoPanel = 680;
    var altoFotos = 1230;
    pdf.setFillColor(COLORES.blanco);
    pdf.rect(0, 0, ANCHO * escala, ALTO * escala, 'F');

    pdfImagenCubierta(pdf, modelo._fotos[0], anchoPanel, 0, ANCHO - anchoPanel, 1230, true, escala);
    for (var fotoIndice = 0; fotoIndice < 3; fotoIndice++) {
      pdfImagenCubierta(pdf, modelo._fotos[fotoIndice + 1] || modelo._fotos[fotoIndice], 24 + fotoIndice * 522, 1246, 510, 301, false, escala);
    }
    pdf.setFillColor(COLORES.blanco);
    pdf.rect(0, 0, anchoPanel * escala, altoFotos * escala, 'F');

    var logoAncho = 286;
    var logoAlto = modelo._logo && modelo._logo.naturalWidth
      ? logoAncho * modelo._logo.naturalHeight / modelo._logo.naturalWidth : 0;
    if (logoAlto) {
      pdfImagen(pdf, rasterizarImagen(modelo._logo, logoAncho, logoAlto, 'contain'), 78, 112, logoAncho, logoAlto, escala);
    } else {
      pdfFuente(pdf, 42 * escala, COLORES.rojo, 'bold');
      pdf.text('kw', 78 * escala, 160 * escala);
      pdfFuente(pdf, 42 * escala, COLORES.texto, 'bold');
      pdf.text('PREMIER', 154 * escala, 160 * escala);
    }

    pdfFuente(pdf, 154 * escala, COLORES.texto, 'normal');
    pdf.setFont('times', 'normal');
    pdf.text(modelo.operacion, 58 * escala, 470 * escala);
    pdfTextoEnvuelto(pdf, modelo.titulo.toLocaleUpperCase('es-MX'), 340, 605, 570, 42, 2, 'center', 36, COLORES.texto, 'normal', escala);

    pdf.setDrawColor(COLORES.rojo);
    pdf.setLineWidth(3 * escala);
    pdf.rect(36 * escala, 745 * escala, 590 * escala, 345 * escala, 'S');
    pdfTextoEnvuelto(pdf, 'DIRECCIÓN:', 331, 818, 590, 42, 1, 'center', 42, COLORES.rojo, 'normal', escala);
    pdfTextoEnvuelto(pdf, modelo.direccion.toLocaleUpperCase('es-MX'), 331, 900, 505, 34, 6, 'center', 27, COLORES.gris, 'normal', escala);
    if (modelo.extras.length) {
      pdfTextoEnvuelto(pdf, modelo.extras.slice(0, 4).join(' / ').toLocaleUpperCase('es-MX'), 331, 1060, 505, 20, 2, 'center', 16, COLORES.gris, 'normal', escala);
    }

    pdf.setFillColor(COLORES.rojo);
    pdf.rect(40 * escala, 1134 * escala, 590 * escala, 96 * escala, 'F');
    var precioTexto = modelo.precio || 'PRECIO A CONSULTAR';
    var moneda = texto(modelo.moneda, 'MXN');
    var tamanoPrecio = 53;
    pdfFuente(pdf, tamanoPrecio * escala, COLORES.blanco, 'bold');
    pdfFuente(pdf, 28 * escala, COLORES.blanco, 'bold');
    var anchoMoneda = pdf.getTextWidth(moneda);
    pdfFuente(pdf, tamanoPrecio * escala, COLORES.blanco, 'bold');
    while (tamanoPrecio > 31 && pdf.getTextWidth(precioTexto) + 26 * escala + anchoMoneda > (600 - 80) * escala) {
      tamanoPrecio--;
      pdfFuente(pdf, tamanoPrecio * escala, COLORES.blanco, 'bold');
    }
    pdf.text(precioTexto, 80 * escala, 1201 * escala);
    if (modelo.precio) {
      pdfFuente(pdf, 28 * escala, COLORES.blanco, 'bold');
      pdf.text(moneda, 600 * escala, 1201 * escala, { align: 'right' });
    }

    pdf.setFillColor('#eeeeec');
    pdf.rect(0, 1565 * escala, ANCHO * escala, 335 * escala, 'F');
    pdfFotoAsesorFicha(pdf, modelo._asesorFoto, modelo.asesor.nombre, 183, 1735, 138, escala);
    pdfTextoAjustado(pdf, modelo.asesor.nombre.toLocaleUpperCase('es-MX'), 370, 1645, 680, 47, 29, COLORES.texto, 'bold', escala);
    pdfTextoAjustado(pdf, modelo.asesor.puesto.toLocaleUpperCase('es-MX'), 370, 1690, 680, 29, 22, COLORES.rojo, 'bold', escala);
    [modelo.asesor.whatsapp, modelo.asesor.email, modelo.asesor.sitio ? limpiarUrl(modelo.asesor.sitio) : '']
      .filter(Boolean).slice(0, 3).forEach(function (dato, i) {
        pdfContactoFicha(pdf, dato, 370, 1745 + i * 46, i, escala);
      });

    pdf.setFillColor(COLORES.rojo);
    pdf.rect(1088 * escala, 1635 * escala, 3 * escala, 200 * escala, 'F');
    var posicionesDatos = [
      { x: 1260, y: 1650 }, { x: 1490, y: 1650 },
      { x: 1260, y: 1790 }, { x: 1490, y: 1790 }
    ];
    modelo.features.slice(0, 4).forEach(function (dato, i) {
      var posicion = posicionesDatos[i];
      pdfDatoFicha(pdf, dato, posicion.x, posicion.y, 205, escala);
    });
  }

  async function convertirPDF(modelo) {
    var JsPDF = await cargarJsPDF();
    var anchoPDF = 612;
    var altoPDF = anchoPDF * ALTO / ANCHO;
    var escala = anchoPDF / ANCHO;
    var pdf = new JsPDF({ orientation: 'portrait', unit: 'pt', format: [anchoPDF, altoPDF], compress: true });
    dibujarPDFVector(pdf, modelo, escala);
    return pdf.output('blob');
  }

  async function convertirPNGDesdePDF(blob) {
    var pdfJs = await cargarPdfJs();
    var bytes = new Uint8Array(await blob.arrayBuffer());
    var documento = await pdfJs.getDocument({ data: bytes }).promise;
    try {
      var pagina = await documento.getPage(1);
      var base = pagina.getViewport({ scale: 1 });
      var viewport = pagina.getViewport({ scale: ANCHO / base.width });
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      var contexto = canvas.getContext('2d', { alpha: false });
      contexto.imageSmoothingEnabled = true;
      contexto.imageSmoothingQuality = 'high';
      await pagina.render({ canvasContext: contexto, viewport: viewport }).promise;
      return await new Promise(function (resolver, rechazar) {
        canvas.toBlob(function (resultado) {
          if (resultado) resolver(resultado);
          else rechazar(new Error('No se pudo convertir el PDF a PNG.'));
        }, 'image/png');
      });
    } finally {
      if (documento && documento.destroy) await documento.destroy();
    }
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

    var pdfBlob = null;
    var pdfPromesa = null;

    function obtenerPDF() {
      if (pdfBlob) return Promise.resolve(pdfBlob);
      if (!pdfPromesa) {
        pdfPromesa = convertirPDF(modelo).then(function (resultado) {
          pdfBlob = resultado;
          return resultado;
        }).catch(function (error) {
          pdfPromesa = null;
          throw error;
        });
      }
      return pdfPromesa;
    }

    async function descargarFormato(tipo, boton) {
      boton.disabled = true;
      boton.textContent = tipo === 'png' ? 'Generando PNG...' : 'Generando PDF...';
      estado.textContent = tipo === 'png' ? 'Generando PDF base y convirtiéndolo a PNG...' : 'Preparando PDF en alta calidad...';
      try {
        var pdf = await obtenerPDF();
        var blob = tipo === 'png' ? await convertirPNGDesdePDF(pdf) : pdf;
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
