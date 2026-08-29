/* ══════════════════════════════════════════════════════════
   kw-xlsx.js - bajar una lista a Excel
   ══════════════════════════════════════════════════════════

   Es un .xlsx de verdad y no un CSV. El CSV se veía más corto, pero
   Excel lo abría con su codificación vieja y llegaba con "OperaciÃ³n" y
   "SÃ­" en vez de los acentos, y las fechas y los precios entraban como
   texto. Un xlsx no deja lugar a que el programa adivine: dice de qué
   tipo es cada celda y en qué codificación viene.

   Un xlsx es un zip con unos XML adentro. Se arma a mano, guardando sin
   comprimir, porque comprimir pediría una librería y el sitio no carga
   ninguna; sin comprimir el archivo pesa más, pero para una lista de
   unos cientos de renglones eso son unos cuantos cientos de kilobytes.

   Vivía dentro de Dictámenes, que fue quien lo estrenó. Salió de ahí
   cuando Firmas necesitó lo mismo: doscientas líneas de armar zips y
   XML no se copian de una pantalla a otra.

   ── Cómo se usa ──
   Cada columna dice cómo se llama, de qué es, qué tan ancha va y de
   dónde sale su valor. El tipo es lo que hace que en Excel una fecha se
   pueda ordenar como fecha y un precio se pueda sumar; los que hay son
   'texto', 'parrafo' (texto de varios renglones), 'fecha' (de un ISO
   yyyy-mm-dd), 'moneda', 'decimal' y 'entero'.

     window.kwXlsx.descargar({
       columnas: [
         ['Folio', 'texto', 13, function (d) { return d.folio; }],
         ['Fecha',  'fecha', 15, function (d) { return d.fecha; }],
       ],
       filas: losDatos,
       hoja: 'Dictámenes',
       archivo: 'dictamenes-2026-08-29.xlsx',
     });

   .libro(columnas, filas, nombreHoja) devuelve el Blob, por si hace
   falta hacer otra cosa con él que no sea bajarlo. */

