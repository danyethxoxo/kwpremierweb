(function () {
  'use strict';
  window.kwDocumentosShell.montar({id:'comercial',titulo:'Contrato comercial',acciones:[
    {id:'comercial-volver',texto:'← Volver',accion:'volver'},
    {id:'comercial-guardar',texto:'Guardar borrador',tipo:'submit',accion:'guardar'},
    {id:'comercial-finalizar',texto:'Finalizar',accion:'finalizar'},
    {id:'comercial-copiar',texto:'Crear copia editable',accion:'copiar',oculto:true},
    {id:'comercial-descargar',texto:'Descargar',accion:'descargar'}
  ]});
  const $ = id => document.getElementById(id);
  const tipo = 'contrato_comercial';
  const campos = window.kwComercialCampos.flatMap(grupo => grupo[1]);
  let actual = null, usuario = null, registros = [], ocupado = false, sucio = false, frame = 0, nombreDocumento = '';
  const escapar = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valor = id => $('com-' + id).value.trim();
  function mensaje(texto, error = false) { $('comercial-mensaje').textContent = texto; $('comercial-mensaje').dataset.error = String(error); }
  function datos() { return {...Object.fromEntries(campos.map(([id]) => [id, valor(id)])),nombre:nombreDocumento}; }
  function fecha(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'}).toLocaleUpperCase('es-MX');
  }
  function entero(n) {
    n = Math.floor(n);
    const unidades = ['CERO','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE'];
    const veintes = ['VEINTE','VEINTIÚN','VEINTIDÓS','VEINTITRÉS','VEINTICUATRO','VEINTICINCO','VEINTISÉIS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE'];
    if (n < 20) return unidades[n];
    if (n < 30) return veintes[n-20];
    if (n < 100) return ['','','','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'][Math.floor(n/10)] + (n%10 ? ' Y '+entero(n%10):'');
    if (n === 100) return 'CIEN';
    if (n < 1000) return ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'][Math.floor(n/100)] + (n%100 ? ' '+entero(n%100):'');
    if (n < 1000000) return (n<2000 ? 'MIL' : entero(n/1000)+' MIL') + (n%1000 ? ' '+entero(n%1000):'');
    return (n<2000000 ? 'UN MILLÓN' : entero(n/1000000)+' MILLONES') + (n%1000000 ? ' '+entero(n%1000000):'');
  }
  function letras(v) {
    if (v === '' || !Number.isFinite(Number(v))) return '';
    const [unidad, decimal] = Number(v).toFixed(2).split('.');
    return entero(Number(unidad)) + (Number(decimal) ? ' PUNTO '+decimal.split('').map(d=>entero(Number(d))).join(' '):'');
  }
  function valoresDocumento() {
    const d = datos();
    d.fecha = fecha(d.fecha); d.fecha_escritura = fecha(d.fecha_escritura);
    for (const k of ['comision','pago_promesa','pago_escritura','vigencia','proteccion']) d[k+'_letra'] = letras(d[k]);
    if (d.precio) {
      const centavos = Math.round(Number(d.precio)*100);
      d.precio_formato = '$'+(centavos/100).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})+' M.N.';
      d.precio_letra = entero(Math.floor(centavos/100)) + (centavos%100000000===0 ? ' DE':'')+' PESOS '+String(centavos%100).padStart(2,'0')+'/100 M.N.';
    }
    return d;
  }
  function campo(d, id) { return d[id] ? '<span class="comercial-dato">'+escapar(d[id])+'</span>' : '<span class="comercial-faltante">________________</span>'; }
  function bloquesDocumento() {
    const d = valoresDocumento();
    const bloques = window.kwComercialContenido.map(texto => {
      let html = escapar(texto).replace(/\{\{([a-z_]+)\}\}/g, (_,id) => campo(d,id));
      html = html.replace(/^(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|OCTAVA|NOVENA)\./,'<strong>$1.</strong>');
      const cabecera = /^(?:I{1,3}\.DECLARA|IV\. LAS PARTES|CLÁUSULAS$)/.test(texto);
      const el = document.createElement(cabecera ? 'h3':'p'); el.innerHTML = html; return el;
    });
    const cierre=document.createElement('p');
    cierre.innerHTML='Leído que fue el presente Acuerdo y enteradas las partes de su contenido y alcance legal, lo firman en tres tantos en '+campo(d,'lugar_firma')+', el '+campo(d,'fecha')+'.';
    bloques.push(cierre);
    const firmas=document.createElement('div');firmas.className='comercial-firmas';
    firmas.innerHTML=[['POR EL CLIENTE',campo(d,'cliente')],['KW PREMIER','INMUEBLES VALLE PREMIUM, S.A.P.I. DE C.V.<br>REPRESENTADA EN ESTE ACTO POR<br>'+campo(d,'representante')],['MCA KW PREMIER',campo(d,'mca')],['EL PROFESIONAL',campo(d,'asesor')]].map(([rol,nombre])=>'<div class="comercial-firma"><b>'+rol+'</b>'+nombre+'</div>').join('');
    bloques.push(firmas);
    const grupos=[];
    for(let i=0;i<bloques.length;i++){
      if(bloques[i].tagName==='H3'&&bloques[i+1]){
        const grupo=document.createElement('div');grupo.append(bloques[i],bloques[++i]);grupos.push(grupo);
      }else grupos.push(bloques[i]);
    }
    return grupos;
  }
  function paginar() {
    const medidor=document.createElement('div'); medidor.className='comercial-medidor'; document.body.appendChild(medidor);
    const paginas=[];
    function nueva() {
      const hoja=document.createElement('article'); hoja.className='page comercial-hoja';
      hoja.innerHTML='<header><img src="/assets/img/logo-kw-premier.png" alt="KW Premier"><span>CONTRATO COMERCIAL</span></header><div class="comercial-cuerpo"></div><footer><span>'+escapar(actual?.folio || 'Borrador')+'</span><span class="comercial-numero"></span></footer>';
      medidor.appendChild(hoja);paginas.push(hoja);return hoja.querySelector('.comercial-cuerpo');
    }
    let cuerpo=nueva();
    for (const bloque of bloquesDocumento()) {
      cuerpo.appendChild(bloque);
      if (cuerpo.getBoundingClientRect().bottom-cuerpo.closest('.comercial-hoja').getBoundingClientRect().top>990 && cuerpo.children.length>1) {
        bloque.remove();cuerpo=nueva();cuerpo.appendChild(bloque);
      }
    }
    paginas.forEach((p,i)=>p.querySelector('.comercial-numero').textContent='Página '+(i+1)+' de '+paginas.length);
    const stack=$('comercial-paginas'),existentes=Array.from(stack.querySelectorAll('.comercial-hoja'));
    paginas.forEach((p,i)=>{
      if(existentes[i]){
        actualizarNodo(existentes[i].querySelector('.comercial-cuerpo'),p.querySelector('.comercial-cuerpo'));
        actualizarNodo(existentes[i].querySelector('footer'),p.querySelector('footer'));
      }else stack.appendChild(p);
    });
    existentes.slice(paginas.length).forEach(p=>{const padre=p.parentElement;(padre.classList.contains('page-scale-wrap')?padre:p).remove();});
    medidor.remove();
    window.fitPreviewMobile?.();
  }
  function actualizarNodo(destino,origen) {
    if(destino.nodeType===3){if(destino.nodeValue!==origen.nodeValue)destino.nodeValue=origen.nodeValue;return;}
    for(const atributo of Array.from(destino.attributes))if(!origen.hasAttribute(atributo.name))destino.removeAttribute(atributo.name);
    for(const atributo of Array.from(origen.attributes))if(destino.getAttribute(atributo.name)!==atributo.value)destino.setAttribute(atributo.name,atributo.value);
    for(let i=0;i<origen.childNodes.length;i++){
      const a=destino.childNodes[i],b=origen.childNodes[i];
      if(!a)destino.appendChild(b.cloneNode(true));
      else if(a.nodeType!==b.nodeType||a.nodeName!==b.nodeName)a.replaceWith(b.cloneNode(true));
      else actualizarNodo(a,b);
    }
    while(destino.childNodes.length>origen.childNodes.length)destino.lastChild.remove();
  }
  function programar() { clearTimeout(frame);frame=setTimeout(()=>{frame=0;paginar();},120); }
  function ampliarCampo(el) { if(el.tagName!=='TEXTAREA')return;el.style.height='0px';el.style.height=Math.max(42,el.scrollHeight+2)+'px'; }
  function pintarCampos() {
    $('comercial-campos').innerHTML=window.kwComercialCampos.map(([titulo,lista])=>'<fieldset><legend>'+escapar(titulo)+'</legend><div class="acuerdo-duo kw-documentos-campos">'+lista.map(([id,label,tipoCampo])=>{
      const propiedades=' id="com-'+id+'" name="'+id+'" required maxlength="'+(tipoCampo==='textarea'?1000:250)+'"';
      const limite=tipoCampo==='number'?' min="'+(['precio','vigencia','renovacion','proteccion'].includes(id)?'1':'0')+'" max="'+(id==='precio'?'999999999999.99':['vigencia','renovacion','proteccion'].includes(id)?'10000':'100')+'" step="'+(['vigencia','renovacion','proteccion'].includes(id)?'1':'0.01')+'"':'';
      return '<div class="acuerdo-field"><label for="com-'+id+'">'+escapar(label)+'</label>'+(['textarea','text'].includes(tipoCampo)?'<textarea'+propiedades+' rows="1"></textarea>':'<input type="'+tipoCampo+'"'+propiedades+limite+'>')+'</div>';
    }).join('')+'</div></fieldset>').join('');
  }
  function botones() {
    const finalizado=actual?.estado==='finalizado';
    document.body.classList.toggle('doc-borrador',!finalizado);
    for(const [id] of campos)$('com-'+id).disabled=finalizado||ocupado;
    $('comercial-guardar').hidden=finalizado;$('comercial-finalizar').hidden=finalizado;
    $('comercial-copiar').hidden=!finalizado;
    for(const id of ['comercial-guardar','comercial-finalizar','comercial-descargar','comercial-copiar','btn-nuevo'])$(id).disabled=ocupado||!usuario;
  }
  function vista(formulario,marcar=true) {window.kwDocumentosShell.vista(formulario,marcar);if(formulario){campos.forEach(([id])=>ampliarCampo($('com-'+id)));programar();} }
  async function abandonar() { return !sucio || await window.kwUI.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?'); }
  function abrir(row,marcar=true) {
    actual=row;sucio=false;nombreDocumento=row?.nombre_archivo||row?.datos?.nombre||'';
    for(const [id,,,respaldo] of campos)$('com-'+id).value=row?.datos?.[id] ?? respaldo;
    // Los registros comerciales mantienen nombres estables para integraciones existentes.
    botones();vista(true,marcar);mensaje(row?.estado==='finalizado'?'Contrato finalizado · '+(row.folio || ''):'');
  }
  function pintarLista() {
    const buscar=$('buscador-input').value.trim().toLocaleLowerCase('es-MX');
    const filas=registros.filter(r=>[r.nombre_archivo,r.datos?.cliente,r.folio].some(v=>String(v||'').toLocaleLowerCase('es-MX').includes(buscar)));
    for(const estado of ['borrador','finalizado']){
      const grupo=filas.filter(r=>r.estado===estado);
      $('lista-'+(estado==='borrador'?'borradores':'finalizados')).innerHTML=grupo.length?'<div class="kw-lista">'+grupo.map(r=>'<button type="button" class="kw-fila lista-item" data-abrir="'+escapar(r.id)+'"><span class="kw-fila-cabeza"><span class="kw-fila-punto '+(estado==='finalizado'?'lavanda':'rojo')+'"></span><span class="kw-fila-texto"><span class="kw-fila-titulo">'+escapar(r.nombre_archivo)+'</span><span class="kw-fila-sub">'+escapar([r.folio,r.datos?.cliente,new Date(r.updated_at).toLocaleDateString('es-MX')].filter(Boolean).join(' · '))+'</span></span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 5 7 7-7 7"/></svg></span></button>').join('')+'</div>':'<div class="lista-vacio">'+(buscar?'No hay documentos para esta búsqueda.':estado==='borrador'?'Todavía no hay borradores.':'Todavía no hay documentos finalizados.')+'</div>';
    }
  }
  async function cargarLista() {
    for(const id of ['lista-borradores','lista-finalizados'])$(id).innerHTML='<div class="kw-loader"><div class="circle uno"></div><div class="circle dos"></div><div class="circle tres"></div></div>';
    try {
      const filas=[];
      for(let inicio=0;;inicio+=500){
        const r=await window.kwSupabase.from('documentos_guardados').select('id,nombre_archivo,datos,estado,folio,revision,updated_at').eq('user_id',usuario.id).eq('tipo_documento',tipo).order('updated_at',{ascending:false}).order('id').range(inicio,inicio+499);
        if(r.error)throw r.error;filas.push(...r.data);if(r.data.length<500)break;
      }
      registros=filas;pintarLista();
    } catch(e){for(const id of ['lista-borradores','lista-finalizados'])$(id).innerHTML='';mensaje(e.message||'No se pudieron cargar los contratos.',true);}
  }
  async function pedirNombre() {const nombre=await window.kwDocumentosShell.pedirNombre(nombreDocumento||'Contrato comercial');if(!nombre)return false;nombreDocumento=nombre;return true;}
  async function guardar() {
    if(!usuario||ocupado||actual?.estado==='finalizado')return false;
    ocupado=true;botones();
    try {
      if(!actual&&!await pedirNombre())return false;
      const d=datos(),payload={datos:d,nombre_archivo:d.nombre||'Contrato comercial'};
      let q=window.kwSupabase.from('documentos_guardados');
      q=actual?q.update(payload).eq('id',actual.id).eq('user_id',usuario.id).eq('tipo_documento',tipo).eq('estado','borrador'):q.insert({...payload,user_id:usuario.id,tipo_documento:tipo});
      const r=await q.select('id,nombre_archivo,datos,estado,folio,revision,updated_at').single();if(r.error)throw r.error;
      actual=r.data;sucio=false;mensaje('Contrato guardado.');await cargarLista();return true;
    }catch(e){mensaje(e.message||'No se pudo guardar el contrato.',true);return false;}finally{ocupado=false;botones();}
  }
  async function finalizar() {
    if(ocupado)return;
    const faltante=campos.find(([id])=>!valor(id));
    if(faltante){mensaje('Completa el campo: '+faltante[1]+'.',true);$('com-'+faltante[0]).focus();return;}
    if(!$('formulario-comercial').reportValidity())return;
    if(Math.abs(Number(valor('pago_promesa'))+Number(valor('pago_escritura'))-100)>.001){mensaje('Los porcentajes de pago deben sumar 100 %. ',true);return;}
    if(!await window.kwUI.confirm('¿Finalizar el contrato? Se asignará su folio y dejará de ser editable.'))return;
    if(!await guardar())return;
    ocupado=true;botones();
    try {
      const r=await window.kwSupabase.rpc('finalizar_documento',{p_id:actual.id});if(r.error)throw r.error;
      actual={...actual,estado:'finalizado',folio:r.data};sucio=false;programar();await cargarLista();mensaje('Contrato finalizado. Folio: '+r.data);
    }catch(e){mensaje(e.message||'No se pudo finalizar.',true);}finally{ocupado=false;botones();}
  }
  async function descargar() {
    if(ocupado)return;ocupado=true;botones();let iframe;
    try {
      paginar();
      iframe=document.createElement('iframe');iframe.style.cssText='position:fixed;left:-12000px;top:0;width:816px;height:1056px;border:0;';document.body.appendChild(iframe);
      const doc=iframe.contentDocument;doc.open();doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/css/contrato-comercial.css?v=20261015a"><style>body{margin:0}.comercial-hoja{box-shadow:none}.comercial-faltante{color:#000!important;border-color:#000!important}.print-page{width:816px;height:1056px;page-break-after:always}</style></head><body></body></html>');doc.close();
      $('comercial-paginas').querySelectorAll('.page').forEach(p=>{const copia=p.cloneNode(true);copia.classList.add('print-page');copia.style.transform='none';doc.body.appendChild(copia);});
      await new Promise(resolve=>{const css=doc.querySelector('link');css.onload=resolve;css.onerror=()=>resolve();if(css.sheet)resolve();});
      const pdf=await window.kwPDFVector.crear(doc,{top:0,left:0,right:0,bottom:0});
      pdf.save((nombreDocumento||'Contrato comercial').replace(/[<>:"/\\|?*]/g,'-')+'.pdf');mensaje('PDF descargado.');
    }catch(e){mensaje(e.message||'No se pudo generar el PDF.',true);}finally{iframe?.remove();ocupado=false;botones();}
  }
  async function iniciar() {
    try {
      const r=await window.kwSupabase.auth.getUser();if(r.error||!r.data.user)throw new Error('No hay sesión activa.');usuario=r.data.user;botones();await cargarLista();
      const docId=new URLSearchParams(location.search).get('doc');
      if(docId){
        const r=await window.kwSupabase.from('documentos_guardados').select('id,nombre_archivo,datos,estado,folio,revision,updated_at').eq('id',docId).eq('user_id',usuario.id).eq('tipo_documento',tipo).single();if(r.error)throw r.error;abrir(r.data);
      }else if(new URLSearchParams(location.search).has('nuevo'))abrir(null);
    }catch(e){mensaje(e.message||'No se pudo iniciar el contrato.',true);}
  }
  pintarCampos();botones();
  $('formulario-comercial').noValidate=true;
  $('formulario-comercial').addEventListener('submit',e=>{e.preventDefault();guardar();});
  $('formulario-comercial').addEventListener('input',e=>{if(!e.target.name)return;sucio=true;ampliarCampo(e.target);programar();});
  $('comercial-finalizar').onclick=finalizar;$('comercial-descargar').onclick=descargar;
  $('comercial-copiar').onclick=()=>{const d=datos();abrir({datos:d,estado:'borrador'});actual=null;sucio=true;botones();mensaje('Copia editable. Guarda para crear un nuevo contrato.');};
  $('btn-nuevo').onclick=async()=>{if(!ocupado&&await abandonar())window.kwDocumentosShell.transicion(()=>abrir(null));};
  document.querySelectorAll('[data-vista-universal="lista"]').forEach(b=>b.onclick=async()=>{if(!ocupado&&await abandonar()){sucio=false;vista(false);mensaje('');cargarLista();}});
  $('comercial-volver').onclick=async()=>{if(!ocupado&&await abandonar()){sucio=false;vista(false);mensaje('');cargarLista();}};
  $('vista-lista').onclick=e=>{const b=e.target.closest('[data-abrir]');if(b&&!ocupado)window.kwDocumentosShell.transicion(()=>abrir(registros.find(r=>r.id===b.dataset.abrir)));};
  $('buscador-input').oninput=pintarLista;
  window.addEventListener('beforeunload',e=>{if(sucio){e.preventDefault();e.returnValue='';}});
  window.addEventListener('popstate',e=>{vista(e.state?.kwVista==='formulario',false);if(!e.state?.kwVista)cargarLista();});
  window.addEventListener('kw-auth-ready',iniciar,{once:true});
  if(document.documentElement.classList.contains('kw-auth-ok'))iniciar();
})();
