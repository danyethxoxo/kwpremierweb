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
  const camposCliente = window.kwComercialCampos[1][1];
  let numeroClientes = 1, clientesEnMemoria = [];
  const idCliente = (id,i) => i ? id+'_'+(i+1) : id;
  function camposActivos() { return campos.concat(Array.from({length:numeroClientes-1},(_,i)=>camposCliente.map(([id,label,tipo,respaldo])=>[idCliente(id,i+1),'Cliente '+(i+2)+': '+label,tipo,respaldo])).flat()); }
  function leerClientes() { return Array.from({length:numeroClientes},(_,i)=>Object.fromEntries(camposCliente.map(([id])=>[id,valor(idCliente(id,i))]))); }
  let actual = null, usuario = null, registros = [], ocupado = false, sucio = false, frame = 0, nombreDocumento = '';
  const escapar = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valor = id => id==='precio'?$('com-precio').value.replace(/,/g,'').trim():$('com-' + id).value.trim();
  function mensaje(texto, error = false) { $('comercial-mensaje').textContent='';if(texto)window.kwUI.alert(texto,{titulo:error?'Revisa el documento':'Documento'}); }
  function datos() { return {...Object.fromEntries(campos.map(([id]) => [id, valor(id)])),representante:actual?.datos?.representante||'GUSTAVO SOLARES CAMPOS',mca:actual?.datos?.mca||'MARÍA FERNANDA PACHECO BAÑOS',clientes:leerClientes(),numero_clientes:numeroClientes,nombre:nombreDocumento}; }
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
      const moneda=window.kwDocumentosCampos.divisas[d.divisa]||window.kwDocumentosCampos.divisas.MXN;
      d.precio_formato = '$'+(centavos/100).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+d.divisa;
      d.precio_letra = entero(Math.floor(centavos/100)) + (centavos%100000000===0 ? ' DE':'')+' '+moneda.nombre+' '+String(centavos%100).padStart(2,'0')+'/100 '+moneda.cierre;
    }
    d.ciudad_notaria=[d.ciudad_notaria,d.pais_notaria].filter(Boolean).join(', ');
    return d;
  }
  function campo(d, id) { return d[id] ? '<span class="comercial-dato">'+escapar(d[id])+'</span>' : '<span class="comercial-faltante">________________</span>'; }
  function bloquesDocumento() {
    const d = valoresDocumento();
    let contenido=window.kwComercialContenido.map(texto=>({texto,datos:d}));
    if(numeroClientes>1){
      contenido[0].texto=contenido[0].texto.replace('A QUIEN EN LO SUCESIVO SE LE DENOMINARÁ “EL CLIENTE”','A QUIENES EN LO SUCESIVO SE LES DENOMINARÁ CONJUNTAMENTE “EL CLIENTE”');
      contenido[0].datos={...d,cliente:d.clientes.map(c=>c.cliente||'________________').join(', ')};
      contenido.splice(1,6,...d.clientes.flatMap((cliente,i)=>window.kwComercialContenido.slice(1,7).map((texto,j)=>({texto:j===0?'I.DECLARA “EL CLIENTE” '+(i+1)+': {{cliente}} que:':texto,datos:{...d,...cliente}}))));
    }
    const bloques = contenido.map(({texto,datos:datosBloque}) => {
      let html = escapar(texto).replace(/\{\{([a-z_]+)\}\}/g, (_,id) => campo(datosBloque,id));
      html = html.replace(/^(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|OCTAVA|NOVENA)\./,'<strong>$1.</strong>');
      const cabecera = /^(?:I{1,3}\.DECLARA|IV\. LAS PARTES|CLÁUSULAS$)/.test(texto);
      const el = document.createElement(cabecera ? 'h3':'p'); el.innerHTML = html; return el;
    });
    const cierre=document.createElement('p');
    cierre.innerHTML='Leído que fue el presente Acuerdo y enteradas las partes de su contenido y alcance legal, lo firman en tres tantos en '+campo(d,'lugar_firma')+', el '+campo(d,'fecha')+'.';
    bloques.push(cierre);
    const firmantes=[...d.clientes.map((cliente,i)=>['POR EL CLIENTE'+(numeroClientes>1?' '+(i+1):''),campo(cliente,'cliente')]),['KW PREMIER','INMUEBLES VALLE PREMIUM, S.A.P.I. DE C.V.<br>REPRESENTADA EN ESTE ACTO POR<br>'+campo(d,'representante')],['MCA KW PREMIER',campo(d,'mca')],['EL PROFESIONAL',campo(d,'asesor')]];
    for(let i=0;i<firmantes.length;i+=2){
      const firmas=document.createElement('div');firmas.className='comercial-firmas';
      firmas.innerHTML=firmantes.slice(i,i+2).map(([rol,nombre])=>'<div class="comercial-firma"><b>'+rol+'</b>'+nombre+'</div>').join('');bloques.push(firmas);
    }
    const grupos=[];
    for(let i=0;i<bloques.length;i++){
      if(bloques[i].tagName==='H3'&&bloques[i+1]){
        const grupo=document.createElement('div');grupo.append(bloques[i],bloques[++i]);grupos.push(grupo);
      }else grupos.push(bloques[i]);
    }
    return grupos;
  }
  function configuracionDocumento() {return {stack:'comercial-paginas',titulo:'CONTRATO COMERCIAL',folio:actual?.folio||'Borrador',clase:'comercial-hoja',claseCuerpo:'comercial-cuerpo',bloques:bloquesDocumento};}
  function paginar() {window.kwContratoDocumento.render(configuracionDocumento());}
  function programar() { clearTimeout(frame);frame=setTimeout(()=>{frame=0;paginar();},120); }
  function ampliarCampo(el) { if(el.tagName!=='TEXTAREA')return;el.style.height='0px';el.style.height=Math.max(42,el.scrollHeight+2)+'px'; }
  function pintarCampos() {
    $('comercial-campos').innerHTML=window.kwComercialCampos.map(([titulo,lista],i)=>'<fieldset><legend>'+escapar(titulo)+'</legend>'+(i===1?'<div class="acuerdo-field"><label for="com-num-clientes">Número de clientes propietarios</label><select id="com-num-clientes" name="numero_clientes">'+Array.from({length:6},(_,n)=>'<option value="'+(n+1)+'">'+(n+1)+'</option>').join('')+'</select></div><div id="comercial-clientes"></div>':'<div class="acuerdo-duo kw-documentos-campos">'+lista.map(pintarCampo).join('')+'</div>')+'</fieldset>').join('');
    pintarClientes();window.kwUI.selects($('comercial-campos'));
  }
  function pintarCampo([id,label,tipoCampo]) {
      const propiedades=' id="com-'+id+'" name="'+id+'" required maxlength="'+(tipoCampo==='textarea'?1000:250)+'"';
      const limite=tipoCampo==='number'?' min="'+(['vigencia','renovacion','proteccion'].includes(id)?'1':'0')+'" max="'+(['vigencia','renovacion','proteccion'].includes(id)?'10000':'100')+'" step="any" data-kw-paso="5"':'';
      const opciones=id.startsWith('estado_civil')?window.kwDocumentosCampos.civiles:id==='tipo_inmueble'?window.kwDocumentosCampos.inmuebles:id==='ciudad_notaria'?window.kwDocumentosCampos.estados:['MXN','USD','EUR'];
      if(tipoCampo==='pais')return '<div class="acuerdo-field"><label for="com-pais-selector">'+escapar(label)+'</label><div><select id="com-pais-selector" aria-label="País"><option value="México">México</option><option value="otro">Otro país</option></select><input type="text"'+propiedades+' aria-label="Nombre del país" placeholder="Escribe el país" hidden></div></div>';
      const control=tipoCampo==='select'?'<select'+propiedades+'><option value="">Seleccionar</option>'+opciones.map(v=>'<option>'+escapar(v)+'</option>').join('')+'</select>':tipoCampo==='importe'?'<div class="kw-importe"><span aria-hidden="true">$</span><input type="text"'+propiedades+' data-kw-no inputmode="decimal" placeholder="0.00"></div>':['textarea','text'].includes(tipoCampo)?'<textarea'+propiedades+' rows="1"></textarea>':'<input type="'+tipoCampo+'"'+propiedades+limite+'>';
      return '<div class="acuerdo-field"><label for="com-'+id+'">'+escapar(label)+'</label>'+control+'</div>';
  }
  function pintarClientes() {
    $('com-num-clientes').value=String(numeroClientes);
    const etiqueta=$('com-num-clientes').parentElement.querySelector('.kw-select-valor');if(etiqueta)etiqueta.textContent=String(numeroClientes);
    $('comercial-clientes').innerHTML=Array.from({length:numeroClientes},(_,i)=>'<fieldset><legend>Cliente propietario '+(i+1)+'</legend><div class="acuerdo-duo kw-documentos-campos">'+camposCliente.map(([id,label,tipo])=>pintarCampo([idCliente(id,i),label,tipo])).join('')+'</div></fieldset>').join('');
    for(let i=0;i<numeroClientes;i++)for(const [id]of camposCliente){const el=$('com-'+idCliente(id,i));asignar(el,clientesEnMemoria[i]?.[id]||'');ampliarCampo(el);}
    window.kwUI.selects($('comercial-campos'));
  }
  function asignar(el,v){if(el.tagName==='SELECT'&&v&&!Array.from(el.options).some(o=>o.value===v))el.add(new Option(v,v));el.value=v;el.dispatchEvent(new Event('change'));}
  function actualizarEstado(v){
    const mexico=/^m[eé]xico$/i.test(valor('pais_notaria')),el=$('com-ciudad_notaria');
    if((el.tagName==='SELECT')===mexico)return;
    const cont=el.closest('.acuerdo-field');cont.outerHTML=mexico?pintarCampo(['ciudad_notaria','Estado','select']):pintarCampo(['ciudad_notaria','Estado o provincia','text']);
    asignar($('com-ciudad_notaria'),v??(mexico?'Ciudad de México':''));window.kwUI.selects($('comercial-campos'));botones();
  }
  function sincronizarPais(){
    const mexico=/^m[eé]xico$/i.test(valor('pais_notaria')),selector=$('com-pais-selector');selector.value=mexico?'México':'otro';$('com-pais_notaria').hidden=mexico;
    const etiqueta=selector.parentElement.querySelector('.kw-select-valor');if(etiqueta)etiqueta.textContent=mexico?'México':'Otro país';
  }
  function botones() {
    const finalizado=actual?.estado==='finalizado';
    document.body.classList.toggle('doc-borrador',!finalizado);
    for(const [id] of camposActivos())$('com-'+id).disabled=finalizado||ocupado;
    $('com-num-clientes').disabled=finalizado||ocupado;
    $('com-pais-selector').disabled=finalizado||ocupado;
    $('comercial-guardar').hidden=finalizado;$('comercial-finalizar').hidden=finalizado||!actual?.id;
    $('comercial-descargar').hidden=!finalizado;
    $('comercial-copiar').hidden=!finalizado;
    for(const id of ['comercial-guardar','comercial-finalizar','comercial-descargar','comercial-copiar','btn-nuevo'])$(id).disabled=ocupado||!usuario;
  }
  function vista(formulario,marcar=true) {window.kwDocumentosShell.vista(formulario,marcar);if(formulario){camposActivos().forEach(([id])=>ampliarCampo($('com-'+id)));programar();} }
  async function abandonar() { return !sucio || await window.kwUI.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?'); }
  function abrir(row,marcar=true) {
    actual=row;sucio=false;nombreDocumento=row?.nombre_archivo||row?.datos?.nombre||'';
    clientesEnMemoria=Array.isArray(row?.datos?.clientes)&&row.datos.clientes.length?row.datos.clientes.slice(0,6):[Object.fromEntries(camposCliente.map(([id])=>[id,row?.datos?.[id]||'']))];
    numeroClientes=clientesEnMemoria.length;pintarClientes();
    asignar($('com-pais_notaria'),row?.datos?.pais_notaria??'México');actualizarEstado(row?.datos?.ciudad_notaria);
    for(const [id,,,respaldo] of campos)asignar($('com-'+id),row?.datos?.[id] ?? respaldo);
    sincronizarPais();
    window.kwDocumentosCampos.formatear($('com-precio'));
    for(const [id]of camposCliente)asignar($('com-'+id),clientesEnMemoria[0]?.[id]||'');
    // Los registros comerciales mantienen nombres estables para integraciones existentes.
    botones();vista(true,marcar);mensaje('');
    if(!row)window.kwDocumentosCampos.prellenar({'com-asesor':'nombre','com-correo_asesor':'email','com-whatsapp_asesor':'whatsapp','com-telefono_asesor':'whatsapp'});
  }
  function pintarLista() {
    const buscar=$('buscador-input').value.trim().toLocaleLowerCase('es-MX');
    const filas=registros.filter(r=>[r.nombre_archivo,r.datos?.cliente,...(r.datos?.clientes||[]).map(c=>c.cliente),r.folio].some(v=>String(v||'').toLocaleLowerCase('es-MX').includes(buscar)));
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
  async function guardar(silencioso=false) {
    if(!usuario||ocupado||actual?.estado==='finalizado')return false;
    ocupado=true;botones();
    try {
      if(!actual&&!await pedirNombre())return false;
      const d=datos(),payload={datos:d,nombre_archivo:d.nombre||'Contrato comercial'};
      let q=window.kwSupabase.from('documentos_guardados');
      q=actual?q.update(payload).eq('id',actual.id).eq('user_id',usuario.id).eq('tipo_documento',tipo).eq('estado','borrador'):q.insert({...payload,user_id:usuario.id,tipo_documento:tipo});
      const r=await q.select('id,nombre_archivo,datos,estado,folio,revision,updated_at').single();if(r.error)throw r.error;
      actual=r.data;sucio=false;if(!silencioso)mensaje('Contrato guardado.');await cargarLista();return true;
    }catch(e){mensaje(e.message||'No se pudo guardar el contrato.',true);return false;}finally{ocupado=false;botones();}
  }
  async function finalizar() {
    if(ocupado)return;
    const faltante=camposActivos().find(([id])=>!valor(id));
    if(faltante){mensaje('Completa el campo: '+faltante[1]+'.',true);$('com-'+faltante[0]).focus();return;}
    if(!Number.isFinite(Number(valor('precio')))||Number(valor('precio'))<=0||Number(valor('precio'))>999999999999.99){mensaje('Escribe un precio de venta válido mayor que cero.',true);return;}
    if(!$('formulario-comercial').reportValidity())return;
    if(Math.abs(Number(valor('pago_promesa'))+Number(valor('pago_escritura'))-100)>.001){mensaje('Los porcentajes de pago deben sumar 100 %. ',true);return;}
    if(!await window.kwUI.confirm('¿Finalizar el contrato? Se asignará su folio y dejará de ser editable.'))return;
    if(!await guardar(true))return;
    ocupado=true;botones();
    try {
      const r=await window.kwSupabase.rpc('finalizar_documento',{p_id:actual.id});if(r.error)throw r.error;
      actual={...actual,estado:'finalizado',folio:r.data};sucio=false;programar();await cargarLista();mensaje('Contrato finalizado. Folio: '+r.data);
    }catch(e){mensaje(e.message||'No se pudo finalizar.',true);}finally{ocupado=false;botones();}
  }
  async function descargar() {
    if(ocupado)return;ocupado=true;botones();
    try {
      await window.kwContratoDocumento.exportar(configuracionDocumento(),{nombre:nombreDocumento||'Contrato comercial'});mensaje('PDF descargado.');
    }catch(e){mensaje(e.message||'No se pudo generar el PDF.',true);}finally{ocupado=false;botones();}
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
  $('formulario-comercial').addEventListener('input',e=>{if(!e.target.name)return;if(e.target.id==='com-precio')window.kwDocumentosCampos.formatear(e.target);if(e.target.id==='com-pais_notaria')actualizarEstado();sucio=true;ampliarCampo(e.target);programar();});
  $('formulario-comercial').addEventListener('change',e=>{if(e.target.tagName==='SELECT'){sucio=true;programar();}});
  $('com-pais-selector').addEventListener('change',()=>{$('com-pais_notaria').value=$('com-pais-selector').value==='México'?'México':'';sincronizarPais();actualizarEstado();sucio=true;programar();if(!$('com-pais_notaria').hidden)$('com-pais_notaria').focus();});
  $('com-num-clientes').addEventListener('change',()=>{
    leerClientes().forEach((cliente,i)=>clientesEnMemoria[i]=cliente);
    numeroClientes=Math.max(1,Math.min(6,Number($('com-num-clientes').value)||1));
    pintarClientes();botones();sucio=true;programar();
  });
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