(function () {
  'use strict';

  // ── Las piezas del zip ──

  var CRC_TABLA = (function () {
    var t = new Int32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = -1;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  // Un zip con todo guardado sin comprimir (método 0). Lleva el encabezado
  // de cada archivo, el directorio del final y el renglón que dice dónde
  // empieza ese directorio, que es lo que lee quien lo abre.
  function armarZip(archivos) {
    var enc = new TextEncoder();
    var partes = [];
    var central = [];
    var desplazamiento = 0;

    function u16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
    function u32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }

    // La fecha del archivo va en el formato de MS-DOS, que es lo que
    // guarda un zip: la hora en medias unidades de segundo y el año
    // contado desde 1980. Dejarla en ceros da el "0 de mes 0 de 1980" y
    // hay lectores que se quejan.
    var ahora = new Date();
    var horaDOS = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
    var diaDOS = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();

    archivos.forEach(function (a) {
      var nombre = enc.encode(a.nombre);
      var datos = enc.encode(a.texto);
      var suma = crc32(datos);

      // Los campos que el encabezado de cada archivo y el renglón del
      // directorio llevan iguales, en el mismo orden. La bandera 0x0800
      // dice que el nombre viene en UTF-8: los de aquí son todos ASCII,
      // pero declararlo no cuesta y es lo que pide el formato.
      var comun = [].concat(
        u16(20), u16(0x0800), u16(0), u16(horaDOS), u16(diaDOS),
        u32(suma), u32(datos.length), u32(datos.length),
        u16(nombre.length));

      partes.push(new Uint8Array([].concat(u32(0x04034B50), comun, u16(0))));
      partes.push(nombre);
      partes.push(datos);

      // Después del tramo común van, en este orden: lo que ocupa el
      // extra, el comentario, en qué disco empieza, los atributos de
      // adentro, los de afuera, y dónde arranca su encabezado. Los seis
      // tienen que estar aunque vayan en cero: de menos uno, el renglón
      // sale corto y el siguiente se lee corrido.
      central.push(new Uint8Array([].concat(
        u32(0x02014B50), u16(20), comun,
        u16(0), u16(0), u16(0), u16(0), u32(0), u32(desplazamiento))));
      central.push(nombre);

      desplazamiento += 30 + nombre.length + datos.length;
    });

    var largoCentral = central.reduce(function (n, p) { return n + p.length; }, 0);
    var fin = new Uint8Array([].concat(
      u32(0x06054B50), u16(0), u16(0),
      u16(archivos.length), u16(archivos.length),
      u32(largoCentral), u32(desplazamiento), u16(0)));

    return new Blob(partes.concat(central, [fin]),
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  // ── Las piezas de la hoja ──

  function xml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
    // Excel no acepta los caracteres de control adentro de una celda, y de
    // una nota pegada de otro lado bien puede colarse uno.
    }).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  // A1, B1 ... Z1, AA1. Con treinta columnas ya se pasa de la Z.
  function letra(i) {
    var s = '';
    for (var n = i; n >= 0; n = Math.floor(n / 26) - 1) {
      s = String.fromCharCode(65 + (n % 26)) + s;
    }
    return s;
  }

  // Excel cuenta los días desde el 30 de diciembre de 1899. Las fechas se
  // parten a mano en vez de pasarlas por Date, que las leería como
  // medianoche UTC y en México las correría un día hacia atrás.
  function serieFecha(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso == null ? '' : iso));
    if (!m) return null;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) + 25569;
  }

  // Lo que llega de un formulario no viene pelón: quien captura escribe
  // "4,500,000" o "$4.500,000.00" y las dos cosas quieren decir lo
  // mismo. A la celda tiene que entrar el número, no el adorno.
  function soloCifra(v) {
    var s = String(v == null ? '' : v).replace(/[^\d.]/g, '');
    // De varios puntos se queda el último, que es el de los decimales:
    // "4.500.000" es cuatro millones y medio escrito a la europea.
    var partes = s.split('.');
    if (partes.length > 2) s = partes.slice(0, -1).join('') + '.' + partes[partes.length - 1];
    return s;
  }

  // El número de formato de cada tipo, tal como quedan armados en
  // styles.xml aquí abajo.
  var ESTILOS = {
    titulo: 1, fecha: 2, moneda: 3, decimal: 4,
    entero: 0, texto: 0, parrafo: 5,
  };

  // Las que llevan número adentro. Las demás son letras, y una lista de
  // observaciones con varios renglones es un párrafo: mismo texto, pero
  // con el ajuste de línea prendido para que se vean los renglones.
  var NUMERICAS = ['moneda', 'decimal', 'entero'];

  function celdaXML(ref, tipo, valor, esTitulo) {
    var estilo = esTitulo ? ESTILOS.titulo : (ESTILOS[tipo] || 0);
    var abre = '<c r="' + ref + '"' + (estilo ? ' s="' + estilo + '"' : '');

    if (!esTitulo && tipo === 'fecha') {
      var serie = serieFecha(valor);
      return serie === null ? '' : abre + '><v>' + serie + '</v></c>';
    }
    if (!esTitulo && NUMERICAS.indexOf(tipo) !== -1) {
      var n = Number(soloCifra(valor));
      if (!soloCifra(valor) || isNaN(n)) return '';
      return abre + '><v>' + n + '</v></c>';
    }

    var t = String(valor == null ? '' : valor);
    if (!t) return '';
    // El texto va escrito adentro de la celda y no en la tabla de textos
    // compartidos que suele traer un xlsx: son dos archivos más y un
    // índice que mantener, para una lista que se baja y se abre una vez.
    return abre + ' t="inlineStr"><is><t xml:space="preserve">' + xml(t) + '</t></is></c>';
  }

  function hojaXML(columnas, filas) {
    var cols = columnas.map(function (c, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + c[2] + '" customWidth="1"/>';
    }).join('');

    var titulos = '<row r="1">' + columnas.map(function (c, i) {
      return celdaXML(letra(i) + '1', 'texto', c[0], true);
    }).join('') + '</row>';

    var cuerpo = filas.map(function (d, f) {
      var r = f + 2;
      return '<row r="' + r + '">' + columnas.map(function (c, i) {
        return celdaXML(letra(i) + r, c[1], c[3](d), false);
      }).join('') + '</row>';
    }).join('');

    var ultima = letra(columnas.length - 1) + (filas.length + 1);

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:' + ultima + '"/>' +
      // El renglón de los títulos se queda pegado arriba al rodar la hoja,
      // y cada columna trae su flechita para filtrar.
      '<sheetViews><sheetView tabSelected="1" workbookViewId="0">' +
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      '<cols>' + cols + '</cols>' +
      '<sheetData>' + titulos + cuerpo + '</sheetData>' +
      '<autoFilter ref="A1:' + ultima + '"/>' +
      '</worksheet>';
  }

  var ESTILOS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3">' +
      '<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>' +
      '<numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0.00"/>' +
      '<numFmt numFmtId="166" formatCode="#,##0.00"/>' +
    '</numFmts>' +
    '<fonts count="2">' +
      '<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="2">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
        '<alignment vertical="top" wrapText="1"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function libro(columnas, filas, nombreHoja) {
    var C = 'http://schemas.openxmlformats.org/';
    return armarZip([
      { nombre: '[Content_Types].xml', texto:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="' + C + 'package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>' },
      { nombre: '_rels/.rels', texto:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="' + C + 'package/2006/relationships">' +
        '<Relationship Id="rId1" Type="' + C + 'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>' },
      { nombre: 'xl/workbook.xml', texto:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="' + C + 'spreadsheetml/2006/main" xmlns:r="' + C + 'officeDocument/2006/relationships">' +
        '<sheets><sheet name="' + xml(nombreHoja) + '" sheetId="1" r:id="rId1"/></sheets>' +
        '</workbook>' },
      { nombre: 'xl/_rels/workbook.xml.rels', texto:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="' + C + 'package/2006/relationships">' +
        '<Relationship Id="rId1" Type="' + C + 'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="' + C + 'officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>' },
      { nombre: 'xl/styles.xml', texto: ESTILOS_XML },
      { nombre: 'xl/worksheets/sheet1.xml', texto: hojaXML(columnas, filas) },
    ]);
  }

  // Bajarlo: se arma el archivo, se le cuelga un enlace invisible y se
  // le pica solo. No hay manera más directa de guardar un archivo hecho
  // en el navegador.
  function descargar(op) {
    var url = URL.createObjectURL(libro(op.columnas, op.filas, op.hoja || 'Hoja 1'));
    var a = document.createElement('a');
    a.href = url;
    a.download = op.archivo || 'lista.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  window.kwXlsx = { libro: libro, descargar: descargar };
})();
