(function () {
  'use strict';
  window.kwGaleriaPropiedad = function (root, fotos, abrir, opciones) {
    if (!root || fotos.length < 2) return null;
    var img = root.querySelector('img'), indice = 0, revision = 0, timer = 0;
    var duracion = (opciones && opciones.duracion) || 6000, restante = duracion, inicio = 0;
    var animacion, destruido = false, carga = new Map(), rotas = new Set(), pausas = new Set();
    var movimiento = matchMedia('(prefers-reduced-motion: reduce)');
    if (movimiento.matches) pausas.add('movimiento');
    var controles = document.createElement('div'); controles.className = 'galeria-controles';
    controles.innerHTML = '<button type="button" data-anterior aria-label="Foto anterior">&#8249;</button><span class="galeria-contador"></span><button type="button" data-siguiente aria-label="Foto siguiente">&#8250;</button><button type="button" data-pausa aria-label="Pausar fotos" aria-pressed="false">&#10074;&#10074;</button>';
    var pista = document.createElement('div'); pista.className = 'galeria-tiempo'; pista.setAttribute('aria-hidden', 'true');
    var barra = document.createElement('span'); pista.append(barra); root.append(controles, pista);
    root.setAttribute('role', 'group'); root.setAttribute('aria-label', 'Fotos de la propiedad');
    root.tabIndex = 0;
    root.addEventListener('keydown', function (e) { if (e.target === root && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(indice); } });
    var contador = controles.querySelector('.galeria-contador'), botonPausa = controles.querySelector('[data-pausa]');
    function preparar(i) {
      if (carga.has(i)) return carga.get(i);
      var promesa = new Promise(function (resolve, reject) {
        var foto = new Image(), limite = setTimeout(function () { terminar(false); }, 15000);
        foto.decoding = 'async';
        function terminar(ok) { clearTimeout(limite); foto.onload = foto.onerror = null; ok ? resolve(foto) : reject(new Error('Foto no disponible')); }
        foto.onload = function () { if (foto.decode) foto.decode().catch(function () {}).then(function () { terminar(true); }); else terminar(true); };
        foto.onerror = function () { terminar(false); }; foto.src = fotos[i];
      });
      carga.set(i, promesa);
      if (carga.size > 3) carga.delete(carga.keys().next().value);
      return promesa;
    }
    function parar() {
      if (timer) { clearTimeout(timer); timer = 0; restante = Math.max(0, restante - (performance.now() - inicio)); }
      if (animacion) animacion.pause();
    }
    function seguir() {
      if (destruido || pausas.size || timer || !img.isConnected || !img.complete || !img.naturalWidth) return;
      inicio = performance.now();
      if (animacion) animacion.play();
      timer = setTimeout(function () { timer = 0; cambiar(indice + 1, 1); }, restante);
      preparar((indice + 1) % fotos.length).catch(function () {});
    }
    function pausar(motivo, valor) { if (valor) pausas.add(motivo); else pausas.delete(motivo); parar(); seguir(); }
    function reiniciar() {
      parar(); restante = duracion;
      if (animacion) animacion.cancel();
      animacion = barra.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: duracion, fill: 'forwards', easing: 'linear' });
      animacion.pause(); contador.textContent = (indice + 1) + ' / ' + fotos.length; seguir();
    }
    async function cambiar(destino, paso) {
      parar(); var actual = ++revision;
      for (var intento = 0; intento < fotos.length; intento++) {
        var i = (destino + fotos.length) % fotos.length;
        if (!rotas.has(i)) {
          try {
            await preparar(i);
            if (destruido || actual !== revision) return;
            indice = i; img.src = fotos[i]; img.dataset.intento = i;
            if (!movimiento.matches) img.animate([{ opacity: .65 }, { opacity: 1 }], { duration: 350 });
            reiniciar(); return;
          } catch (e) { rotas.add(i); }
        }
        destino = i + paso;
      }
      pausar('sin-fotos', true);
    }
    controles.addEventListener('click', function (e) {
      e.stopPropagation(); var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-anterior')) cambiar(indice - 1, -1);
      else if (b.hasAttribute('data-siguiente')) cambiar(indice + 1, 1);
      else {
        var pausa = !pausas.has('usuario'); pausar('usuario', pausa);
        botonPausa.setAttribute('aria-pressed', String(pausa)); botonPausa.setAttribute('aria-label', pausa ? 'Reanudar fotos' : 'Pausar fotos');
        botonPausa.textContent = pausa ? '\u25b6' : '\u275a\u275a';
      }
    });
    root.onclick = function () { abrir(indice); };
    function alCargar() { var i = fotos.indexOf(img.getAttribute('src')); if (i >= 0) indice = i; reiniciar(); }
    img.addEventListener('load', alCargar);
    function visibilidad() { pausar('pestana', document.hidden); }
    function preferencia() { pausar('movimiento', movimiento.matches); }
    document.addEventListener('visibilitychange', visibilidad); movimiento.addEventListener('change', preferencia);
    root.addEventListener('mouseenter', function () { if (matchMedia('(hover:hover)').matches) pausar('puntero', true); });
    root.addEventListener('mouseleave', function () { pausar('puntero', false); });
    root.addEventListener('focusin', function () { pausar('foco', true); });
    root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) pausar('foco', false); });
    var observador;
    if (window.IntersectionObserver) {
      pausas.add('fuera'); observador = new IntersectionObserver(function (entradas) { pausar('fuera', !entradas[0].isIntersecting); }); observador.observe(root);
    }
    visibilidad(); if (img.complete && img.naturalWidth) alCargar();
    return {
      pausarVisor: function (valor) { pausar('visor', valor); },
      destruir: function () { destruido = true; ++revision; parar(); if (animacion) animacion.cancel(); if (observador) observador.disconnect(); document.removeEventListener('visibilitychange', visibilidad); movimiento.removeEventListener('change', preferencia); img.removeEventListener('load', alCargar); }
    };
  };
})();
