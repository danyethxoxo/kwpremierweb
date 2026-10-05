(function () {
  'use strict';
  var pintarAnterior = window.pintar;
  var activo = null;
  var cancelarActivo = null;
  var cerrarPendiente = null;
  var error = document.createElement('div');
  error.className = 'operatividad-error'; error.setAttribute('role','alert'); error.hidden = true;
  document.getElementById('caja').before(error);
  function avisar(texto) { error.textContent=texto || '';error.hidden=!texto; }
  function editorCelda(td,f,c) {
    if(cerrarPendiente)cerrarPendiente(false);
    if(td.querySelector('.cerrando'))return;
    if (activo) { if(td.contains(activo) || activo.disabled)return;cancelarActivo(true); }
    var contenidoAnterior=td.innerHTML;
    var indice=td.cellIndex,columna=Array.from(td.closest('table').rows).map(function(fila){return fila.cells[indice];}).filter(Boolean);
    var anchosOriginales=columna.map(function(celda){return {el:celda,min:celda.style.minWidth,max:celda.style.maxWidth,width:celda.style.width};});
    var tabla=td.closest('table');
    if(!tabla.dataset.anchosBase)tabla.dataset.anchosBase=JSON.stringify(Array.from(tabla.rows[0].cells).map(function(celda){return celda.getBoundingClientRect().width;}));
    var anchoBase=JSON.parse(tabla.dataset.anchosBase)[indice];
    function anchoColumna(ancho){columna.forEach(function(celda){celda.style.width=ancho+'px';celda.style.minWidth=ancho+'px';celda.style.maxWidth=ancho+'px';});}
    var anchoEditor=Math.max(anchoBase+60,232);
    anchoColumna(anchoBase);requestAnimationFrame(function(){if(!terminado && editor.isConnected)anchoColumna(anchoEditor);});
    var control=document.createElement(c.tipo==='opciones'?'select':'input');
    if(c.tipo==='opciones') {
      var opciones=[''].concat(c.opciones || []);
      if(f[c.col] && !opciones.includes(f[c.col])) opciones.push(f[c.col]);
      opciones.forEach(function(v){var op=new Option(v || 'Sin definir',v);control.add(op);});
    } else { control.type=c.tipo==='fecha'?'date':window.esNumerica(c)?'number':'text';if(control.type==='number')control.step='0.01'; }
    control.value=f[c.col]==null?'':f[c.col];control.setAttribute('aria-label',c.titulo);
    var editor=document.createElement('div');editor.className='operatividad-celda-editor';
    editor.style.width=(anchoEditor-28)+'px';
    var confirmar=document.createElement('button');confirmar.type='button';confirmar.className='celda-confirmar';confirmar.setAttribute('aria-label','Confirmar cambio');confirmar.title='Confirmar cambio';confirmar.textContent='✓';
    var limpiar=document.createElement('button');limpiar.type='button';limpiar.className='celda-limpiar';limpiar.setAttribute('aria-label','Borrar contenido');limpiar.title='Borrar contenido';limpiar.textContent='×';
    confirmar.innerHTML='<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg>';
    limpiar.innerHTML='<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>';
    editor.append(control,confirmar,limpiar);td.replaceChildren(editor);activo=control;
    editor.addEventListener('click',function(e){e.stopPropagation();});
    var cerrarDesplegable=function(){};
    if(c.tipo==='opciones') {
      control.dataset.kwNo='1';control.hidden=true;
      var cajaSelect=document.createElement('div');cajaSelect.className='kw-select';
      var botonSelect=document.createElement('button');botonSelect.type='button';botonSelect.className='kw-select-btn';botonSelect.setAttribute('aria-label',c.titulo);botonSelect.setAttribute('aria-haspopup','listbox');botonSelect.setAttribute('aria-expanded','false');
      var valorSelect=document.createElement('span');valorSelect.className='kw-select-valor';
      var flecha=document.createElementNS('http://www.w3.org/2000/svg','svg');flecha.setAttribute('viewBox','0 0 24 24');flecha.classList.add('kw-select-flecha');flecha.innerHTML='<path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
      botonSelect.append(valorSelect,flecha);control.before(cajaSelect);cajaSelect.append(control,botonSelect);
      var menuSelect=null;
      function pintarValorSelect(){valorSelect.textContent=control.selectedOptions[0].textContent;valorSelect.classList.toggle('vacio',!control.value);}
      function scrollSelect(e){if(menuSelect && !menuSelect.contains(e.target))cerrarDesplegable();}
      cerrarDesplegable=function(){if(menuSelect){menuSelect.remove();menuSelect=null;}botonSelect.setAttribute('aria-expanded','false');cajaSelect.classList.remove('abierto');document.removeEventListener('pointerdown',fueraSelect);window.removeEventListener('resize',cerrarDesplegable);document.removeEventListener('scroll',scrollSelect,true);};
      function fueraSelect(e){if(menuSelect && !menuSelect.contains(e.target) && !botonSelect.contains(e.target))cerrarDesplegable();}
      function abrirDesplegable(){
        if(menuSelect){cerrarDesplegable();return;}
        menuSelect=document.createElement('div');menuSelect.className='kw-select-menu operatividad-select-menu';menuSelect.setAttribute('role','listbox');menuSelect.setAttribute('aria-label',c.titulo);
        Array.from(control.options).forEach(function(op){var b=document.createElement('button');b.type='button';b.className='kw-select-opcion'+(op.selected?' elegida':'');b.setAttribute('role','option');b.setAttribute('aria-selected',String(op.selected));b.textContent=op.textContent;b.onclick=function(){control.value=op.value;pintarValorSelect();cerrarDesplegable();botonSelect.focus();};menuSelect.append(b);});
        document.body.append(menuSelect);var r=botonSelect.getBoundingClientRect();var alto=Math.min(menuSelect.scrollHeight,240),arriba=innerHeight-r.bottom<alto+12 && r.top>innerHeight-r.bottom;
        menuSelect.style.width=Math.min(Math.max(r.width,190),innerWidth-24)+'px';menuSelect.style.left=Math.max(12,Math.min(r.left,innerWidth-menuSelect.offsetWidth-12))+'px';menuSelect.style.maxHeight=Math.max(60,Math.min(240,arriba?r.top-12:innerHeight-r.bottom-12))+'px';menuSelect.style.top=arriba?'auto':r.bottom+5+'px';menuSelect.style.bottom=arriba?innerHeight-r.top+5+'px':'auto';
        botonSelect.setAttribute('aria-expanded','true');cajaSelect.classList.add('abierto');
        document.addEventListener('pointerdown',fueraSelect);window.addEventListener('resize',cerrarDesplegable);document.addEventListener('scroll',scrollSelect,true);
        menuSelect.addEventListener('scroll',function(e){e.stopPropagation();});
        menuSelect.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();cerrarDesplegable();botonSelect.focus();}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();var opciones=Array.from(menuSelect.children),i=opciones.indexOf(document.activeElement);opciones[(i+(e.key==='ArrowDown'?1:-1)+opciones.length)%opciones.length].focus();}});
        (menuSelect.querySelector('[aria-selected="true"]') || menuSelect.firstChild).focus();
      }
      pintarValorSelect();botonSelect.onclick=abrirDesplegable;
      botonSelect.addEventListener('keydown',function(e){if(e.key==='ArrowDown'){e.preventDefault();abrirDesplegable();}});
    }
    if(window.kwUI)window.kwUI.iniciar(editor);
    (editor.querySelector('.kw-select-btn') || control).focus();
    if(control.select && control.type!=='date')control.select();
    requestAnimationFrame(function(){
      if(!editor.isConnected || td.classList.contains('col-fija'))return;
      var marco=document.getElementById('caja'),acciones=td.parentElement.querySelector('.operatividad-acciones-col'),r=editor.getBoundingClientRect(),limite=acciones.getBoundingClientRect().left-12;
      if(r.right>limite)marco.scrollTo({left:marco.scrollLeft+r.right-limite,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    });
    var terminado=false;
    function cerrarCelda(contenido,repintar,inmediato){
      cerrarDesplegable();editor.classList.add('cerrando');anchoColumna(anchoBase);activo=null;cancelarActivo=null;
      var finalizado=false;
      function terminar(pintar){if(finalizado)return;finalizado=true;cerrarPendiente=null;if(td.contains(editor))td.innerHTML=contenido;td.removeAttribute('aria-busy');anchosOriginales.forEach(function(o){o.el.style.width=o.width;o.el.style.minWidth=o.min;o.el.style.maxWidth=o.max;});if(pintar!==false && repintar && !activo)window.pintar();}
      if(inmediato)terminar(false);else {cerrarPendiente=terminar;setTimeout(terminar,160);}
    }
    function cancelar(inmediato){if(terminado)return;terminado=true;cerrarCelda(contenidoAnterior,false,inmediato===true);}
    cancelarActivo=cancelar;
    async function guardarCelda(){
      if(terminado)return;
      var valor=control.value.trim();valor=valor===''?null:window.esNumerica(c)?Number(valor):valor;
      if(valor===f[c.col] || (valor==null && f[c.col]==null)){cancelar();return;}
      if(window.esNumerica(c) && valor!=null && !Number.isFinite(valor)){avisar('Introduce un número válido.');control.focus();return;}
      terminado=true;cerrarDesplegable();control.disabled=true;editor.querySelectorAll('button').forEach(function(b){b.disabled=true;});td.setAttribute('aria-busy','true');
      try {
        var datos={};datos[c.col]=valor;
        var res=await window.kwSupabase.from('operatividad').update(datos).eq('id',f.id).select('id');
        if(res.error)throw res.error;if(!res.data || !res.data.length)throw Error('No se guardó el cambio. Revisa tus permisos.');
        f[c.col]=valor;avisar('');
      }catch(e){avisar(e.message || 'No se pudo guardar el campo.');}
      finally{
        var texto=window.textoCelda(f,c),contenido=window.escapeHtml(texto || '-');
        if(texto && c.pastilla){var clase=window.claseP(texto);if(clase)contenido='<span class="'+clase+'">'+contenido+'</span>';}
        cerrarCelda(contenido,true);
      }
    }
    control.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();cancelar();}if(e.key==='Enter'){e.preventDefault();guardarCelda();}});
    confirmar.onclick=guardarCelda;
    editor.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();cancelar();}});
    limpiar.onclick=function(){control.value='';guardarCelda();};
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
        var b=document.createElement('button');b.type='button';b.className='operatividad-enlazar';var nombre=(tiene?'Ver ':'Enlazar ')+tipo.charAt(0).toUpperCase()+tipo.slice(1);b.title=nombre;b.setAttribute('aria-label',nombre);
        var trazos=tipo==='contrato'?'<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M8 12h8M8 16h6"/>':tipo==='dictamen'?'<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m8 14 3 3 5-6"/>':'<path d="m3 10 9-7 9 7M5 9v11h14V9M9 20v-7h6v7"/>';
        b.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+trazos+'</svg>';
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
    ['contrato','dictamen','propiedad'].forEach(function(t){
      var id=t==='contrato'?f.documento_id:t==='dictamen'?f.dictamen_id:f.propiedad_id;
      if(id)opcion('Quitar '+t+' enlazado',async function(){
        try{var r=await window.kwSupabase.rpc('operatividad_desenlazar',{p_id:f.id,p_tipo:t});if(r.error)throw r.error;avisar('');await window.cargar();}catch(e){avisar(e.message || 'No se pudo quitar el enlace.');}
      });
    });
    opcion(f.archivado_at?'Restaurar captación':'Archivar captación',async function(){
      try{var r=await window.kwSupabase.from('operatividad').update({archivado_at:f.archivado_at?null:new Date().toISOString()}).eq('id',f.id).select('id');if(r.error)throw r.error;if(!r.data || !r.data.length)throw Error('No se guardó el cambio.');await window.cargar();}catch(e){avisar(e.message);}
    });
    document.body.append(menu);menu.hidden=false;
    menu.style.position='fixed';menu.style.right='auto';menu.style.bottom='auto';menu.style.maxHeight=Math.max(100,innerHeight-24)+'px';menu.style.overflowY='auto';
    var r=boton.getBoundingClientRect(),m=menu.getBoundingClientRect();
    menu.style.left=Math.max(12,Math.min(r.right-m.width,innerWidth-m.width-12))+'px';
    var top=r.bottom+6;if(top+m.height>innerHeight-12)top=r.top-m.height-6;
    menu.style.top=Math.max(12,top)+'px';
    boton.setAttribute('aria-expanded','true');menuAbierto={el:menu,boton:boton};menu.querySelector('button').focus({preventScroll:true});
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
