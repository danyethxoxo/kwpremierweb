(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const ESTADOS = { abierto: 'Abierto', en_revision: 'En revisión', resuelto: 'Resuelto' };
  const TIPOS = { problema: 'Problema', mejora: 'Sugerencia', duda: 'Duda' };
  const CAMPOS = ['rep-tipo','rep-pagina','rep-titulo','rep-descripcion'];
  const MIME = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif' };
  const TAMANO = 5 * 1024 * 1024, LIMITE = 50;
  let sb, usuario, gestion = false, alcance = 'todos', filas = [], mas = false;
  let formulario = false, enviando = false, cargando = false, detalle = null, guardando = false;
  let archivos = [], borradorId = '', subidos = [], envioIncierto = false, mensajeId = '', detalleRevision = 0;
  const escapar = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const folio = id => 'INC-' + id.slice(0,8).toUpperCase();
  const fecha = valor => new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric'}).format(new Date(valor));
  const estado = valor => '<span class="inc-estado ' + (ESTADOS[valor] ? valor : 'abierto') + '">' + escapar(ESTADOS[valor] || 'Abierto') + '</span>';
  const loader = '<span class="kw-loader" aria-hidden="true"><span class="circle uno"></span><span class="circle dos"></span><span class="circle tres"></span></span>';
  const carga = '<div class="inc-carga" role="status" aria-label="Cargando">'+loader+'</div>';
  function aviso(id, texto) { $(id).textContent = texto; $(id).hidden = !texto; }
  function errorUsuario(error) {
    if (error && /reporte cambió/i.test(error.message || '')) return 'Otra persona actualizó el reporte. Actualiza el seguimiento y vuelve a intentar.';
    if (error && (error.code === '42501' || error.status === 403)) return 'No tienes permiso para esta acción. Actualiza la página o consulta a administración.';
    return 'No pudimos completar la acción. Revisa tu conexión y vuelve a intentar; tu texto se conserva.';
  }
  function nombre(inc) { return [inc.reportante_nombre,inc.reportante_apellido].filter(Boolean).join(' ') || (inc.user_id === usuario ? 'Tú' : 'Asesor'); }
  function claveBorrador() { return 'kw_incidencia_borrador_v1:' + usuario; }
  function guardarBorrador() {
    if (!usuario) return;
    try {
      localStorage.setItem(claveBorrador(),JSON.stringify({ id:borradorId, campos:CAMPOS.map(id=>$(id).value), subidos:subidos.concat(archivos.filter(a=>a.ruta).map(a=>a.ruta)), incierto:envioIncierto }));
      $('rep-borrador').textContent = 'Borrador guardado en este navegador. Las imágenes se conservan mientras mantengas esta página abierta.';
    } catch (_) { $('rep-borrador').textContent = 'No se pudo guardar el borrador. Mantén esta página abierta hasta enviar.'; }
  }
  function restaurarBorrador() {
    borradorId = crypto.randomUUID();
    try {
      const b = JSON.parse(localStorage.getItem(claveBorrador()) || 'null');
      if (!b || !Array.isArray(b.campos)) return;
      if (/^[0-9a-f-]{36}$/i.test(b.id)) borradorId = b.id;
      CAMPOS.forEach((id,i)=>{ if (typeof b.campos[i] === 'string') $(id).value = b.campos[i]; });
      ['rep-tipo','rep-pagina'].forEach(id=>$(id).dispatchEvent(new Event('change',{bubbles:true})));
      subidos = Array.isArray(b.subidos) ? b.subidos.filter(p=>typeof p==='string' && p.startsWith(usuario+'/'+borradorId+'/')).slice(0,5) : [];
      envioIncierto = b.incierto === true;
      if (b.campos[2] || b.campos[3]) aviso('inc-aviso','Tienes un borrador pendiente. Pulsa Reportar para retomarlo.');
    } catch (_) {}
    cambiarTipo();
  }
  function cambiarTipo() {
    const tipo = $('rep-tipo').value;
    const textos = {
      problema:['¿Qué pasó?','¿Qué estabas haciendo? ¿Qué esperabas que ocurriera y qué ocurrió?','Incluye los pasos para reproducirlo y el mensaje de error, si apareció.'],
      mejora:['¿Qué mejorarías?','Cuéntanos tu idea y cómo te ayudaría en tu trabajo.','Explica qué cambiarías y para qué te serviría.'],
      duda:['¿Cuál es tu duda?','¿Qué quieres hacer y en qué paso necesitas ayuda?','Incluye el apartado o los pasos que ya intentaste.']
    };
    const t = textos[tipo] || textos.problema;
    $('rep-descripcion-label').textContent=t[0]; $('rep-descripcion').placeholder=t[1]; $('rep-descripcion-ayuda').textContent=t[2];
  }
  function mostrarFormulario(abrir) {
    if (enviando) return;
    formulario=abrir;
    document.body.classList.toggle('inc-redactando',abrir);
    $('inc-formulario').hidden=!abrir; $('inc-listado').hidden=abrir;
    $('inc-titulo-pagina').textContent=abrir?'Nuevo reporte':'Incidencias y sugerencias';
    $('btn-nuevo').querySelector('span').textContent=abrir?'Enviar reporte':'Reportar';
    $('btn-nuevo').setAttribute('aria-label',abrir?'Enviar reporte':'Reportar');
    $('btn-nuevo').querySelector('svg').toggleAttribute('hidden',abrir);
    if (abrir) { aviso('inc-aviso',''); if (matchMedia('(min-width:1024px)').matches) $('rep-titulo').focus(); }
    else $('btn-nuevo').focus();
    if (!matchMedia('(min-width:1024px)').matches) window.scrollTo({top:0,behavior:'instant'});
  }
  function pintarLista() {
    const buscar=$('inc-buscar').value.trim().toLocaleLowerCase('es');
    const seleccion=filas.filter(i=>(!gestion || alcance==='todos' || i.user_id===usuario));
    const visibles=seleccion.filter(i=>(!$('inc-estado').value || i.estatus===$('inc-estado').value)
      && (!$('inc-tipo').value || (i.tipo||'problema')===$('inc-tipo').value)
      && (!buscar || [i.titulo,i.descripcion,folio(i.id),nombre(i)].join(' ').toLocaleLowerCase('es').includes(buscar)));
    $('inc-total').textContent=seleccion.length; $('inc-pendientes').textContent=seleccion.filter(i=>i.estatus!=='resuelto').length;
    $('inc-resultados').textContent=visibles.length+' de '+seleccion.length+' reportes cargados'; $('inc-mas').hidden=!mas;
    if (!visibles.length) {
      const hayFiltros=!!(buscar||$('inc-estado').value||$('inc-tipo').value);
      $('inc-filas').innerHTML='<tr><td colspan="4"><div class="inc-vacio"><h2>'+ (hayFiltros?'Sin resultados':'Tu opinión cuenta') +'</h2><p>'+(hayFiltros?'Prueba otra búsqueda o limpia los filtros.':'¿Encontraste un problema o tienes una idea? Envía tu primer reporte y dale seguimiento aquí.')+'</p><button type="button" class="btn-modal-cancelar" data-vacio="'+(hayFiltros?'limpiar':'reportar')+'">'+(hayFiltros?'Limpiar filtros':'Crear un reporte')+'</button></div></td></tr>';
      return;
    }
    $('inc-filas').innerHTML=visibles.map(i=>'<tr><td><span class="inc-reporte-nombre">'+escapar(i.titulo)+'</span><span class="inc-meta">'+escapar(folio(i.id))+' · '+escapar(TIPOS[i.tipo]||'Problema')+(gestion?' · '+escapar(nombre(i)):'')+'</span></td><td>'+estado(i.estatus)+'</td><td>'+escapar(fecha(i.created_at))+'</td><td><a class="inc-abrir" href="?id='+i.id+'" data-reporte="'+i.id+'" aria-label="Abrir '+escapar(i.titulo)+'">Ver reporte</a></td></tr>').join('');
  }
  async function cargarLista(ampliar=false) {
    if (cargando) return;
    cargando=true; $('inc-mas').disabled=true; $('inc-recargar').disabled=true;
    if (!ampliar && !filas.length) $('inc-filas').innerHTML='<tr><td colspan="4">'+carga+'</td></tr>';
    try {
      const inicio=ampliar?filas.length:0;
      let consulta=sb.from(gestion?'incidencias_con_reportante':'incidencias').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).range(inicio,inicio+LIMITE-1);
      if (!gestion || alcance==='mios') consulta=consulta.eq('user_id',usuario);
      const {data,error}=await consulta; if(error) throw error;
      filas=ampliar?Array.from(new Map(filas.concat(data||[]).map(i=>[i.id,i])).values()):(data||[]);
      mas=(data||[]).length===LIMITE; pintarLista();
    } catch(e) {
      if (filas.length) aviso('inc-aviso','No se pudo actualizar la lista. Puedes reintentar desde Más acciones.');
      else $('inc-filas').innerHTML='<tr><td colspan="4"><div class="inc-vacio"><h2>No pudimos cargar tus reportes</h2><p>Revisa tu conexión y vuelve a intentar.</p><button type="button" class="btn-modal-cancelar" data-reintentar>Reintentar</button></div></td></tr>';
    } finally { cargando=false; $('inc-mas').disabled=false; $('inc-recargar').disabled=false; }
  }
  function agregarArchivos(nuevos) {
    if (enviando || envioIncierto) return;
    const errores=[];
    for (const f of nuevos) {
      if (!MIME[f.type]) { errores.push('Usa imágenes JPG, PNG, WebP o GIF.'); continue; }
      if (!f.size || f.size>TAMANO) { errores.push('Cada imagen debe pesar entre 1 byte y 5 MB.'); continue; }
      if (archivos.some(a=>a.file.name===f.name && a.file.size===f.size && a.file.lastModified===f.lastModified)) continue;
      if (archivos.length+subidos.length>=5) { errores.push('Puedes adjuntar hasta 5 imágenes.'); continue; }
      archivos.push({file:f,url:URL.createObjectURL(f),ruta:''});
    }
    aviso('rep-archivos-error',Array.from(new Set(errores)).join(' ')); pintarPreviews();
  }
  function pintarPreviews() {
    $('rep-previews').innerHTML=archivos.map((a,i)=>'<div class="inc-preview"><img src="'+escapar(a.url)+'" width="100" height="80" alt="'+escapar(a.file.name)+'"><small>'+escapar(a.file.name)+'</small><button type="button" data-quitar="'+i+'" aria-label="Quitar '+escapar(a.file.name)+'"'+(enviando?' disabled':'')+'>×</button></div>').join('')
      +(subidos.length?'<p class="inc-meta">'+subidos.length+' capturas ya cargadas y conservadas para el envío.</p>':'');
  }
  function bloquearReporte(valor) {
    enviando=valor; $('rep-form').setAttribute('aria-busy',String(valor));
    $('rep-form').querySelectorAll('input,textarea,select,button').forEach(el=>{el.disabled=valor;});
    $('btn-nuevo').disabled=valor;
    $('btn-nuevo').querySelector('span').innerHTML=valor?loader:'Enviar reporte';
    $('btn-nuevo').setAttribute('aria-label',valor?'Enviando reporte':'Enviar reporte');
    pintarPreviews();
  }
  async function buscarEnviado() {
    const {data,error}=await sb.from('incidencias').select('id').eq('id',borradorId).eq('user_id',usuario).maybeSingle();
    if(error) throw error; return !!data;
  }
  async function enviarReporte(e) {
    e.preventDefault(); if(enviando || !usuario) return;
    for (const id of ['rep-titulo','rep-descripcion']) {
      const el=$(id), min=id==='rep-titulo'?3:10;
      el.setCustomValidity(el.value.trim().length<min?'Escribe al menos '+min+' caracteres.':'');
      if (!el.reportValidity()) return;
    }
    bloquearReporte(true); aviso('rep-error','');
    try {
      if (envioIncierto && await buscarEnviado()) { await reporteEnviado(); return; }
      const imagenes=subidos.slice();
      for (const a of archivos) {
        if (!a.ruta) {
          const ruta=usuario+'/'+borradorId+'/'+crypto.randomUUID()+'.'+MIME[a.file.type];
          const {error}=await sb.storage.from('incidencias').upload(ruta,a.file,{contentType:a.file.type,upsert:false});
          if(error) throw error; a.ruta=ruta;
        }
        imagenes.push(a.ruta);
      }
      const payload={id:borradorId,user_id:usuario,titulo:$('rep-titulo').value.trim(),descripcion:$('rep-descripcion').value.trim(),tipo:$('rep-tipo').value,pagina:$('rep-pagina').value.startsWith('/')?$('rep-pagina').value:null,imagenes};
      envioIncierto=true; guardarBorrador();
      const {error}=await sb.from('incidencias').insert(payload);
      if(error && !(await buscarEnviado())) {
        // Un rechazo confirmado permite corregir los campos sin duplicar el reporte.
        if (error.code && error.code!=='23505') envioIncierto=false;
        throw error;
      }
      await reporteEnviado();
    } catch(error) { guardarBorrador(); aviso('rep-error',errorUsuario(error)); }
    finally { bloquearReporte(false); if(!formulario) $('btn-nuevo').querySelector('span').textContent='Reportar'; }
  }
  async function reporteEnviado() {
    const enviado=borradorId;
    archivos.forEach(a=>URL.revokeObjectURL(a.url)); archivos=[]; subidos=[]; envioIncierto=false;
    CAMPOS.forEach(id=>{ $(id).value=id==='rep-tipo'?'problema':''; }); cambiarTipo();
    ['rep-tipo','rep-pagina'].forEach(id=>$(id).dispatchEvent(new Event('change',{bubbles:true})));
    limpiarFiltros();
    try { localStorage.removeItem(claveBorrador()); } catch(_) {}
    borradorId=crypto.randomUUID(); enviando=false; mostrarFormulario(false);
    aviso('inc-aviso','Reporte '+folio(enviado)+' enviado. Puedes abrirlo para consultar el seguimiento.');
    await cargarLista();
  }
  async function imagenesFirmadas(inc) {
    const origen=new URL(sb.supabaseUrl).origin;
    const rutas=(inc.imagenes||[]).map(p=>{
      if (/^https?:/i.test(p)) { try { const u=new URL(p), prefix='/storage/v1/object/public/incidencias/'; if(u.origin!==origen || !u.pathname.startsWith(prefix)) return ''; p=decodeURIComponent(u.pathname.slice(prefix.length)); } catch(_){return '';} }
      return typeof p==='string' && !p.startsWith('/') && !p.split('/').includes('..')?p:'';
    }).filter(Boolean);
    if(!rutas.length) return [];
    const {data,error}=await sb.storage.from('incidencias').createSignedUrls(rutas,300); if(error) throw error;
    return (data||[]).filter(i=>i.signedUrl).map(i=>i.signedUrl);
  }
  async function cargarDetalle(id, abrir=true) {
    const revision=++detalleRevision;
    aviso('det-error','');
    if(abrir) { $('det-titulo').textContent='Reporte'; $('det-hilo').innerHTML=carga; $('det-descripcion').textContent=''; $('det-imagenes').replaceChildren(); $('inc-detalle').showModal(); }
    try {
      const {data:inc,error}=await sb.from(gestion?'incidencias_con_reportante':'incidencias').select('*').eq('id',id).single();
      if(error || !inc) throw error || new Error('No disponible');
      const {data:mensajes,error:hiloError}=await sb.from('incidencias_mensajes').select('*').eq('incidencia_id',id).order('created_at',{ascending:true}).limit(200);
      if(revision!==detalleRevision) return;
      detalle=inc;
      $('det-titulo').textContent=inc.titulo; $('det-folio').textContent=folio(inc.id);
      $('det-estado').innerHTML=estado(inc.estatus); $('det-tipo').textContent=TIPOS[inc.tipo]||'Problema'; $('det-fecha').textContent=fecha(inc.created_at);
      $('det-reportante').textContent='Reportado por '+nombre(inc); $('det-pagina').textContent=inc.pagina?'Apartado: '+inc.pagina:''; $('det-descripcion').textContent=inc.descripcion;
      $('det-gestion').hidden=!gestion; $('det-estatus').value=inc.estatus; $('det-estatus').dispatchEvent(new Event('change',{bubbles:true})); $('det-guardar').textContent=gestion?'Guardar seguimiento':'Enviar comentario';
      let hilo=inc.respuesta?'<article class="inc-mensaje"><span class="inc-meta">Respuesta anterior del equipo</span><p>'+escapar(inc.respuesta)+'</p></article>':'';
      hilo+=(mensajes||[]).map(m=>'<article class="inc-mensaje"><span class="inc-meta">'+(m.user_id===usuario?'Tú':m.user_id===inc.user_id?'Asesor':'Equipo de soporte')+' · '+escapar(fecha(m.created_at))+'</span><p>'+escapar(m.mensaje)+'</p></article>').join('');
      $('det-hilo').innerHTML=hiloError?'<p class="inc-meta">No se pudo cargar la conversación. Pulsa Actualizar seguimiento.</p>':hilo||'<p class="inc-meta">Todavía no hay comentarios. Puedes agregar información aquí.</p>';
      const url=new URL(location.href); url.searchParams.set('id',id); history.replaceState(null,'',url);
      aviso('det-img-error',''); $('det-imagenes').replaceChildren();
      try {
        const urls=await imagenesFirmadas(inc); if(revision!==detalleRevision) return;
        urls.forEach((url,i)=>{ const btn=document.createElement('button'); btn.type='button'; btn.className='inc-captura'; btn.setAttribute('aria-label','Ampliar captura '+(i+1)); const img=document.createElement('img'); img.src=url; img.alt='Captura '+(i+1); img.width=100; img.height=80; btn.append(img); btn.addEventListener('click',()=>{ $('inc-imagen-grande').src=url; $('inc-imagen').showModal(); }); $('det-imagenes').append(btn); });
      } catch(_) { aviso('det-img-error','Las capturas no se pudieron cargar. Actualiza el seguimiento para reintentar.'); }
    } catch(error) { if(revision===detalleRevision) { detalle=null; aviso('det-error','Este reporte no está disponible o no tienes acceso. Cierra esta ventana y actualiza la lista.'); $('det-hilo').replaceChildren(); } }
  }
  async function guardarSeguimiento(e) {
    e.preventDefault(); if(guardando || !detalle) return;
    const texto=$('det-mensaje').value.trim(), estatus=$('det-estatus').value;
    if(!texto && (!gestion || estatus===detalle.estatus)) { aviso('det-error','Escribe un comentario'+(gestion?' o cambia el estado.':'.')); $('det-mensaje').focus(); return; }
    guardando=true; $('det-guardar').disabled=true; $('det-mensaje').disabled=true; $('det-estatus').disabled=true; $('det-recargar').disabled=true;
    aviso('det-error',''); mensajeId=mensajeId||crypto.randomUUID();
    try {
      let error;
      if(gestion) ({error}=await sb.rpc('incidencias_guardar_seguimiento',{p_id:detalle.id,p_estatus:estatus,p_mensaje:texto,p_version:detalle.updated_at,p_mensaje_id:mensajeId}));
      else {
        const previo=await sb.from('incidencias_mensajes').select('id').eq('id',mensajeId).maybeSingle(); if(previo.error) throw previo.error;
        if(!previo.data) ({error}=await sb.from('incidencias_mensajes').insert({id:mensajeId,incidencia_id:detalle.id,user_id:usuario,mensaje:texto}));
      }
      if(error) throw error;
      $('det-mensaje').value=''; mensajeId='';
      await cargarDetalle(detalle.id,false); await cargarLista();
    } catch(error) { aviso('det-error',errorUsuario(error)); }
    finally { guardando=false; $('det-guardar').disabled=false; $('det-mensaje').disabled=false; $('det-estatus').disabled=false; $('det-recargar').disabled=false; }
  }
  function limpiarFiltros() { $('inc-buscar').value=''; $('inc-estado').value=''; $('inc-tipo').value=''; ['inc-estado','inc-tipo'].forEach(id=>$(id).dispatchEvent(new Event('change',{bubbles:true}))); pintarLista(); }
  async function iniciar() {
    sb=window.kwSupabase;
    try {
      const {data,error}=await sb.auth.getUser(); if(error || !data.user) throw error;
      usuario=data.user.id;
      const {data:perfil,error:pe}=await sb.from('profiles').select('role').eq('id',usuario).single(); if(pe) throw pe;
      gestion=['admin','master'].includes(perfil.role);
      $('inc-alcance').hidden=!gestion; $('btn-nuevo').disabled=false;
      restaurarBorrador();
      await cargarLista();
      const id=new URL(location.href).searchParams.get('id'); if(/^[0-9a-f-]{36}$/i.test(id||'')) await cargarDetalle(id);
    } catch(_) { $('inc-filas').innerHTML='<tr><td colspan="4"><div class="inc-vacio"><h2>No pudimos abrir tus reportes</h2><p>Revisa tu conexión y recarga la página.</p><button class="btn-modal-cancelar" type="button" data-iniciar>Reintentar</button></div></td></tr>'; }
  }
  $('btn-nuevo').addEventListener('click',()=>{ if(formulario) $('rep-form').requestSubmit(); else mostrarFormulario(true); });
  const escritorio=matchMedia('(min-width:1024px)');
  $('inc-filtros').open=escritorio.matches;
  escritorio.addEventListener('change',e=>{$('inc-filtros').open=e.matches;});
  $('rep-volver').addEventListener('click',()=>mostrarFormulario(false));
  $('rep-form').addEventListener('submit',enviarReporte);
  CAMPOS.forEach(id=>{ $(id).addEventListener('input',()=>{ if(enviando) return; $(id).setCustomValidity(''); if(id==='rep-tipo') cambiarTipo(); guardarBorrador(); }); $(id).addEventListener('change',()=>{if(id==='rep-tipo') cambiarTipo(); guardarBorrador();}); });
  $('rep-imagenes').addEventListener('change',()=>{ agregarArchivos(Array.from($('rep-imagenes').files||[])); $('rep-imagenes').value=''; });
  $('rep-previews').addEventListener('click',e=>{ const b=e.target.closest('[data-quitar]'); if(!b || enviando || envioIncierto) return; const [a]=archivos.splice(Number(b.dataset.quitar),1); URL.revokeObjectURL(a.url); pintarPreviews(); });
  $('rep-zona').addEventListener('dragover',e=>{e.preventDefault(); $('rep-zona').classList.add('arrastrando');});
  $('rep-zona').addEventListener('dragleave',()=>$('rep-zona').classList.remove('arrastrando'));
  $('rep-zona').addEventListener('drop',e=>{e.preventDefault(); $('rep-zona').classList.remove('arrastrando'); agregarArchivos(Array.from(e.dataTransfer.files||[]));});
  $('rep-form').addEventListener('paste',e=>{ const images=Array.from(e.clipboardData.items||[]).filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean); if(images.length){e.preventDefault();agregarArchivos(images);} });
  ['inc-buscar','inc-estado','inc-tipo'].forEach(id=>$(id).addEventListener(id==='inc-buscar'?'input':'change',pintarLista));
  $('inc-alcance').addEventListener('click',e=>{const b=e.target.closest('[data-alcance]'); if(!b || cargando)return; alcance=b.dataset.alcance; $('inc-alcance').querySelectorAll('button').forEach(el=>{el.classList.toggle('activo',el===b);el.setAttribute('aria-pressed',String(el===b));});filas=[];cargarLista();});
  $('inc-recargar').addEventListener('click',()=>cargarLista()); $('inc-limpiar').addEventListener('click',limpiarFiltros); $('inc-mas').addEventListener('click',()=>cargarLista(true));
  $('inc-filas').addEventListener('click',e=>{const link=e.target.closest('[data-reporte]');if(link){if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();$('det-mensaje').value='';mensajeId='';cargarDetalle(link.dataset.reporte);} if(e.target.closest('[data-reintentar]'))cargarLista();if(e.target.closest('[data-iniciar]'))iniciar();const b=e.target.closest('[data-vacio]');if(b){if(b.dataset.vacio==='limpiar')limpiarFiltros();else mostrarFormulario(true);}});
  $('det-form').addEventListener('submit',guardarSeguimiento);
  $('det-recargar').addEventListener('click',()=>{if(detalle && !guardando)cargarDetalle(detalle.id,false);});
  document.querySelectorAll('[data-cerrar]').forEach(b=>b.addEventListener('click',()=>{if(guardando && b.dataset.cerrar==='inc-detalle')return;$(b.dataset.cerrar).close();}));
  $('inc-detalle').addEventListener('cancel',e=>{if(guardando)e.preventDefault();});
  $('inc-detalle').addEventListener('close',()=>{detalleRevision++;detalle=null;const u=new URL(location.href);u.searchParams.delete('id');history.replaceState(null,'',u);});
  window.addEventListener('beforeunload',e=>{if(enviando || guardando || archivos.length){e.preventDefault();e.returnValue='';}});
  if(document.documentElement.classList.contains('kw-auth-ok')) iniciar(); else window.addEventListener('kw-auth-ready',iniciar,{once:true});
})();
