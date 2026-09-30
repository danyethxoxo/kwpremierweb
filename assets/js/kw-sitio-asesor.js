(function () {
  'use strict';

  function normalizar(sitio) {
    var texto = String(sitio || '').trim();
    if (!texto || /[\\\s]/.test(texto)) return null;
    try {
      var url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : 'https://' + texto);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return null;
      if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.kw\.com$/.test(url.hostname)) return null;
      if (url.hostname === 'www.kw.com') return null;
      return 'https://' + url.hostname;
    } catch (error) { return null; }
  }

  function personalizar(enlace, sitio) {
    var origen = normalizar(sitio);
    if (!origen) return enlace;
    try {
      var url = new URL(enlace);
      if (url.origin !== 'https://kw.com' || !/^\/es-419\/property\/[^/]+\/\d+$/.test(url.pathname)) return enlace;
      return origen + url.pathname + url.search + url.hash;
    } catch (error) { return enlace; }
  }

  window.kwSitioAsesor = { normalizar: normalizar, personalizar: personalizar };
})();
