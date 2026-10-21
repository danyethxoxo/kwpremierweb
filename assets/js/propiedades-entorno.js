(function () {
  'use strict';
  function recurso(url, css) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement(css ? 'link' : 'script');
      if (css) { el.rel = 'stylesheet'; el.href = url; } else el.src = url;
      var timer = setTimeout(function () { el.remove(); reject(new Error('Mapa no disponible')); }, 12000);
      el.onload = function () { clearTimeout(timer); resolve(); };
      el.onerror = function () { clearTimeout(timer); reject(new Error('Mapa no disponible')); };
      document.head.appendChild(el);
    });
  }
  window.kwFondoEntorno = async function (mapa, marco) {
    var vector, timer, listo = false, alternativo = false;
    var fallback = L.tileLayer(marco.dataset.tiles || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19, updateWhenIdle:true, keepBuffer:1,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(mapa);
    fallback.on('tileerror', function () { marco.setAttribute('aria-description', 'El fondo del mapa no está disponible temporalmente. Los precios siguen activos.'); });
    if (marco.dataset.tiles) return;
    function recuperar() {
      if (listo) return;
      alternativo = true;
      clearTimeout(timer);
      if (vector && mapa.hasLayer(vector)) mapa.removeLayer(vector);
      marco.dataset.fondo = 'alternativo';
    }
    try {
      await Promise.all([
        recurso('/assets/vendor/mapa/maplibre-gl.css?v=5.7.1', true),
        recurso('/assets/vendor/mapa/maplibre-gl.js?v=5.7.1')
      ]);
      await recurso('/assets/vendor/mapa/leaflet-maplibre-gl.js?v=0.1.4');
      vector = L.maplibreGL({
        style:'/assets/data/mapa/entorno.json?v=20261020metro1', interactive:false,
        attributionControl:{customAttribution:'<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'},
      }).addTo(mapa);
      timer = setTimeout(recuperar, 20000);
      var gl = vector.getMaplibreMap();
      var metro = new Image();
      metro.onload = function () {
        var canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 80;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0,0,80,80); ctx.drawImage(metro,8,8,64,64);
        if (!gl.hasImage('kw-metro-cdmx')) gl.addImage('kw-metro-cdmx', ctx.getImageData(0,0,80,80), {pixelRatio:4});
      };
      gl.once('load', function () { metro.src = '/assets/data/mapa/metro-cdmx.svg'; });
      gl.once('load', function () {
        if (alternativo) return;
        listo = true; clearTimeout(timer);
        if (mapa.hasLayer(fallback)) mapa.removeLayer(fallback);
        marco.dataset.fondo = 'entorno';
        marco.removeAttribute('aria-description');
      });
      gl.on('error', function () { if (!gl.isStyleLoaded()) recuperar(); });
    } catch (_) { recuperar(); }
  };
})();
