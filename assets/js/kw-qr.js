// Generador de códigos QR con la identidad de KW Premier.
//
// No usa librerías externas: implementa el estándar ISO/IEC 18004 (modo
// byte) y dibuja el resultado como SVG con el estilo de la marca
// puntos redondos, esquinas con las puntas suavizadas y la "kw" al
// centro. Se hizo así para que el QR salga con la identidad de KW en vez
// de la de un servicio de terceros, y para que siga funcionando aunque
// un CDN esté caído.
//
// Uso:
//   var svg = kwQR.svg('https://…');              // string con el SVG
//   await kwQR.png('https://…', 900);             // Blob PNG
//   await kwQR.descargar('https://…', 'perfil');  // lo baja al dispositivo
//
// La "kw" del centro tapa cerca del 4% del código; con corrección de
// errores nivel H (recupera hasta el 30% del contenido) el código se
// sigue leyendo sin problema.

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Tablas del estándar
  // ─────────────────────────────────────────────────────────────
  // Bloques Reed-Solomon por versión (1-40) y nivel de corrección, en el
  // orden L, M, Q, H. Cada grupo es "cuántos bloques,codewords totales,
  // codewords de datos".
  var RSB = ('1,26,19|1,26,16|1,26,13|1,26,9|1,44,34|1,44,28|1,44,22|1,44,16|1,70,55|1,70,44|2,35,17|2,35,13|1,100,80|2,50,32|2,50,24|4,25,9|1,134,108|2,67,43|2,33,15 2,34,16|2,33,11 2,34,12|2,86,68|4,43,27|4,43,19|4,43,15|2,98,78|4,49,31|2,32,14 4,33,15|4,39,13 1,40,14|2,121,97|2,60,38 2,61,39|4,40,18 2,41,19|4,40,14 2,41,15|2,146,116|3,58,36 2,59,37|4,36,16 4,37,17|4,36,12 4,37,13|2,86,68 2,87,69|4,69,43 1,70,44|6,43,19 2,44,20|6,43,15 2,44,16|4,101,81|1,80,50 4,81,51|4,50,22 4,51,23|3,36,12 8,37,13|2,116,92 2,117,93|6,58,36 2,59,37|4,46,20 6,47,21|7,42,14 4,43,15|4,133,107|8,59,37 1,60,38|8,44,20 4,45,21|12,33,11 4,34,12|3,145,115 1,146,116|4,64,40 5,65,41|11,36,16 5,37,17|11,36,12 5,37,13|5,109,87 1,110,88|5,65,41 5,66,42|5,54,24 7,55,25|11,36,12 7,37,13|5,122,98 1,123,99|7,73,45 3,74,46|15,43,19 2,44,20|3,45,15 13,46,16|1,135,107 5,136,108|10,74,46 1,75,47|1,50,22 15,51,23|2,42,14 17,43,15|5,150,120 1,151,121|9,69,43 4,70,44|17,50,22 1,51,23|2,42,14 19,43,15|3,141,113 4,142,114|3,70,44 11,71,45|17,47,21 4,48,22|9,39,13 16,40,14|3,135,107 5,136,108|3,67,41 13,68,42|15,54,24 5,55,25|15,43,15 10,44,16|4,144,116 4,145,117|17,68,42|17,50,22 6,51,23|19,46,16 6,47,17|2,139,111 7,140,112|17,74,46|7,54,24 16,55,25|34,37,13|4,151,121 5,152,122|4,75,47 14,76,48|11,54,24 14,55,25|16,45,15 14,46,16|6,147,117 4,148,118|6,73,45 14,74,46|11,54,24 16,55,25|30,46,16 2,47,17|8,132,106 4,133,107|8,75,47 13,76,48|7,54,24 22,55,25|22,45,15 13,46,16|10,142,114 2,143,115|19,74,46 4,75,47|28,50,22 6,51,23|33,46,16 4,47,17|8,152,122 4,153,123|22,73,45 3,74,46|8,53,23 26,54,24|12,45,15 28,46,16|3,147,117 10,148,118|3,73,45 23,74,46|4,54,24 31,55,25|11,45,15 31,46,16|7,146,116 7,147,117|21,73,45 7,74,46|1,53,23 37,54,24|19,45,15 26,46,16|5,145,115 10,146,116|19,75,47 10,76,48|15,54,24 25,55,25|23,45,15 25,46,16|13,145,115 3,146,116|2,74,46 29,75,47|42,54,24 1,55,25|23,45,15 28,46,16|17,145,115|10,74,46 23,75,47|10,54,24 35,55,25|19,45,15 35,46,16|17,145,115 1,146,116|14,74,46 21,75,47|29,54,24 19,55,25|11,45,15 46,46,16|13,145,115 6,146,116|14,74,46 23,75,47|44,54,24 7,55,25|59,46,16 1,47,17|12,151,121 7,152,122|12,75,47 26,76,48|39,54,24 14,55,25|22,45,15 41,46,16|6,151,121 14,152,122|6,75,47 34,76,48|46,54,24 10,55,25|2,45,15 64,46,16|17,152,122 4,153,123|29,74,46 14,75,47|49,54,24 10,55,25|24,45,15 46,46,16|4,152,122 18,153,123|13,74,46 32,75,47|48,54,24 14,55,25|42,45,15 32,46,16|20,147,117 4,148,118|40,75,47 7,76,48|43,54,24 22,55,25|10,45,15 67,46,16|19,148,118 6,149,119|18,75,47 31,76,48|34,54,24 34,55,25|20,45,15 61,46,16').split('|');

  // Centros de los patrones de alineación, por versión.
  var ALIGN = ('|6,18|6,22|6,26|6,30|6,34|6,22,38|6,24,42|6,26,46|6,28,50|6,30,54|6,32,58|6,34,62|6,26,46,66|6,26,48,70|6,26,50,74|6,30,54,78|6,30,56,82|6,30,58,86|6,34,62,90|6,28,50,72,94|6,26,50,74,98|6,30,54,78,102|6,28,54,80,106|6,32,58,84,110|6,30,58,86,114|6,34,62,90,118|6,26,50,74,98,122|6,30,54,78,102,126|6,26,52,78,104,130|6,30,56,82,108,134|6,34,60,86,112,138|6,30,58,86,114,142|6,34,62,90,118,146|6,30,54,78,102,126,150|6,24,50,76,102,128,154|6,28,54,80,106,132,158|6,32,58,84,110,136,162|6,26,54,82,110,138,166|6,30,58,86,114,142,170').split('|');

  // La "kw" oficial, vectorizada del logo (viewBox 0 0 534 354).
  var KW_PATH = 'M0,1 51,2 51,202 137,114 202,114 265,258 327,114 363,117 421,259 480,118 533,114 432,352 410,353 342,193 277,352 256,354 165,145 120,197 186,353 134,352 84,235 50,271 51,353 1,354Z';

  var NIVEL = { L: 0, M: 1, Q: 2, H: 3 };
  var NIVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 }; // como viajan en la info de formato
  var ROJO_KW = '#C21532';

  // ─────────────────────────────────────────────────────────────
  // Aritmética en GF(256), la base de Reed-Solomon
  // ─────────────────────────────────────────────────────────────
  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d; // polinomio primitivo del estándar
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function mul(a, b) {
    return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
  }

  // Polinomio generador de grado n
  function generador(n) {
    var poly = [1];
    for (var i = 0; i < n; i++) {
      var sig = new Array(poly.length + 1);
      for (var k = 0; k < sig.length; k++) sig[k] = 0;
      for (var j = 0; j < poly.length; j++) {
        sig[j] ^= poly[j];
        sig[j + 1] ^= mul(poly[j], EXP[i]);
      }
      poly = sig;
    }
    return poly;
  }

  // Codewords de corrección para un bloque de datos
  function corregir(datos, largoEC) {
    var gen = generador(largoEC);
    var res = new Uint8Array(datos.length + largoEC);
    res.set(datos);
    for (var i = 0; i < datos.length; i++) {
      var factor = res[i];
      if (factor === 0) continue;
      for (var j = 1; j < gen.length; j++) res[i + j] ^= mul(gen[j], factor);
    }
    return res.slice(datos.length);
  }

  // ─────────────────────────────────────────────────────────────
  // Armado de los datos
  // ─────────────────────────────────────────────────────────────
  function bloques(version, nivel) {
    var fila = RSB[(version - 1) * 4 + NIVEL[nivel]];
    var salida = [];
    fila.split(' ').forEach(function (g) {
      var n = g.split(',');
      for (var i = 0; i < +n[0]; i++) salida.push({ total: +n[1], datos: +n[2] });
    });
    return salida;
  }

  function capacidadDatos(version, nivel) {
    return bloques(version, nivel).reduce(function (s, b) { return s + b.datos; }, 0);
  }

  function aBytes(texto) {
    if (global.TextEncoder) return new TextEncoder().encode(texto);
    // Respaldo por si el navegador es muy viejo
    var utf8 = unescape(encodeURIComponent(texto));
    var out = new Uint8Array(utf8.length);
    for (var i = 0; i < utf8.length; i++) out[i] = utf8.charCodeAt(i);
    return out;
  }

  function crearDatos(version, nivel, bytes) {
    var bits = [];
    function poner(valor, largo) {
      for (var i = largo - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
    }
    poner(4, 4); // indicador de modo byte
    poner(bytes.length, version < 10 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) poner(bytes[i], 8);

    var totalDatos = capacidadDatos(version, nivel);
    var tope = totalDatos * 8;
    if (bits.length > tope) return null;

    // terminador, relleno hasta byte completo y bytes de acolchado
    for (var t = 0; t < 4 && bits.length < tope; t++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    var relleno = [0xEC, 0x11], r = 0;
    while (bits.length < tope) { poner(relleno[r % 2], 8); r++; }

    var buffer = new Uint8Array(totalDatos);
    for (var b = 0; b < totalDatos; b++) {
      var v = 0;
      for (var k = 0; k < 8; k++) v = (v << 1) | bits[b * 8 + k];
      buffer[b] = v;
    }

    // Intercalar los bloques de datos y los de corrección, como pide el estándar
    var bl = bloques(version, nivel);
    var offset = 0, datosBl = [], ecBl = [], maxD = 0, maxE = 0, totalCw = 0;
    bl.forEach(function (x, i) {
      var largoEC = x.total - x.datos;
      datosBl[i] = buffer.slice(offset, offset + x.datos);
      offset += x.datos;
      ecBl[i] = corregir(datosBl[i], largoEC);
      maxD = Math.max(maxD, x.datos);
      maxE = Math.max(maxE, largoEC);
      totalCw += x.total;
    });

    var salida = new Uint8Array(totalCw), n = 0;
    for (var d = 0; d < maxD; d++)
      for (var i2 = 0; i2 < bl.length; i2++)
        if (d < datosBl[i2].length) salida[n++] = datosBl[i2][d];
    for (var e = 0; e < maxE; e++)
      for (var i3 = 0; i3 < bl.length; i3++)
        if (e < ecBl[i3].length) salida[n++] = ecBl[i3][e];
    return salida;
  }

  // ─────────────────────────────────────────────────────────────
  // Información de formato y de versión (códigos BCH)
  // ─────────────────────────────────────────────────────────────
  var G15 = 0x537, G18 = 0x1f25, G15_MASK = 0x5412;

  function digitos(x) {
    var n = 0;
    while (x !== 0) { n++; x >>>= 1; }
    return n;
  }
  function bchFormato(datos) {
    var d = datos << 10;
    while (digitos(d) - digitos(G15) >= 0) d ^= (G15 << (digitos(d) - digitos(G15)));
    return ((datos << 10) | d) ^ G15_MASK;
  }
  function bchVersion(datos) {
    var d = datos << 12;
    while (digitos(d) - digitos(G18) >= 0) d ^= (G18 << (digitos(d) - digitos(G18)));
    return (datos << 12) | d;
  }

  // ─────────────────────────────────────────────────────────────
  // Construcción de la matriz
  // ─────────────────────────────────────────────────────────────
  function mascara(patron, i, j) {
    switch (patron) {
      case 0: return (i + j) % 2 === 0;
      case 1: return i % 2 === 0;
      case 2: return j % 3 === 0;
      case 3: return (i + j) % 3 === 0;
      case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
      case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
      default: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
    }
  }

  function construir(version, nivel, datos, patron) {
    var n = version * 4 + 17;
    var m = [];
    for (var i = 0; i < n; i++) {
      m[i] = [];
      for (var j = 0; j < n; j++) m[i][j] = null;
    }

    // Patrones de búsqueda (las tres esquinas) con su separador
    [[0, 0], [n - 7, 0], [0, n - 7]].forEach(function (p) {
      var fila = p[0], col = p[1];
      for (var r = -1; r <= 7; r++) {
        if (fila + r < 0 || fila + r >= n) continue;
        for (var c = -1; c <= 7; c++) {
          if (col + c < 0 || col + c >= n) continue;
          m[fila + r][col + c] =
            (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        }
      }
    });

    // Patrones de alineación
    var pos = ALIGN[version - 1] ? ALIGN[version - 1].split(',').map(Number) : [];
    if (ALIGN[version - 1] === '') pos = [];
    for (var a = 0; a < pos.length; a++) {
      for (var b = 0; b < pos.length; b++) {
        var fr = pos[a], fc = pos[b];
        if (m[fr][fc] !== null) continue;
        for (var rr = -2; rr <= 2; rr++)
          for (var cc = -2; cc <= 2; cc++)
            m[fr + rr][fc + cc] =
              (rr === -2 || rr === 2 || cc === -2 || cc === 2 || (rr === 0 && cc === 0));
      }
    }

    // Patrones de tiempo
    for (var r2 = 8; r2 < n - 8; r2++) if (m[r2][6] === null) m[r2][6] = (r2 % 2 === 0);
    for (var c2 = 8; c2 < n - 8; c2++) if (m[6][c2] === null) m[6][c2] = (c2 % 2 === 0);

    // Información de versión (solo de la 7 en adelante)
    if (version >= 7) {
      var bv = bchVersion(version);
      for (var v = 0; v < 18; v++) {
        var on = ((bv >> v) & 1) === 1;
        m[Math.floor(v / 3)][(v % 3) + n - 8 - 3] = on;
        m[(v % 3) + n - 8 - 3][Math.floor(v / 3)] = on;
      }
    }

    // Información de formato
    var bf = bchFormato((NIVEL_BITS[nivel] << 3) | patron);
    for (var f = 0; f < 15; f++) {
      var on2 = ((bf >> f) & 1) === 1;
      if (f < 6) m[f][8] = on2;
      else if (f < 8) m[f + 1][8] = on2;
      else m[n - 15 + f][8] = on2;

      if (f < 8) m[8][n - f - 1] = on2;
      else if (f < 9) m[8][15 - f - 1 + 1] = on2;
      else m[8][15 - f - 1] = on2;
    }
    m[n - 8][8] = true; // módulo siempre oscuro

    // Datos, en zigzag desde la esquina inferior derecha
    var inc = -1, fila2 = n - 1, bit = 7, byte = 0;
    for (var col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (;;) {
        for (var k = 0; k < 2; k++) {
          if (m[fila2][col - k] === null) {
            var oscuro = false;
            if (byte < datos.length) oscuro = ((datos[byte] >>> bit) & 1) === 1;
            if (mascara(patron, fila2, col - k)) oscuro = !oscuro;
            m[fila2][col - k] = oscuro;
            bit--;
            if (bit === -1) { byte++; bit = 7; }
          }
        }
        fila2 += inc;
        if (fila2 < 0 || fila2 >= n) { fila2 -= inc; inc = -inc; break; }
      }
    }
    return m;
  }

  // Penalización del estándar, para elegir la máscara que deja el código
  // más fácil de leer.
  function penalizacion(m) {
    var n = m.length, total = 0, i, j;

    // Regla 1: rachas de 5 o más del mismo color
    for (i = 0; i < n; i++) {
      for (var eje = 0; eje < 2; eje++) {
        var racha = 1;
        for (j = 1; j < n; j++) {
          var a = eje ? m[j][i] : m[i][j];
          var b = eje ? m[j - 1][i] : m[i][j - 1];
          if (a === b) racha++;
          else { if (racha >= 5) total += 3 + (racha - 5); racha = 1; }
        }
        if (racha >= 5) total += 3 + (racha - 5);
      }
    }

    // Regla 2: bloques de 2x2 del mismo color
    for (i = 0; i < n - 1; i++)
      for (j = 0; j < n - 1; j++)
        if (m[i][j] === m[i][j + 1] && m[i][j] === m[i + 1][j] && m[i][j] === m[i + 1][j + 1])
          total += 3;

    // Regla 3: patrones que se confunden con el de búsqueda
    var patronA = [true, false, true, true, true, false, true, false, false, false, false];
    var patronB = [false, false, false, false, true, false, true, true, true, false, true];
    function coincide(get, k, p) {
      for (var q = 0; q < 11; q++) if (get(k + q) !== p[q]) return false;
      return true;
    }
    for (i = 0; i < n; i++) {
      for (j = 0; j <= n - 11; j++) {
        var fila = (function (idx) { return function (q) { return m[idx][q]; }; })(i);
        var col = (function (idx) { return function (q) { return m[q][idx]; }; })(i);
        if (coincide(fila, j, patronA) || coincide(fila, j, patronB)) total += 40;
        if (coincide(col, j, patronA) || coincide(col, j, patronB)) total += 40;
      }
    }

    // Regla 4: qué tan lejos está del 50% de módulos oscuros
    var oscuros = 0;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) if (m[i][j]) oscuros++;
    var porcentaje = Math.abs((oscuros * 100) / (n * n) - 50);
    total += Math.floor(porcentaje / 5) * 10;

    return total;
  }

  // ─────────────────────────────────────────────────────────────
  // API de la matriz
  // ─────────────────────────────────────────────────────────────
  function matriz(texto, nivel) {
    nivel = nivel || 'H';
    var bytes = aBytes(String(texto));
    for (var version = 1; version <= 40; version++) {
      var datos = crearDatos(version, nivel, bytes);
      if (!datos) continue;
      var mejor = null, mejorPuntos = Infinity;
      for (var p = 0; p < 8; p++) {
        var m = construir(version, nivel, datos, p);
        var puntos = penalizacion(m);
        if (puntos < mejorPuntos) { mejorPuntos = puntos; mejor = m; }
      }
      return mejor;
    }
    throw new Error('El texto es demasiado largo para un código QR.');
  }

  // ─────────────────────────────────────────────────────────────
  // Dibujo con el estilo de KW
  // ─────────────────────────────────────────────────────────────
  function svg(texto, opciones) {
    var o = opciones || {};
    var color = o.color || ROJO_KW;
    var fondo = o.fondo || '#ffffff';
    var m = matriz(texto, o.nivel || 'H');
    var n = m.length;
    var margen = 4;                   // zona de silencio que pide el estándar
    var lado = n + margen * 2;
    var conLogo = o.logo !== false;

    // El hueco del centro: la "kw" tapa poco más del 4% del código, muy
    // por debajo del 30% que recupera el nivel H.
    var cx = lado / 2, radioLogo = n * 0.115;
    var radioHueco = radioLogo + 0.6;

    function enElHueco(i, j) {
      if (!conLogo) return false;
      var dx = (margen + j + 0.5) - cx, dy = (margen + i + 0.5) - cx;
      return Math.sqrt(dx * dx + dy * dy) < radioHueco;
    }
    function esBuscador(i, j) {
      return (i < 7 && j < 7) || (i < 7 && j >= n - 7) || (i >= n - 7 && j < 7);
    }

    var partes = [];
    partes.push('<rect width="' + lado + '" height="' + lado + '" fill="' + fondo + '"/>');

    // Módulos de datos, como puntos redondos
    var puntos = [];
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        if (!m[i][j] || esBuscador(i, j) || enElHueco(i, j)) continue;
        // Radio 0.5: los puntos se tocan de lado y quedan separados en
        // diagonal, que es como se ve el estilo de puntos. Con puntos más
        // chicos algunos lectores dejan de reconocer el código cuando se
        // muestra en grande - se probó contra dos decodificadores.
        puntos.push('<circle cx="' + (margen + j + 0.5).toFixed(2) +
                    '" cy="' + (margen + i + 0.5).toFixed(2) + '" r="0.5"/>');
      }
    }
    partes.push('<g fill="' + color + '">' + puntos.join('') + '</g>');

    // Las tres esquinas, con las puntas suavizadas
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (p) {
      var y = margen + p[0], x = margen + p[1];
      partes.push(
        '<rect x="' + (x + 0.5) + '" y="' + (y + 0.5) + '" width="6" height="6" rx="1.9"' +
        ' fill="none" stroke="' + color + '" stroke-width="1"/>' +
        '<rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3" rx="0.95"' +
        ' fill="' + color + '"/>');
    });

    // La "kw" al centro, sobre un disco blanco con aro
    if (conLogo) {
      var escala = (radioLogo * 1.28) / 534;   // el ancho de la kw dentro del disco
      partes.push(
        '<circle cx="' + cx + '" cy="' + cx + '" r="' + radioLogo.toFixed(2) + '" fill="' + fondo + '"/>' +
        '<circle cx="' + cx + '" cy="' + cx + '" r="' + (radioLogo - 0.45).toFixed(2) + '"' +
        ' fill="none" stroke="' + color + '" stroke-width="0.9"/>' +
        '<g transform="translate(' + (cx - 534 * escala / 2).toFixed(3) + ' ' +
        (cx - 354 * escala / 2).toFixed(3) + ') scale(' + escala.toFixed(5) + ')">' +
        '<path fill="' + color + '" d="' + KW_PATH + '"/></g>');
    }

    var tamano = o.tamano || 0;
    var medidas = tamano ? ' width="' + tamano + '" height="' + tamano + '"' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + lado + ' ' + lado + '"' +
           medidas + ' shape-rendering="geometricPrecision">' + partes.join('') + '</svg>';
  }

  // ─────────────────────────────────────────────────────────────
  // Exportar a PNG (para compartir o imprimir)
  // ─────────────────────────────────────────────────────────────
  function png(texto, pixeles, opciones) {
    pixeles = pixeles || 900;
    // El SVG se pide del tamaño exacto al que se va a dibujar: si se deja
    // sin medidas, el navegador lo rasteriza a su tamaño por defecto y
    // luego lo escala, y el código sale borroso (y deja de leerse).
    var o = {};
    for (var k in (opciones || {})) o[k] = opciones[k];
    o.tamano = pixeles;
    var codigo = svg(texto, o);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(codigo);
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = canvas.height = pixeles;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = (opciones && opciones.fondo) || '#ffffff';
        ctx.fillRect(0, 0, pixeles, pixeles);
        ctx.drawImage(img, 0, 0, pixeles, pixeles);
        canvas.toBlob(function (blob) {
          blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen.'));
        }, 'image/png');
      };
      img.onerror = function () { reject(new Error('No se pudo generar la imagen.')); };
      img.src = url;
    });
  }

  async function descargar(texto, nombre, opciones) {
    var blob = await png(texto, (opciones && opciones.pixeles) || 900, opciones);
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (nombre || 'codigo-qr') + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  global.kwQR = { matriz: matriz, svg: svg, png: png, descargar: descargar };
})(window);
