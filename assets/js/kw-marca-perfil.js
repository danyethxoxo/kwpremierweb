(function () {
  'use strict';
  var activo = false;
  var CAMPOS = 'nombre,apellido,email,foto_url,whatsapp,sitio_web';

  function normalizarSitio(valor) {
    var raw = String(valor || '').trim();
    if (!raw || /[\\\s]/.test(raw)) return null;
    try {
      var url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port ||
          !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.kw\.com$/i.test(url.hostname) || url.hostname === 'www.kw.com') return null;
      return 'https://' + url.hostname;
    } catch (error) { return null; }
  }

  function validar(telefono, sitio) {
    var numero = String(telefono || '').trim();
    if (!/^[+\d\s().-]+$/.test(numero) || !/^\d{10,15}$/.test(numero.replace(/\D/g, ''))) {
      throw new Error('Escribe un teléfono válido, con lada y de 10 a 15 dígitos.');
    }
    var web = normalizarSitio(sitio);
    if (!web) throw new Error('Escribe tu sitio de KW, por ejemplo cava.kw.com.');
    return { whatsapp: numero, sitio_web: web };
  }

  function completo(perfil) {
    if (!perfil || !perfil.foto_url) return false;
    try { validar(perfil.whatsapp, perfil.sitio_web); return true; } catch (error) { return false; }
  }

  async function guardar(client, id, valores, blob) {
    var cambios = validar(valores.whatsapp, valores.sitio_web);
    var actual = await client.auth.getSession();
    if (actual.error) throw actual.error;
    if (!actual.data || !actual.data.session || actual.data.session.user.id !== id) {
      throw new Error('Tu sesión cambió. Vuelve a iniciar sesión para guardar tus datos.');
    }
    var ruta = '';
    try {
      if (blob) {
        ruta = id + '/foto-marca-' + crypto.randomUUID() + '.jpg';
        var upload = await client.storage.from('perfiles').upload(ruta, blob, {
          upsert: false, contentType: 'image/jpeg', cacheControl: '3600'
        });
        if (upload.error) throw upload.error;
        cambios.foto_url = client.storage.from('perfiles').getPublicUrl(ruta).data.publicUrl;
      }
      var result = await client.from('profiles').update(cambios).eq('id', id).select(CAMPOS).single();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('No se pudieron guardar tus datos. Intenta nuevamente.');
      return result.data;
    } catch (error) {
      if (ruta) await client.storage.from('perfiles').remove([ruta]).catch(function () {});
      throw error;
    }
  }

  async function prepararFoto(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Selecciona una foto JPG, PNG o WebP.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Selecciona una foto de hasta 10 MB.');
    var url = URL.createObjectURL(file);
    try {
      var image = new Image();
      image.src = url;
      await image.decode();
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = 800;
      var ctx = canvas.getContext('2d');
      var lado = Math.min(image.naturalWidth, image.naturalHeight);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 800, 800);
      ctx.drawImage(image, (image.naturalWidth - lado) / 2, (image.naturalHeight - lado) / 2, lado, lado, 0, 0, 800, 800);
      return await new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('No se pudo preparar la foto.')); }, 'image/jpeg', .85);
      });
    } finally { URL.revokeObjectURL(url); }
  }

  function mostrar(client, session, perfil) {
    if (!document.getElementById('kw-marca-css')) {
      var css = document.createElement('link');
      css.id = 'kw-marca-css';
      css.rel = 'stylesheet';
      css.href = '/assets/css/kw-marca-perfil.css?v=20261003b';
      document.head.appendChild(css);
    }
    var dialog = document.createElement('dialog');
    dialog.className = 'kw-marca-dialog';
    dialog.setAttribute('aria-labelledby', 'kw-marca-titulo');
    dialog.innerHTML = '<form class="kw-marca-form">' +
      '<p class="kw-marca-eyebrow">TU PERFIL INMOBILIARIO</p><h2 id="kw-marca-titulo">Personaliza tus propiedades</h2>' +
      '<p class="kw-marca-intro">Tu foto y teléfono aparecerán en las fichas. Los links de propiedades usarán tu sitio de KW.</p>' +
      '<div class="kw-marca-identidad"><div class="kw-marca-foto"><span>Tu foto</span><img alt="Vista previa de tu foto" hidden></div>' +
      '<div><strong class="kw-marca-nombre"></strong><label class="kw-marca-subir">Elegir foto<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Elegir foto de perfil"></label>' +
      '<p class="kw-marca-ayuda">JPG, PNG o WebP. Hasta 10 MB.</p></div></div>' +
      '<label class="kw-marca-campo">Teléfono de contacto<input name="telefono" type="tel" autocomplete="tel" placeholder="+52 55 1234 5678" required maxlength="30"></label>' +
      '<label class="kw-marca-campo">Tu sitio de KW<input name="sitio" type="text" inputmode="url" autocomplete="url" placeholder="cava.kw.com" required maxlength="254"></label>' +
      '<p class="kw-marca-ayuda">Puedes editar estos datos después en Mi perfil.</p>' +
      '<p class="kw-marca-error" role="alert" hidden></p>' +
      '<div class="kw-marca-acciones"><button type="button" class="kw-marca-posponer">Ahora no</button><button type="submit" class="kw-marca-guardar">Guardar y continuar</button></div></form>';
    var form = dialog.querySelector('form');
    var file = dialog.querySelector('input[type="file"]');
    var img = dialog.querySelector('img');
    var estado = dialog.querySelector('.kw-marca-error');
    var boton = dialog.querySelector('.kw-marca-guardar');
    var posponer = dialog.querySelector('.kw-marca-posponer');
    var blob = null;
    var preparando = false;
    var preview = '';
    var versionFoto = 0;
    var ocupada = false;
    form.elements.telefono.value = perfil.whatsapp || '';
    form.elements.sitio.value = perfil.sitio_web || '';
    dialog.querySelector('.kw-marca-nombre').textContent = [perfil.nombre, perfil.apellido].filter(Boolean).join(' ');
    if (perfil.foto_url) { img.src = perfil.foto_url; img.hidden = false; }
    function error(texto) { estado.textContent = texto; estado.hidden = !texto; }
    function cerrar() {
      versionFoto++;
      if (preview) URL.revokeObjectURL(preview);
      dialog.close();
      dialog.remove();
      activo = false;
    }
    function omitir() {
      if (ocupada) return;
      try { sessionStorage.setItem(claveSesion(session), '1'); } catch (error) {}
      cerrar();
    }
    file.addEventListener('change', async function () {
      var version = ++versionFoto;
      preparando = true;
      boton.disabled = true;
      error('');
      try {
        var nueva = await prepararFoto(file.files[0]);
        if (version !== versionFoto) return;
        blob = nueva;
        if (preview) URL.revokeObjectURL(preview);
        preview = URL.createObjectURL(blob);
        img.src = preview;
        img.hidden = false;
      } catch (err) { if (version === versionFoto) error(err.message); }
      finally { if (version === versionFoto) { preparando = false; boton.disabled = false; } }
    });
    posponer.addEventListener('click', omitir);
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); omitir(); });
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (ocupada || preparando) return;
      error('');
      if (!blob && !perfil.foto_url) { error('Elige tu foto para personalizar las fichas.'); file.focus(); return; }
      ocupada = true;
      boton.disabled = posponer.disabled = file.disabled = true;
      boton.textContent = 'Guardando...';
      try {
        var saved = await guardar(client, session.user.id, { whatsapp: form.elements.telefono.value, sitio_web: form.elements.sitio.value }, blob);
        window.dispatchEvent(new CustomEvent('kw-marca-actualizada', { detail: { id: session.user.id, perfil: saved } }));
        cerrar();
      } catch (err) { error(err.message || 'No se pudo guardar. Intenta nuevamente.'); }
      finally { ocupada = false; boton.disabled = posponer.disabled = file.disabled = false; boton.textContent = 'Guardar y continuar'; }
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    if (!perfil.foto_url) file.focus();
    else if (!perfil.whatsapp) form.elements.telefono.focus();
    else form.elements.sitio.focus();
  }

  function claveSesion(session) {
    var key = session.user.id;
    try { key += ':' + JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id; } catch (error) {}
    return 'kw_marca_pospuesta:' + key;
  }

  async function iniciar() {
    if (activo || !window.kwSupabase || !document.documentElement.classList.contains('kw-auth-ok')) return;
    activo = true;
    try {
      var client = window.kwSupabase;
      var auth = await client.auth.getSession();
      var session = auth.data && auth.data.session;
      if (auth.error) throw auth.error;
      if (!session) { activo = false; return; }
      try { if (sessionStorage.getItem(claveSesion(session))) { activo = false; return; } } catch (error) {}
      var result = await client.from('profiles').select(CAMPOS).eq('id', session.user.id).single();
      if (result.error) throw result.error;
      if (!result.data || completo(result.data)) { activo = false; return; }
      mostrar(client, session, result.data);
    } catch (error) { activo = false; console.warn('No se pudo cargar la personalización del perfil.'); }
  }

  window.kwMarcaPerfil = { iniciar: iniciar, completo: completo, validar: validar, guardar: guardar };
  iniciar();
})();
