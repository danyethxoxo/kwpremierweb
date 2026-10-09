(function () {
  'use strict';
  let registros = [];
  let autorizado = false;
  let cargando = false;
  const tabla = document.getElementById('resenas-lista');
  const aviso = document.getElementById('resenas-aviso');
  const filtro = document.getElementById('filtro-estado');
  const buscador = document.getElementById('buscador-input');
  const esc = window.kwSecurity.escapeHtml;

  function render() {
    const q = buscador.value.trim().toLocaleLowerCase('es-MX');
    const lista = registros.filter(function (r) {
      return (!filtro.value || (r.aprobada ? 'publicada' : 'pendiente') === filtro.value) &&
        (!q || (r.nombre + ' ' + r.texto + ' ' + (r.rol || '')).toLocaleLowerCase('es-MX').includes(q));
    });
    document.querySelector('.kw-conteo-num').textContent = lista.length;
    tabla.innerHTML = lista.length ? lista.map(function (r) {
      const fecha = new Date(r.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' });
      return '<tr><td>' + esc(r.nombre) + (r.rol ? '<br><small>' + esc(r.rol) + '</small>' : '') +
        '</td><td class="resena-texto">' + esc(r.texto) + '</td><td>' + esc(r.estrellas) + '/5</td><td>' +
        (r.aprobada ? 'Publicada' : 'Pendiente') + '</td><td>' + esc(fecha) +
        '</td><td><button type="button" class="kw-menu-op" data-resena="' + esc(r.id) + '">' +
        (r.aprobada ? 'Retirar publicación' : 'Aprobar y publicar') + '</button></td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="kw-universal-vacio">No hay reseñas con estos filtros.</div></td></tr>';
  }

  async function cargar() {
    if (!autorizado || cargando) return;
    cargando = true;
    aviso.hidden = true;
    tabla.innerHTML = '<tr><td colspan="6"><div class="kw-loader" role="status" aria-label="Cargando reseñas"><div class="circle uno"></div><div class="circle dos"></div><div class="circle tres"></div></div></td></tr>';
    document.getElementById('btn-nuevo').disabled = true;
    try {
      const todas = [];
      // Paginar evita ocultar pendientes cuando se rebasa el limite del API.
      for (let desde = 0; ; desde += 100) {
        const res = await window.kwSupabase.from('resenas').select('id,nombre,texto,estrellas,rol,aprobada,created_at')
          .order('created_at', { ascending: false }).order('id', { ascending: false }).range(desde, desde + 99);
        if (res.error) throw res.error;
        todas.push(...(res.data || []));
        if (!res.data || res.data.length < 100) break;
      }
      registros = todas;
      render();
    } catch (e) {
      tabla.innerHTML = '';
      aviso.textContent = 'No se pudieron cargar las reseñas. Pulsa Actualizar para reintentar.';
      aviso.hidden = false;
    } finally {
      cargando = false;
      document.getElementById('btn-nuevo').disabled = false;
    }
  }

  tabla.addEventListener('click', async function (event) {
    const boton = event.target.closest('[data-resena]');
    if (!boton || boton.disabled || !autorizado) return;
    const registro = registros.find(function (r) { return r.id === boton.dataset.resena; });
    if (!registro) return;
    const publicar = !registro.aprobada;
    if (!window.confirm(publicar ? '¿Publicar la reseña de ' + registro.nombre + ' en la página de inicio?' : '¿Retirar esta reseña de la página pública? Se conservará como pendiente.')) return;
    boton.disabled = true;
    aviso.hidden = true;
    try {
      const res = await window.kwSupabase.from('resenas').update({ aprobada: publicar })
        .eq('id', registro.id).eq('aprobada', registro.aprobada).select('id,aprobada').single();
      if (res.error || !res.data || res.data.aprobada !== publicar) throw res.error || new Error('No se confirmó el cambio');
      registro.aprobada = res.data.aprobada;
      render();
      aviso.textContent = publicar ? 'Reseña publicada.' : 'Publicación retirada. La reseña sigue guardada.';
      aviso.hidden = false;
    } catch (e) {
      aviso.textContent = 'No se pudo confirmar el cambio. Actualiza el listado y vuelve a intentar.';
      aviso.hidden = false;
      boton.disabled = false;
    }
  });
  filtro.addEventListener('change', function () { if (!cargando) render(); });
  buscador.addEventListener('input', function () { if (!cargando) render(); });
  document.querySelectorAll('[data-actualizar-resenas], #btn-nuevo').forEach(function (b) { b.addEventListener('click', iniciar); });

  async function iniciar() {
    try {
      const user = await window.kwSupabase.auth.getUser();
      if (user.error || !user.data.user) throw new Error('Sin sesión');
      const perfil = await window.kwSupabase.from('profiles').select('role').eq('id', user.data.user.id).single();
      if (perfil.error) throw perfil.error;
      if (!perfil.data || !['master', 'admin', 'staff'].includes(perfil.data.role)) {
        autorizado = false;
        tabla.innerHTML = '';
        aviso.textContent = 'Tu cuenta no tiene permiso para gestionar reseñas.';
        aviso.hidden = false;
        document.getElementById('btn-nuevo').hidden = true;
        return;
      }
      autorizado = true;
      await cargar();
    } catch (e) {
      aviso.textContent = 'No se pudieron comprobar tus permisos. Pulsa Actualizar para reintentar.';
      aviso.hidden = false;
    }
  }
  if (document.documentElement.classList.contains('kw-auth-ok')) iniciar();
  else window.addEventListener('kw-auth-ready', iniciar, { once: true });
})();
