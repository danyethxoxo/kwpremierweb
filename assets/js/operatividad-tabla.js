(function () {
  'use strict';
  var pintarAnterior = window.pintar;
  var activo = null;
  var error = document.createElement('div');
  error.className = 'operatividad-error'; error.setAttribute('role','alert'); error.hidden = true;
  document.getElementById('caja').before(error);
  function avisar(texto) { error.textContent=texto || '';error.hidden=!texto; }
  function editorCelda(td,f,c) {
    if (activo) return;
    var control=document.createElement(c.tipo==='opciones'?'select':'input');
    if(c.tipo==='opciones') {
      var opciones=[''].concat(c.opciones || []);
      if(f[c.col] && !opciones.includes(f[c.col])) opciones.push(f[c.col]);
      opciones.forEach(function(v){var op=new Option(v || 'Sin definir',v);control.add(op);});
    } else { control.type=c.tipo==='fecha'?'date':window.esNumerica(c)?'number':'text';if(control.type==='number')control.step='0.01'; }
    control.value=f[c.col]==null?'':f[c.col];control.setAttribute('aria-label',c.titulo);
    td.replaceChildren(control);activo=control;control.focus();
    if(control.select && control.type!=='date')control.select();
    var terminado=false;
    function cancelar(){if(terminado)return;terminado=true;activo=null;window.pintar();}
    async function guardarCelda(){
      if(terminado)return;
      var valor=control.value.trim();valor=valor===''?null:window.esNumerica(c)?Number(valor):valor;
      if(valor===f[c.col] || (valor==null && f[c.col]==null)){cancelar();return;}
      if(window.esNumerica(c) && valor!=null && !Number.isFinite(valor)){avisar('Introduce un número válido.');control.focus();return;}
      terminado=true;control.disabled=true;td.setAttribute('aria-busy','true');
      try {
        var datos={};datos[c.col]=valor;
        var res=await window.kwSupabase.from('operatividad').update(datos).eq('id',f.id).select('id');
        if(res.error)throw res.error;if(!res.data || !res.data.length)throw Error('No se guardó el cambio. Revisa tus permisos.');
        f[c.col]=valor;avisar('');
      }catch(e){avisar(e.message || 'No se pudo guardar el campo.');}
      finally{activo=null;window.pintar();}
    }
    control.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();cancelar();}if(e.key==='Enter'){e.preventDefault();guardarCelda();}});
    control.addEventListener('blur',guardarCelda);
    if(c.tipo==='opciones')control.addEventListener('change',guardarCelda);
  }
  window.pintar=function(){
    if(activo)return;
    pintarAnterior();
    var tabla=document.querySelector('.operatividad-tabla');if(!tabla)return;
    tabla.querySelector('thead tr').insertAdjacentHTML('beforeend','<th class="operatividad-acciones-col">Enlaces / acciones</th>');
    tabla.querySelectorAll('tbody tr').forEach(function(original){
      // Sustituir el nodo retira el antiguo clic que abría el formulario.
      var tr=original.cloneNode(true);original.replaceWith(tr);
      var f=window.filas.find(function(x){return x.id===tr.dataset.id;});
      Array.from(tr.cells).forEach(function(td,i){
        var c=window.COLUMNAS[i];td.tabIndex=0;td.classList.add('celda-editable');td.setAttribute('aria-label','Editar '+c.titulo);td.title='Editar '+c.titulo;
        td.addEventListener('click',function(){editorCelda(td,f,c);});
        td.addEventListener('keydown',function(e){if(e.target===td && (e.key==='Enter'||e.key===' ')){e.preventDefault();editorCelda(td,f,c);}});
      });
      var acciones=document.createElement('td');acciones.className='operatividad-acciones-col';
      var caja=document.createElement('div');caja.className='operatividad-acciones-fila';acciones.append(caja);
      ['contrato','dictamen','propiedad'].forEach(function(tipo){
        var tiene=tipo==='contrato'?f.documento_id:tipo==='dictamen'?f.dictamen_id:f.propiedad_id;
        var b=document.createElement('button');b.type='button';b.className='operatividad-enlazar';b.textContent=(tiene?'Ver ':'Enlazar ')+tipo.charAt(0).toUpperCase()+tipo.slice(1);
        b.addEventListener('click',function(){tiene?verOrigen(f,tipo):enlazar(f,tipo);});caja.append(b);
      });
      var menuBoton=document.createElement('button');menuBoton.type='button';menuBoton.className='kw-btn-icono';menuBoton.setAttribute('aria-label','Opciones de captación');menuBoton.setAttribute('aria-haspopup','menu');menuBoton.setAttribute('aria-expanded','false');menuBoton.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>';
      caja.append(menuBoton);
      menuBoton.addEventListener('click',function(e){e.stopPropagation();mostrarMenu(menuBoton,f,tr);});tr.append(acciones);
    });
  };
  function verOrigen(f,tipo){
    var rutas={acuerdo_renta:'/documentos/contratos/renta.html',contrato_profeco:'/documentos/contratos/profeco.html',contrato_comercial:'/documentos/contratos/comercial.html'};
    var url=tipo==='dictamen'?'/hub/dictamenes.html?editar='+encodeURIComponent(f.dictamen_id):tipo==='propiedad'?f.propiedad && (f.propiedad.enlace_kw || 'https://www.kwmexico.mx/propiedades/'+encodeURIComponent(f.propiedad.fuente_id)):rutas[f.documento_tipo] && rutas[f.documento_tipo]+'?doc='+encodeURIComponent(f.documento_id);
    if(url)window.open(url,'_blank','noopener,noreferrer');else avisar('No está disponible el enlace del documento.');
  }
  var menuAbierto=null;
  function cerrarMenu(){if(menuAbierto){menuAbierto.boton.setAttribute('aria-expanded','false');menuAbierto.el.remove();menuAbierto=null;}}
  function mostrarMenu(boton,f,tr){
    if(menuAbierto && menuAbierto.boton===boton){cerrarMenu();return;}cerrarMenu();
    var menu=document.createElement('div');menu.className='kw-menu operatividad-menu';menu.setAttribute('role','menu');
    function opcion(texto,fn){var b=document.createElement('button');b.type='button';b.className='kw-menu-op';b.setAttribute('role','menuitem');b.textContent=texto;b.addEventListener('click',function(){cerrarMenu();fn();});menu.append(b);}
    opcion('Editar en la tabla',function(){tr.cells[0].click();});
    ['contrato','dictamen','propiedad'].forEach(function(t){opcion('Cambiar '+t+' enlazado',function(){enlazar(f,t);});});
    opcion(f.archivado_at?'Restaurar captación':'Archivar captación',async function(){
      try{var r=await window.kwSupabase.from('operatividad').update({archivado_at:f.archivado_at?null:new Date().toISOString()}).eq('id',f.id).select('id');if(r.error)throw r.error;if(!r.data || !r.data.length)throw Error('No se guardó el cambio.');await window.cargar();}catch(e){avisar(e.message);}
    });
    document.body.append(menu);menu.hidden=false;window.kwUI.colgarMenu(boton,menu);boton.setAttribute('aria-expanded','true');menuAbierto={el:menu,boton:boton};menu.querySelector('button').focus();
  }
  document.addEventListener('click',function(e){if(menuAbierto && !menuAbierto.el.contains(e.target))cerrarMenu();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')cerrarMenu();});
  document.getElementById('caja').addEventListener('scroll',cerrarMenu);
  var dialogo=null;
  async function enlazar(f,tipo){
    cerrarMenu();if(dialogo)dialogo.remove();
    var overlay=document.createElement('div');overlay.className='modal-overlay operatividad-enlace-modal';
    overlay.innerHTML='<section class="modal-box" role="dialog" aria-modal="true" aria-labelledby="enlace-titulo"><h3 id="enlace-titulo"></h3><input type="search" aria-label="Buscar registro" placeholder="Buscar por nombre, folio o dirección"><div class="operatividad-enlace-lista" aria-busy="true"><div class="kw-loader" role="status" aria-label="Cargando"><div class="circle uno"></div><div class="circle dos"></div><div class="circle tres"></div></div></div><p role="alert" class="enlace-error"></p><div class="modal-actions"><button type="button" class="btn-modal-cancelar">Cancelar</button></div></section>';
    overlay.querySelector('h3').textContent='Enlazar '+tipo;
    document.body.append(overlay);dialogo=overlay;
    function cerrar(){overlay.remove();if(dialogo===overlay)dialogo=null;}
    overlay.querySelector('.btn-modal-cancelar').onclick=cerrar;
    overlay.addEventListener('click',function(e){if(e.target===overlay)cerrar();});
    overlay.addEventListener('keydown',function(e){if(e.key==='Escape')cerrar();});
    var input=overlay.querySelector('input');input.focus();
    var lista=overlay.querySelector('.operatividad-enlace-lista'),msg=overlay.querySelector('.enlace-error');
    try {
      var res=await window.kwSupabase.rpc('operatividad_opciones_enlace',{p_tipo:tipo});if(res.error)throw res.error;
      var opciones=res.data || [];
      function pintarOpciones(){
        lista.replaceChildren();lista.setAttribute('aria-busy','false');
        var q=input.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
        var filtradas=opciones.filter(function(o){return o.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q);});
        if(!filtradas.length){lista.textContent='No hay registros disponibles.';return;}
        filtradas.forEach(function(o){var b=document.createElement('button');b.type='button';b.textContent=o.nombre;b.onclick=async function(){
          lista.querySelectorAll('button').forEach(function(x){x.disabled=true;});msg.textContent='';
          try{var r=await window.kwSupabase.rpc('operatividad_enlazar',{p_id:f.id,p_tipo:tipo,p_origen:o.id});if(r.error)throw r.error;cerrar();await window.cargar();}
          catch(e){msg.textContent=e.message;lista.querySelectorAll('button').forEach(function(x){x.disabled=false;});}
        };lista.append(b);});
      }
      input.addEventListener('input',pintarOpciones);pintarOpciones();
    }catch(e){lista.replaceChildren();msg.textContent=e.message;}
  }
  var mostrarArchivados=false;
  var visiblesAnterior=window.visibles;
  window.visibles=function(){return visiblesAnterior().filter(function(f){return !!f.archivado_at===mostrarArchivados;});};
  var archivoBoton=document.createElement('button');archivoBoton.type='button';archivoBoton.className='filtro';archivoBoton.textContent='Archivadas';archivoBoton.setAttribute('aria-pressed','false');
  document.getElementById('filtros-tipo').append(archivoBoton);
  archivoBoton.onclick=function(){mostrarArchivados=!mostrarArchivados;archivoBoton.setAttribute('aria-pressed',String(mostrarArchivados));archivoBoton.textContent=mostrarArchivados?'Volver a captaciones':'Archivadas';window.pintar();};
  window.descargar=function(){
    window.kwXlsx.descargar({columnas:window.COLUMNAS.map(function(c){return [c.titulo,c.tipo==='fecha'?'fecha':c.tipo==='dinero'?'moneda':window.esNumerica(c)?'decimal':'texto',Math.max(12,Math.round(c.ancho/7)),function(f){return f[c.col];}];}),filas:window.visibles(),hoja:'Operatividad',archivo:'Operatividad-'+new Date().toISOString().slice(0,10)+'.xlsx'});
  };
  // El listener anterior apuntaba a la función CSV: reemplazarlo por Excel.
  var exportar=document.getElementById('btn-csv');var nuevo=exportar.cloneNode(true);exportar.replaceWith(nuevo);nuevo.querySelector('span').textContent='Descargar Excel';nuevo.onclick=function(){window.descargar();document.getElementById('engrane-menu').hidden=true;};
  window.pintar();
})();
