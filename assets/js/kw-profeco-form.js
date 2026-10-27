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
    const grupos = {
      'f-car-bodega-aplica': ['f-car-bodega'],
      'f-car-cuota-aplica': ['f-car-cuota', 'f-car-cuota-divisa'],
      'f-hip-gravamen': ['f-hip-acreedor', 'f-hip-importe', 'f-hip-mensualidad', 'f-hip-plazo', 'f-hip-estatus'],
      'f-suc-aplica': ['f-suc-herederos', 'f-suc-albacea', 'f-suc-estatus', 'f-suc-restricciones'],
      'f-jui-proceso': ['f-jui-tipo', 'f-jui-usufructo', 'f-jui-embargo']
    };
    Object.entries(grupos).forEach(([id, campos]) => {
      const control = porId(id), aplica = control?.value === 'SI';
      campos.forEach(id => {
        const el = porId(id), campo = el?.closest('.acuerdo-field');
        if (!campo) return;
        campo.hidden = !aplica;
        if (borrar === control && !aplica) {
          el.value = id.endsWith('-divisa') ? 'MXN' : '';
          if (el.tagName === 'SELECT') el.dispatchEvent(new Event('change', {bubbles:true}));
        }
      });
    });
    document.querySelectorAll('#acuerdos-form-col .acuerdo-duo').forEach(fila => {
      const campos = Array.from(fila.children).filter(el => el.classList.contains('acuerdo-field'));
      fila.hidden = campos.length > 0 && campos.every(el => el.hidden);
    });
    const etiqueta = document.querySelector('label[for="f-car-area-libre"]');
    if (etiqueta) etiqueta.textContent = 'Área libre (' + (porId('f-car-area-libre-unidad')?.value || '%') + ')';
  }
  function fechas() {
    document.querySelectorAll('[data-profeco-fecha]').forEach(input => {
      if (input.dataset.fechaLista) return;
      input.dataset.fechaLista = '1';
      const caja = document.createElement('div');
      caja.className = 'kw-fecha-partes'; caja.dataset.profecoFechaPartes = '';
      const etiqueta = input.closest('.acuerdo-field').querySelector('label').textContent;
      const partes = ['Día', 'Mes', 'Año'].map((nombre, i) => {
        const select = document.createElement('select');
        select.id = input.id + ['-dia', '-mes', '-ano'][i];
        select.setAttribute('aria-label', nombre + ' de ' + etiqueta);
        select.add(new Option(nombre, ''));
        caja.appendChild(select); return select;
      });
      const [dia, mes, ano] = partes;
      ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].forEach((nombre, i) => mes.add(new Option(nombre, String(i+1).padStart(2,'0'))));
      for (let y = new Date().getFullYear() + 20; y >= 1900; y--) ano.add(new Option(String(y), String(y)));
      function dias() {
        const anterior = dia.value;
        const total = mes.value ? new Date(Number(ano.value || 2000), Number(mes.value), 0).getDate() : 31;
        while (dia.options.length > 1) dia.remove(1);
        for (let d=1; d<=total; d++) dia.add(new Option(String(d), String(d).padStart(2,'0')));
        dia.value = Number(anterior) <= total ? anterior : '';
      }
      let sincronizando = false;
      function refrescarPartes() {
        sincronizando = true;
        try { partes.forEach(select => select.dispatchEvent(new Event('change', {bubbles:true}))); }
        finally { sincronizando = false; }
      }
      function pintar(valor) {
        const p = String(valor || '').split('-');
        if (p[0] && !Array.from(ano.options).some(op => op.value === p[0])) ano.add(new Option(p[0], p[0]));
        ano.value = p[0] || ''; mes.value = p[1] || ''; dias(); dia.value = p[2] || '';
        refrescarPartes();
      }
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      Object.defineProperty(input, 'value', {configurable:true, get() {return descriptor.get.call(this);}, set(valor) {descriptor.set.call(this, valor); pintar(valor);}});
      partes.forEach(select => select.addEventListener('change', () => {
        if (sincronizando) return;
        dias();
        refrescarPartes();
        descriptor.set.call(input, ano.value && mes.value && dia.value ? [ano.value,mes.value,dia.value].join('-') : '');
        input.dispatchEvent(new Event('change', {bubbles:true}));
      }));
      input.after(caja); global.kwUI?.selects(caja); pintar(input.value);
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
    const ancho = Math.min(caja.closest('.kw-fecha-partes') ? Math.max(124, r.width) : r.width, innerWidth - 16);
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
    fechas();
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
    ['f-nec-precio-compra-divisa', 'f-nec-inversion-divisa', 'f-car-cuota-divisa'].forEach(id => { if (!datos[id]) datos[id] = 'MXN'; });
    const inferir = (control, campos) => {
      if (!(control in datos)) datos[control] = campos.some(id => String(datos[id] || '').trim()) ? 'SI' : '';
    };
    inferir('f-car-bodega-aplica', ['f-car-bodega']);
    inferir('f-car-cuota-aplica', ['f-car-cuota']);
    inferir('f-suc-aplica', ['f-suc-herederos', 'f-suc-albacea', 'f-suc-estatus', 'f-suc-restricciones']);
    if (!datos['f-hip-gravamen'] && ['acreedor','importe','mensualidad','plazo','estatus'].some(id => datos['f-hip-' + id])) datos['f-hip-gravamen'] = 'SI';
    if (!datos['f-jui-proceso'] && ['tipo','usufructo','embargo'].some(id => datos['f-jui-' + id])) datos['f-jui-proceso'] = 'SI';
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
  global.kwProfecoForm = {refrescar, clientes, leer, prepararDatos, menus, fechas};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window);
