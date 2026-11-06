(function(global){
  'use strict';
  function fechas() {
    document.querySelectorAll('[data-kw-fecha]').forEach(input => {
      if (input.dataset.fechaLista) return;
      input.dataset.fechaLista = '1';
      const caja = document.createElement('div');
      caja.className = 'kw-fecha-partes'; caja.dataset.kwFechaPartes = ''; caja.dataset.fechaId = input.id;
      const etiqueta = input.closest('.acuerdo-field').querySelector('label').textContent;
      const partes = ['DD', 'MM', 'AAAA'].map((nombre, i) => {
        const select = document.createElement('select');
        select.id = input.id + ['-dia', '-mes', '-ano'][i];
        select.dataset.kwMenuAnchoMin = '124';
        select.setAttribute('aria-label', ['Día', 'Mes', 'Año'][i] + ' de ' + etiqueta);
        select.add(new Option(nombre, ''));
        caja.appendChild(select); return select;
      });
      const [dia, mes, ano] = partes;
      ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].forEach((nombre, i) => mes.add(new Option(String(i+1).padStart(2,'0'), String(i+1).padStart(2,'0'))));
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
      input.after(caja); global.kwUI?.selects(caja);
      partes.forEach(select => global.kwSelectBusqueda?.preparar(select));
      pintar(input.value);
    });
  }

  function sincronizarBloqueos(){
    document.querySelectorAll('[data-kw-fecha]').forEach(input=>{
      const caja=document.querySelector('[data-kw-fecha-partes][data-fecha-id="'+input.id+'"]');
      if(!caja)return;
      caja.querySelectorAll('select').forEach(select=>{select.disabled=input.disabled;});
    });
  }
  global.kwFechasPartes={fechas,sincronizarBloqueos};
  function iniciar(){fechas();sincronizarBloqueos();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);
  else iniciar();
})(window);
