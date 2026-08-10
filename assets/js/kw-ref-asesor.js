// kw-ref-asesor.js
//
// El "link de catálogo" de cada asesor (propiedades.html?asesor=<id>,
// visto desde perfil.html): quien entra por ahí navega el mismo
// catálogo, pero mientras dure la marca, cualquier propiedad que abra
// le muestra a ESE asesor como contacto - así lo haga otro, o venga sin
// dueño porque llegó de otra oficina por Command.
//
// Es lo mismo que hacen los sitios tipo "nombre.kw.com": el link no
// cambia el catálogo, cambia a quién le llega el prospecto.
//
// Se usa en propiedades.html y propiedad.html; ambas cargan este
// archivo y llaman a las mismas funciones para no duplicar la lógica.
(function () {
  var CLAVE = 'kw_ref_asesor';

  function obtenerId() {
    try { return localStorage.getItem(CLAVE) || null; }
    catch (e) { return null; }
  }

  function guardarId(id) {
    try { localStorage.setItem(CLAVE, id); } catch (e) {}
  }

  function limpiar() {
    try { localStorage.removeItem(CLAVE); } catch (e) {}
  }

  // Si la URL trae ?asesor=, se valida contra perfiles_publicos (tiene
  // que ser un asesor real y visible) y se guarda para que persista
  // aunque la persona navegue a otra página. La URL se limpia después,
  // para que el link no se vea distinto al compartirlo de nuevo.
  //
  // Devuelve el perfil {id, nombre, apellido, ...} si logró marcar a
  // alguien (nuevo o ya guardado de antes), o null si no hay nadie.
  async function capturar(sb) {
    var params = new URLSearchParams(location.search);
    var deUrl = params.get('asesor');

    if (deUrl) {
      var r = await sb.from('perfiles_publicos').select('*').eq('id', deUrl).maybeSingle();
      if (r.data) {
        guardarId(deUrl);
        params.delete('asesor');
        var resto = params.toString();
        history.replaceState(null, '', location.pathname + (resto ? '?' + resto : '') + location.hash);
        return r.data;
      }
      // El id en la URL no sirvió (borrado, mal copiado): no se
      // sobreescribe una marca previa válida que ya hubiera guardada.
    }

    var guardado = obtenerId();
    if (!guardado) return null;
    var r2 = await sb.from('perfiles_publicos').select('*').eq('id', guardado).maybeSingle();
    if (!r2.data) { limpiar(); return null; }
    return r2.data;
  }

  window.kwRefAsesor = { capturar: capturar, limpiar: limpiar };
})();
