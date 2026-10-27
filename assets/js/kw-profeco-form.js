(function (global) {
  'use strict';
  const porId = id => document.getElementById(id);
  const condicionales = ['frente', 'fondo', 'roof', 'jardin', 'patio'];
  function selector(nombre) { return porId('f-car-' + nombre + (['frente', 'fondo'].includes(nombre) ? '-aplica' : '')); }
  function medida(nombre) { return porId('f-car-' + nombre + (['frente', 'fondo'].includes(nombre) ? '' : '-m2')); }
  function actualizarCondicionales(borrar) {
    condicionales.forEach(nombre => {
      const el = medida(nombre), control = selector(nombre);
      if (!el || !control) return;
      const aplica = control.value === 'SI' || (nombre === 'patio' && control.value && !['NO', 'NO APLICA'].includes(control.value));
      el.closest('.acuerdo-field').hidden = !aplica;
      if (borrar === control && !aplica) el.value = '';
    });
  }
  function identificacion(i, cambio) {
    const tipo = porId('f-cli' + i + '-idtipo')?.value;
    const entidad = porId('f-cli' + i + '-identidad');
    const numero = porId('f-cli' + i + '-idnum');
    if (!entidad || !numero) return;
    const emisores = {INE: 'Instituto Nacional Electoral', PASAPORTE: 'Secretaría de Relaciones Exteriores (SRE)'};
    if (emisores[tipo] && (cambio || !entidad.value.trim())) entidad.value = emisores[tipo];
    else if (cambio && Object.values(emisores).includes(entidad.value)) entidad.value = '';
    if (tipo === 'INE') {
      const pos = numero.selectionStart;
      const anterior = numero.value;
      numero.value = 'IDMEX' + anterior.replace(/^IDMEX/i, '').replace(/\D/g, '');
      numero.inputMode = 'numeric';
      if (document.activeElement === numero && pos != null) {
        const cursor = Math.max(5, Math.min(numero.value.length, pos + (anterior.toUpperCase().startsWith('IDMEX') ? 0 : 5)));
        numero.setSelectionRange(cursor, cursor);
      }
    } else {
      numero.inputMode = 'text';
      if (cambio) numero.value = numero.value.replace(/^IDMEX/i, '');
    }
  }
  function clientes() {
    document.querySelectorAll('#clientes-fields select[id$="-idtipo"]').forEach(el => identificacion(el.id.match(/cli(\d+)/)[1], false));
  }
  function colocarMenu(caja) {
    const menu = caja.querySelector('.kw-select-menu');
    if (!menu?.showPopover) return;
    if (!caja.classList.contains('abierto')) { if (menu.matches(':popover-open')) menu.hidePopover(); return; }
    if (!menu.matches(':popover-open')) menu.showPopover();
    const r = caja.querySelector('.kw-select-btn').getBoundingClientRect();
    const ancho = Math.min(r.width, innerWidth - 16);
    const abajo = innerHeight - r.bottom - 12, arriba = r.top - 12;
    const haciaArriba = abajo < Math.min(menu.scrollHeight, 300) && arriba > abajo;
    menu.style.cssText = 'position:fixed;inset:auto;margin:0;bottom:auto;right:auto;transform:none;box-sizing:border-box;width:' + ancho + 'px;min-width:0;max-width:calc(100vw - 16px);max-height:' + Math.max(40, Math.min(300, haciaArriba ? arriba : abajo)) + 'px;left:' + Math.max(8, Math.min(r.left, innerWidth - ancho - 8)) + 'px;';
    menu.style.top = (haciaArriba ? r.top - menu.offsetHeight - 6 : r.bottom + 6) + 'px';
  }
  function menus() {
    document.querySelectorAll('#acuerdos-form-col .kw-select:not([data-profeco-menu])').forEach(caja => {
      caja.dataset.profecoMenu = '1';
      const menu = caja.querySelector('.kw-select-menu');
      if (!menu?.showPopover) return;
      menu.setAttribute('popover', 'manual');
      new MutationObserver(() => colocarMenu(caja)).observe(caja, {attributes:true, attributeFilter:['class']});
    });
  }
  function formatear(el) { el.dataset.kwDecimales = 'todos'; global.kwDocumentosCampos.formatear(el); }
  function refrescar() {
    document.querySelectorAll('#acuerdos-form-col [data-kw-miles]').forEach(el => {
      if (/^[\d,.]+$/.test(el.value)) formatear(el);
    });
    actualizarCondicionales();
    clientes();
    menus();
  }
  function leer(el) {
    if (!el || el.closest('.acuerdo-field[hidden]')) return '';
    return el.hasAttribute('data-kw-miles') ? el.value.replace(/,/g, '') : el.value || '';
  }
  function prepararDatos(original) {
    const datos = {...original};
    if (!datos['f-con-divisa']) datos['f-con-divisa'] = 'MXN';
    ['niveles', 'pisos', 'viviendas', 'recamaras', 'estacionamientos'].forEach(nombre => {
      const id = 'f-car-' + nombre, el = porId(id), valor = String(datos[id] ?? '');
      // Conservar textos de borradores que antes permitian captura libre.
      if (el) el.type = valor && !/^\d+(?:\.\d+)?$/.test(valor.replace(/,/g, '')) ? 'text' : 'number';
      if (el?.type === 'number') datos[id] = valor.replace(/,/g, '');
    });
    ['frente', 'fondo'].forEach(nombre => {
      const id = 'f-car-' + nombre;
      if (!(id + '-aplica' in datos)) datos[id + '-aplica'] = datos[id] ? (/^NO(?: APLICA)?$/i.test(datos[id]) ? 'NO APLICA' : 'SI') : '';
    });
    // Los borradores anteriores capturaban patio como texto libre.
    const patio = porId('f-car-patio');
    patio?.querySelectorAll('[data-anterior]').forEach(op => op.remove());
    if (datos['f-car-patio'] && patio && !Array.from(patio.options).some(op => op.value === datos['f-car-patio'])) {
      const opcion = new Option(datos['f-car-patio'], datos['f-car-patio']);
      opcion.dataset.anterior = '1'; patio.add(opcion);
    }
    if (!datos['f-car-area-libre-unidad']) {
      const area = String(datos['f-car-area-libre'] || '');
      datos['f-car-area-libre-unidad'] = /m\s*[2²]/i.test(area) ? 'm²' : '%';
      datos['f-car-area-libre'] = area.replace(/\s*(?:m\s*[2²]|%)\s*$/i, '').trim();
    }
    return datos;
  }
  function iniciar() {
    document.querySelectorAll('.acuerdo-grupo').forEach((grupo, i) => {
      const cuerpo = grupo.querySelector('.acuerdo-grupo-cuerpo'), titulo = grupo.querySelector('summary');
      if (!cuerpo || !titulo || cuerpo.querySelector('[data-contraer-grupo]')) return;
      if (!cuerpo.id) cuerpo.id = 'profeco-apartado-' + i;
      const boton = document.createElement('button');
      boton.type = 'button'; boton.className = 'kw-grupo-contraer'; boton.dataset.contraerGrupo = '';
      boton.setAttribute('aria-label', 'Contraer ' + titulo.textContent.trim());
      boton.setAttribute('title', 'Contraer apartado'); boton.setAttribute('aria-controls', cuerpo.id);
      boton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
      boton.onclick = () => { grupo.open = false; titulo.focus({preventScroll: true}); titulo.scrollIntoView({block: 'nearest'}); };
      const cierre = document.createElement('div'); cierre.className = 'kw-grupo-cierre';
      cierre.appendChild(boton); cuerpo.appendChild(cierre);
    });
    refrescar();
  }
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.matches('#acuerdos-form-col [data-kw-miles]')) formatear(el);
    const cliente = el.id?.match(/^f-cli(\d+)-idnum$/);
    if (cliente) identificacion(cliente[1], false);
  }, true);
  document.addEventListener('change', e => {
    const cliente = e.target.id?.match(/^f-cli(\d+)-idtipo$/);
    if (cliente) identificacion(cliente[1], true);
    actualizarCondicionales(e.target);
  }, true);
  document.addEventListener('scroll', e => { if (!e.target.closest?.('.kw-select-menu')) document.querySelectorAll('#acuerdos-form-col .kw-select.abierto').forEach(colocarMenu); }, true);
  global.addEventListener('resize', () => document.querySelectorAll('#acuerdos-form-col .kw-select.abierto').forEach(colocarMenu));
  global.kwProfecoForm = {refrescar, clientes, leer, prepararDatos, menus};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window);
