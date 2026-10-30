(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const iconos = {
    casa:'<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M9 10h.01M15 10h.01"/>',
    dictamen:'<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="m8 13 3 3 5-6"/>',
    comprador:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M6 16a3 3 0 0 1 6 0M15 9h3M15 13h3"/>',
    firma:'<path d="m14 5 3-3 5 5-3 3M14 5 5 14l-2 7 7-2 9-9M14 5l5 5M3 21h18"/>',
    actualizar:'<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M18 18A8 8 0 0 1 5 16"/>',
    flecha:'<path d="m9 5 7 7-7 7"/>',mas:'<path d="M12 5v14M5 12h14"/>'
  };
  const svg = nombre => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+iconos[nombre]+'</svg>';
  function nodo(tag,clase,texto) { const el=document.createElement(tag);if(clase)el.className=clase;if(texto!=null)el.textContent=texto;return el; }
  function urlImagen(valor) { try { const u=new URL(valor,location.origin);return ['https:','http:'].includes(u.protocol)?u.href:''; }catch(e){return '';} }
  function dinero(valor,moneda) { if(valor==null||!Number.isFinite(Number(valor)))return 'Precio a consultar';try{return new Intl.NumberFormat('es-MX',{style:'currency',currency:moneda||'MXN',maximumFractionDigits:0}).format(Number(valor))+' '+(moneda||'MXN');}catch(e){return Number(valor).toLocaleString('es-MX')+' '+(moneda||'MXN');} }
  function fecha(valor) { if(!valor)return '';const f=new Date(valor.length===10?valor+'T12:00:00':valor);return Number.isNaN(f.getTime())?'':f.toLocaleDateString('es-MX',{day:'numeric',month:'short'}); }
  function vacio(caja,texto,enlace,etiqueta) { caja.replaceChildren();const el=nodo('div','dash-empty');el.append(nodo('p','',texto));if(enlace){const a=nodo('a','',etiqueta);a.href=enlace;el.append(a);}caja.append(el); }
  let usuario,sitioAsesor,perfilAsesor,moduloFicha;
  async function abrirFicha(propiedad,enlace){
    if(!window.kwFichaPropiedad){
      if(!moduloFicha)moduloFicha=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/js/kw-ficha-propiedad.js?v=20261021fichas-tipos-detalle';script.onload=()=>window.kwFichaPropiedad?resolve():reject(new Error('No se pudo preparar la ficha'));script.onerror=()=>reject(new Error('No se pudo preparar la ficha'));document.head.append(script);}).catch(e=>{moduloFicha=null;throw e;});
      await moduloFicha;
    }
    const r=await window.kwSupabase.from('propiedades_inventario').select('*').eq('id',propiedad.id).single();if(r.error||!r.data)throw new Error('No se pudo cargar la propiedad');
    const completa=r.data;
    if(completa.fuente==='kwmexico'&&completa.fuente_id&&(completa.imagenes||[]).length<12&&window.kwSupabase.functions){
      try{const fotos=await window.kwSupabase.functions.invoke('fotos-propiedad',{body:{fuente:'kwmexico',fuente_id:String(completa.fuente_id)}});if(!fotos.error&&Array.isArray(fotos.data?.imagenes))completa.imagenes=Array.from(new Set((completa.imagenes||[]).concat(fotos.data.imagenes)));}catch(e){/* La ficha conserva las fotos disponibles. */}
    }
    await window.kwFichaPropiedad.abrir({propiedad:completa,asesor:{...perfilAsesor,market_center:perfilAsesor?.market_center||'KW Premier'},url:enlace});
  }
  const menuPropiedad=nodo('div','dash-property-menu');menuPropiedad.popover='auto';menuPropiedad.id='inicio-menu-propiedad';menuPropiedad.setAttribute('aria-label','Opciones de propiedad');document.body.append(menuPropiedad);
  let botonMenu;
  menuPropiedad.addEventListener('toggle',()=>{if(botonMenu)botonMenu.setAttribute('aria-expanded',String(menuPropiedad.matches(':popover-open')));});
  function cerrarMenu(){if(menuPropiedad.matches(':popover-open'))menuPropiedad.hidePopover();}
  window.addEventListener('resize',cerrarMenu);document.addEventListener('scroll',cerrarMenu,true);
  async function copiarEnlace(url){await navigator.clipboard.writeText(url);}
  function abrirMenu(boton,enlace,titulo,propiedad){
    cerrarMenu();botonMenu=boton;menuPropiedad.replaceChildren();
    const abrir=nodo('a','','Abrir propiedad');abrir.href=enlace;abrir.target='_blank';abrir.rel='noopener noreferrer';abrir.onclick=cerrarMenu;
    const aviso=nodo('span','dash-menu-aviso');aviso.setAttribute('role','status');
    const copiar=nodo('button','','Copiar enlace');copiar.type='button';copiar.onclick=async()=>{try{await copiarEnlace(enlace);aviso.textContent='Enlace copiado';}catch(e){aviso.textContent='No se pudo copiar el enlace';}};
    const compartir=nodo('button','','Compartir propiedad');compartir.type='button';compartir.onclick=async()=>{try{if(navigator.share){await navigator.share({title:titulo,url:enlace});cerrarMenu();}else{await copiarEnlace(enlace);aviso.textContent='Enlace copiado';}}catch(e){if(e.name!=='AbortError')aviso.textContent='No se pudo compartir';}};
    const ficha=nodo('button','','Descargar ficha técnica');ficha.type='button';ficha.onclick=async()=>{ficha.disabled=true;ficha.setAttribute('aria-busy','true');try{await abrirFicha(propiedad,enlace);cerrarMenu();}catch(e){aviso.textContent=e.message||'No se pudo preparar la ficha';}finally{ficha.disabled=false;ficha.removeAttribute('aria-busy');}};
    menuPropiedad.append(abrir,copiar,compartir,ficha,aviso);menuPropiedad.showPopover();
    const r=boton.getBoundingClientRect();menuPropiedad.style.left=Math.max(8,Math.min(r.right-menuPropiedad.offsetWidth,innerWidth-menuPropiedad.offsetWidth-8))+'px';menuPropiedad.style.top=(r.bottom+menuPropiedad.offsetHeight+8>innerHeight?Math.max(8,r.top-menuPropiedad.offsetHeight-4):r.bottom+4)+'px';abrir.focus();
  }
  const esqueletos=new Map([...document.querySelectorAll('[data-widget-lista]')].map(el=>[el.id,el.firstElementChild.cloneNode(true)]));
  async function cargar(clave,consulta,pintar) {
    const caja=$('inicio-'+clave);
    if(caja.getAttribute('aria-busy')==='true'&&caja.dataset.solicitud)return;
    caja.dataset.solicitud='si';caja.setAttribute('aria-busy','true');
    if(!caja.dataset.cargado)caja.replaceChildren(esqueletos.get(caja.id).cloneNode(true));
    try { const r=await consulta();if(r.error)throw r.error;pintar(r.data||[],caja);caja.dataset.cargado='si'; }
    catch(e){vacio(caja,'No pudimos cargar esta información.');caja.firstChild.setAttribute('role','alert');const reintentar=nodo('button','dash-retry','Volver a intentar');reintentar.type='button';reintentar.onclick=()=>cargar(clave,consulta,pintar);caja.firstChild.append(reintentar);}
    finally{caja.setAttribute('aria-busy','false');delete caja.dataset.solicitud;}
  }
  function propiedades(filas,caja) {
    cerrarMenu();
    caja.replaceChildren();if(!filas.length)return vacio(caja,'No hay propiedades disponibles.','/propiedades.html','Ver propiedades');
    filas.forEach(p=>{
      const fila=nodo('article','dash-property'),a=nodo('a','dash-property-link');
      const original=urlImagen(p.enlace_kw)||(p.fuente==='kwmexico'&&p.fuente_id?'https://www.kwmexico.mx/propiedades/'+encodeURIComponent(p.fuente_id):'/propiedad.html?id='+encodeURIComponent(p.id));
      a.href=window.kwSitioAsesor.personalizar(original,sitioAsesor);a.target='_blank';a.rel='noopener noreferrer';
      const foto=urlImagen(p.miniatura_url||p.foto);
      if(foto){const img=nodo('img','dash-photo');img.src=foto;img.alt='';img.loading='lazy';img.decoding='async';img.width=94;img.height=71;img.onerror=()=>{img.replaceWith(nodo('span','dash-photo dash-photo-empty','Sin foto'));};a.append(img);}
      else a.append(nodo('span','dash-photo dash-photo-empty','Sin foto'));
      const info=nodo('div','dash-property-info'),precio=nodo('span','dash-property-price');
      precio.append(nodo('span','',dinero(p.precio,p.moneda)));
      const mc=nodo('span','dash-property-meta',p.market_center||'MC no disponible'),asesor=nodo('span','dash-property-meta',p.asesor_nombre||'Asesor no disponible');mc.title=mc.textContent;asesor.title=asesor.textContent;
      info.append(precio,nodo('span','dash-property-title',p.titulo||'Propiedad sin título'),nodo('span','dash-property-place',[p.colonia,p.municipio].filter(Boolean).join(', ')));
      const responsable=nodo('div','dash-property-owner');mc.classList.add('dash-property-mc');responsable.append(nodo('span','dash-operation',p.operacion==='renta'?'Renta':p.operacion==='venta'?'Venta':'Por confirmar'),mc,asesor);
      const boton=nodo('button','dash-property-options');boton.type='button';boton.setAttribute('aria-label','Opciones de '+(p.titulo||'propiedad'));boton.setAttribute('aria-expanded','false');boton.setAttribute('aria-controls',menuPropiedad.id);boton.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>';boton.onclick=()=>{if(botonMenu===boton&&menuPropiedad.matches(':popover-open'))cerrarMenu();else abrirMenu(boton,a.href,p.titulo||'Propiedad',p);};
      a.append(info,responsable);fila.append(a,boton);caja.append(fila);
    });
  }
  function etiqueta(estado,tipo) {
    const dic={borrador:'Borrador',devuelta:'Devuelto',condicionada:'Autorizado condicionado',autorizada:'Aprobado'};
    const comunes={pendiente:'Pendiente',corregir:'Corregir',aprobado:'Aprobado',sin_listado:'Sin listado',publicado:'Publicado',no_publicado:'No publicado',suspendido:'Suspendido'};
    return (tipo==='dictamen'?dic[estado]:comunes[estado])||estado||'Pendiente';
  }
  function dictamenes(filas,caja) {
    caja.replaceChildren();if(!filas.length)return vacio(caja,'Todavía no tienes dictámenes.','/hub/dictamenes.html','Ir a dictámenes');
    const tabla=nodo('table','kw-universal-tabla dash-table');tabla.setAttribute('aria-label','Tus dictámenes');
    const head=document.createElement('thead'),tr=document.createElement('tr');['Expediente','Dictamen','Marketing','Listado'].forEach(t=>{const th=nodo('th','',t);th.scope='col';tr.append(th);});head.append(tr);tabla.append(head);
    const body=document.createElement('tbody');filas.forEach(d=>{
      const row=document.createElement('tr'),td=document.createElement('td'),a=nodo('a','dash-record',d.inmueble||'Sin dirección');a.href='/hub/dictamenes.html';a.title=d.inmueble||'Abrir dictámenes';td.append(a,nodo('span','dash-record-meta',[d.folio||'Sin folio',Number(d.revision)>0?'Rev. '+d.revision:'',fecha(d.fecha_dictamen||d.updated_at)].filter(Boolean).join(' · ')));row.append(td);
      [[d.estado,'dictamen'],[d.estatus_marketing,'marketing'],[d.estatus_listado,'listado']].forEach(([estado,tipo])=>{const celda=document.createElement('td');celda.append(nodo('span','dash-pill '+(['borrador','devuelta','condicionada','autorizada','pendiente','corregir','aprobado','publicado'].includes(estado)?estado:''),etiqueta(estado,tipo)));row.append(celda);});
      row.addEventListener('click',e=>{if(!e.target.closest('a'))location.assign(a.href);});body.append(row);
    });tabla.append(body);caja.append(tabla);
  }
  function compradores(filas,caja) {
    caja.replaceChildren();if(!filas.length)return vacio(caja,'Crea tu primer perfil comprador.','/hub/cliente-formulario.html','Crear perfil');
    filas.forEach(p=>{
      const a=nodo('a','dash-buyer');a.href='/hub/cliente-formulario.html?id='+encodeURIComponent(p.id);
      const iniciales=String(p.nombre||'Perfil').split(/\s+/).filter(Boolean).slice(0,2).map(t=>t[0]).join('').toLocaleUpperCase('es-MX');
      const info=nodo('div','dash-buyer-body');info.append(nodo('strong','',p.nombre||'Perfil sin nombre'),nodo('small','',[p.operacion==='renta'?'Renta':'Compra',(p.tipos||[]).join(', '),p.precio_max!=null?'Hasta '+dinero(p.precio_max,p.moneda):''].filter(Boolean).join(' · ')));
      a.append(nodo('span','dash-avatar',iniciales),info,nodo('span','dash-pill '+(p.activo?'activo':''),p.activo?'Activo':'Pausado'));caja.append(a);
    });
  }
  function firmas(filas,caja) {
    caja.replaceChildren();if(!filas.length)return vacio(caja,'No tienes documentos para firma.','/hub/firmas.html?vista=nuevo-documento','Crear documento');
    filas.slice(0,5).forEach(f=>{
      const fila=nodo('article','dash-signature-row'),a=nodo('a','dash-signature');a.href='/hub/firmas.html?documento='+encodeURIComponent(f.id);
      const icono=nodo('span','dash-signature-icon');icono.innerHTML=svg('dictamen');
      const info=nodo('span','dash-signature-info');info.append(nodo('strong','',f.titulo||f.nombre_archivo||'Documento sin t\u00edtulo'),nodo('small','',fecha(f.created_at)));
      const flecha=nodo('span','dash-chevron');flecha.innerHTML=svg('flecha');
      a.append(icono,info,flecha);fila.append(a);
      const personas=Array.isArray(f.firmantes)?f.firmantes.filter(x=>x&&typeof x==='object'):[];
      const faltan=personas.filter(x=>!x.firmado).length;
      const detalle=nodo('details','dash-signers'),resumen=nodo('summary','',personas.length?(faltan?(faltan===1?'Falta 1 firma':'Faltan '+faltan+' firmas'):'Firmas completas'):'Sin firmantes');
      resumen.setAttribute('aria-label',resumen.textContent+' - Ver firmantes de '+(f.titulo||f.nombre_archivo||'documento'));detalle.append(resumen);
      const lista=nodo('ul','dash-signers-list');
      personas.forEach(x=>{const item=nodo('li',''),datos=nodo('span','');datos.append(nodo('strong','',x.nombre||'Firmante'),nodo('small','',x.correo||x.email||''));item.append(datos,nodo('span','dash-signer-status',x.firmado?'Firmado':'Pendiente'));lista.append(item);});
      if(personas.length)detalle.append(lista);else detalle.append(nodo('p','dash-signers-empty','No hay firmantes agregados.'));
      fila.append(detalle);caja.append(fila);
    });
  }
  async function iniciar() {
    document.querySelectorAll('[data-icono]').forEach(el=>{el.innerHTML=svg(el.dataset.icono);});
    const sb=window.kwSupabase;
    try {
      const r=await (window.kwSession?.usuarioInicial?window.kwSession.usuarioInicial(sb):sb.auth.getUser());if(r.error||!r.data?.user)throw new Error('Sin sesión');usuario=r.data.user;
      const perfil=await (window.kwSession?.perfilInicial?window.kwSession.perfilInicial(sb):sb.from('profiles').select('nombre,apellido,role,sitio_web,email,whatsapp,foto_url').eq('id',usuario.id).single());
      perfilAsesor=perfil.data;
      sitioAsesor=perfil.data?.sitio_web;
      $('inicio-titulo').textContent='Hola '+(perfil.data?.nombre||'')+', Welcome Home.';
      if(['admin','master','staff'].includes(perfil.data?.role))['btn-admin','card-liderazgo','card-operatividad'].forEach(id=>{$(id).style.display='';});
    }catch(e){document.querySelectorAll('[data-widget-lista]').forEach(el=>{el.setAttribute('aria-busy','false');vacio(el,'No pudimos verificar tu sesión. Recarga la página.');});return;}
    const cargas={
      propiedades:()=>cargar('propiedades',()=>sb.from('propiedades_inventario').select('id,titulo,tipo,operacion,precio,moneda,colonia,municipio,estado,created_at,miniatura_url,foto:imagenes->>0,market_center,asesor_nombre,enlace_kw,fuente,fuente_id').eq('estatus','publicada').order('created_at',{ascending:false}).order('id',{ascending:true}).limit(10),propiedades),
      dictamenes:()=>cargar('dictamenes',()=>sb.from('dictamenes').select('id,folio,revision,inmueble,estado,estatus_marketing,estatus_listado,fecha_dictamen,updated_at').eq('asesor_id',usuario.id).is('archivado_at',null).order('updated_at',{ascending:false}).order('id',{ascending:true}).limit(10),dictamenes),
      compradores:()=>cargar('compradores',()=>sb.from('perfiles_comprador').select('id,nombre,operacion,tipos,precio_max,moneda,activo,created_at').eq('asesor_id',usuario.id).order('created_at',{ascending:false}).order('id',{ascending:true}).limit(10),compradores),
      firmas:()=>cargar('firmas',()=>sb.from('firmas_documentos').select('id,titulo,nombre_archivo,firmantes,created_at').eq('user_id',usuario.id).neq('estado','eliminado').order('created_at',{ascending:false}).order('id',{ascending:true}).limit(5),firmas)
    };
    await Promise.allSettled(Object.values(cargas).map(accion=>accion()));
  }
  if(document.documentElement.classList.contains('kw-auth-ok'))iniciar();
  else window.addEventListener('kw-auth-ready',iniciar,{once:true});
})();
