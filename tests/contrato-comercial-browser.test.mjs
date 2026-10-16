import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
async function aviso(page,texto){if(texto==='Contrato guardado.'||texto.startsWith('Contrato finalizado.')){await page.locator('#guardar-exito').waitFor({state:'visible'});await page.locator('#guardar-exito .guardar-exito-ok').click();return;}await page.getByText(texto,{exact:true}).waitFor();await page.locator('.modal-overlay:visible .btn-modal-confirmar').last().click();}
async function llenar(page,id,v){if(id==='pais_notaria'){await page.locator('#com-pais-selector').selectOption(v==='México'?'México':'otro',{force:true});if(v==='México')return;}const el=page.locator('#com-'+id);if(await el.evaluate(e=>e.tagName==='SELECT'))await el.selectOption(v,{force:true});else await el.fill(v);}
test('las comisiones decimales conservan los ceros al escribirse en letra',()=>{
 const script=readFileSync(path.join(root,'assets/js/contrato-comercial.js'),'utf8');
 const contexto=vm.createContext({});
 vm.runInContext(script.slice(script.indexOf('  function entero('),script.indexOf('  function valoresDocumento(')),contexto);
 assert.equal(contexto.letras('5.05'),'CINCO PUNTO CERO CINCO');
 assert.equal(contexto.letras('5'),'CINCO');
 assert.equal(contexto.entero(12343370),'DOCE MILLONES TRESCIENTOS CUARENTA Y TRES MIL TRESCIENTOS SETENTA');
});
const sdk=`window.qaRows=JSON.parse(sessionStorage.getItem('qaRows')||'[]');window.qaError=false;window.qaGuardados=window.qaRows.length;window.addEventListener('beforeunload',()=>sessionStorage.setItem('qaRows',JSON.stringify(window.qaRows)));
window.kwSupabase={auth:{getUser:async()=>({data:{user:{id:'qa-user'}}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
from(tabla){let accion='select',payload,filtros=[],single=false;const q=new Proxy({}, {get(_,key){
 if(key==='then')return (resolve,reject)=>Promise.resolve().then(()=>{
  if(tabla!=='documentos_guardados')return {data:single?{role:'asesor',nombre:'Asesora',apellido:'QA',email:'perfil@example.com',whatsapp:'5511223344'}:[],error:null};
  if(window.qaError)return {data:null,error:{message:'Error de guardado simulado'}};
  if(accion==='insert'){window.qaGuardados++;const r={id:'qa-'+window.qaGuardados,estado:'borrador',updated_at:new Date().toISOString(),...payload};window.qaRows.push(r);return {data:{...r},error:null};}
  let filas=window.qaRows.filter(r=>filtros.every(([k,v])=>r[k]===v));
  if(accion==='update'){if(!filtros.some(([k,v])=>k==='user_id'&&v==='qa-user'))throw Error('Falta aislamiento de usuario');filas.forEach(r=>Object.assign(r,payload));}
  return {data:single?filas[0]||null:filas.map(r=>({...r})),error:null};
 }).then(resolve,reject);
 return (...args)=>{if(key==='insert'||key==='update'){accion=key;payload=args[0];}if(key==='eq')filtros.push(args);if(key==='single'||key==='maybeSingle')single=true;return q;};
 }});return q;},rpc:async(nombre,args)=>{const r=window.qaRows.find(r=>r.id===args.p_id);r.estado='finalizado';r.folio='COM-QA-001';return {data:r.folio,error:null};},
channel(){return {on(){return this},subscribe(){return this},unsubscribe(){}}},removeChannel(){}};
window.kwSession={usuarioInicial:(client=window.kwSupabase)=>client.auth.getUser(),perfilInicial:(client=window.kwSupabase)=>client.from('profiles').select('*').eq('id','qa-user').single()};
setTimeout(()=>{document.documentElement.classList.add('kw-auth-ok');window.dispatchEvent(new Event('kw-auth-ready'));},50);`;

test('los doce documentos usan la base visual compartida de Renta',async()=>{
 const documentos=['contratos/renta','contratos/profeco','contratos/comercial','acuerdos/aceptacionoferta','acuerdos/acuerdoreferido','acuerdos/avisodeprivacidad','acuerdos/cartaterminacion','acuerdos/cedularegistro','acuerdos/checklist','acuerdos/colaboracion','acuerdos/contrapropuesta','acuerdos/referido'];
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errores=[];page.on('pageerror',e=>errores.push(e.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/auth-guard.js'))return route.fulfill({contentType:'application/javascript',body:sdk});
   if(url.pathname.endsWith('/kw-session.js'))return route.fulfill({body:''});
   if(url.hostname!=='kw.local')return route.abort();
   const file=path.join(root,decodeURIComponent(url.pathname));
   return route.fulfill({status:existsSync(file)?200:404,body:existsSync(file)?readFileSync(file):'',contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
  });
  let referencia;
  for(const documento of documentos){
   const html=readFileSync(path.join(root,'documentos',documento+'.html'),'utf8');
   for(const recurso of ['kw-documentos-shell.css','kw-documentos-shell.js','kw-documentos-form.css','kw-revisiones.css'])assert.ok(html.includes(recurso),documento+': '+recurso);
   await page.goto('https://kw.local/documentos/'+documento+'.html',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.kwDocumentosShell&&document.querySelector('.kw-form-acciones'),null,{timeout:10000}).catch(e=>{throw new Error(documento+': '+errores.join('; ')+': '+e.message);});
   const estilos=await page.evaluate(()=>{
    const leer=(selector,props)=>{const s=getComputedStyle(document.querySelector(selector));return Object.fromEntries(props.map(p=>[p,s[p]]));};
    return {titulo:leer('.vista-lista-title',['fontFamily','fontSize','fontWeight']),columna:leer('.acuerdos-form-col',['fontFamily','width','padding']),pie:leer('.kw-form-acciones',['position','backgroundColor','borderTopWidth'])};
   });
   // Las dimensiones ocultas del formulario no dependen de los campos del contrato.
   if(!referencia)referencia=estilos;else assert.deepEqual(estilos,referencia,documento);
   if(documento==='contratos/comercial'){await page.locator('#btn-nuevo').click();await page.waitForURL(/\?nuevo=1$/);await page.waitForSelector('#com-asesor');}
   await page.evaluate(()=>{
    const form=document.getElementById('vista-formulario');form.hidden=false;form.style.display='block';
    document.body.classList.remove('en-lista-documentos');document.getElementById('vista-lista').style.display='none';
    window.updatePreview?.();
   });
   const marca=await page.locator('.page .doc-header img,.page .r-logo img,.page.comercial-hoja header img').first().evaluate(img=>{
    const pagina=img.closest('.page'),p=pagina.getBoundingClientRect(),r=img.getBoundingClientRect(),escala=p.width/pagina.offsetWidth;
    return {x:(r.x-p.x)/escala,y:(r.y-p.y)/escala,ancho:r.width/escala,alto:r.height/escala};
   });
   for(const [dato,valor]of Object.entries({x:documento.startsWith('contratos/')?64:72,y:30,ancho:98,alto:38}))assert.ok(Math.abs(marca[dato]-valor)<1.1,documento+': logo '+dato+'='+marca[dato]);
   if(documento==='contratos/renta'){
    await page.evaluate(()=>limpiarFormulario());
    await page.waitForFunction(()=>document.getElementById('f-asesor').value==='Asesora QA',null,{timeout:10000});
    await page.locator('#f-asesor').fill('Nombre editable');
    await page.locator('#f-monto').fill('');await page.locator('#f-monto').pressSequentially('8000.50');assert.equal(await page.locator('#f-monto').inputValue(),'8,000.50');
    await page.locator('#f-monto').fill('8000000');assert.equal(await page.locator('#f-monto').inputValue(),'8,000,000');
    await page.locator('#f-divisa').selectOption('USD',{force:true});
    await page.waitForFunction(()=>document.querySelector('#contrato-preview').innerText.includes('DÓLARES ESTADOUNIDENSES'));
    assert.equal((await page.evaluate(()=>datosActuales()))['f-divisa'],'USD');
    await page.evaluate(()=>abrirDocumentoGuardado({id:'anterior',estado:'borrador',datos:{'f-asesor':'Asesor guardado','f-monto':'1,234','f-divisa':'EUR'}},false));
    await page.waitForFunction(()=>document.getElementById('f-asesor').value==='Asesor guardado');
    assert.equal(await page.locator('#f-divisa').inputValue(),'EUR');
    assert.equal(await page.locator('#f-divisa').locator('..').locator('.kw-select-valor').innerText(),'EUR');
   }
  }
 }finally{await browser.close();}
});

test('los tres contratos muestran y exportan las mismas hojas en escritorio y movil',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/auth-guard.js'))return route.fulfill({contentType:'application/javascript',body:sdk});
   if(url.pathname.endsWith('/kw-session.js')||url.hostname==='cdn.jsdelivr.net')return route.fulfill({body:''});
   if(url.hostname==='cdnjs.cloudflare.com'&&process.env.QA_JSPDF)return route.fulfill({contentType:'application/javascript',body:readFileSync(process.env.QA_JSPDF)});
   if(url.hostname!=='kw.local')return route.abort();
   const file=path.join(root,decodeURIComponent(url.pathname));
   return route.fulfill({status:existsSync(file)?200:404,body:existsSync(file)?readFileSync(file):'',contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
  });
  let referencia;
  for(const nombre of ['renta','profeco','comercial']){
   await page.setViewportSize({width:1440,height:1000});
   await page.goto('https://kw.local/documentos/contratos/'+nombre+'.html?nuevo=1',{waitUntil:'domcontentloaded'});
   await page.waitForSelector('.kw-contrato-hoja');
   if(nombre==='profeco')await page.evaluate(()=>{
    document.getElementById('f-num-clientes').value='3';renderClientesFields();
    for(let i=0;i<3;i++){document.getElementById('f-cli'+i+'-nombre').value='CLIENTE DE PRUEBA '+(i+1);}
    updatePreview();window.kwContratoDocumento.render(configuracionDocumento());
   });
   if(nombre==='renta')await page.evaluate(()=>{
    const p=document.createElement('p');p.className='doc-p';p.innerHTML='<b>INICIO PRUEBA LARGA</b> '+('Contenido largo de prueba. '.repeat(1000))+'<b>FIN PRUEBA LARGA</b>';
    document.getElementById('contrato-raw').appendChild(p);window.kwContratoDocumento.render(configuracionDocumento());
   });
   const medidas=await page.locator('.page.kw-contrato-hoja').first().evaluate(el=>{const s=getComputedStyle(el),c=getComputedStyle(el.querySelector('.kw-contrato-cuerpo'));return [s.width,s.height,s.padding,s.fontFamily,s.fontSize,s.lineHeight,s.borderWidth,c.width];});
   if(!referencia)referencia=medidas;else assert.deepEqual(medidas,referencia,nombre+': mismo papel y tipografia');
   const revisar=()=>page.locator('.page .kw-contrato-cuerpo').evaluateAll(els=>els.every(el=>{const hoja=el.parentElement,r=hoja.getBoundingClientRect(),escala=r.width/hoja.offsetWidth;return (el.getBoundingClientRect().bottom-r.top)/escala<=991;}));
   assert.ok(await revisar(),nombre+': contenido dentro del papel');
   if(nombre==='renta')assert.ok((await page.locator('#contrato-preview').innerText()).includes('FIN PRUEBA LARGA'));
   if(nombre!=='comercial'){
    await page.evaluate(()=>{window.qaPaginasPDF=[];const crear=kwPDFVector.crear;kwPDFVector.crear=async(doc,op)=>{window.qaPaginasPDF=Array.from(doc.querySelectorAll('.print-page'),p=>({texto:p.textContent,width:p.offsetWidth,height:p.offsetHeight,logo:p.querySelector('img').complete&&p.querySelector('img').naturalWidth>0}));return crear(doc,op);};});
    const descarga=page.waitForEvent('download');
    await page.evaluate(()=>downloadPDF());const archivo=await descarga;
    mkdirSync(path.join(root,'artifacts/contratos'),{recursive:true});await archivo.saveAs(path.join(root,'artifacts/contratos/'+nombre+'.pdf'));
    const preview=await page.locator('.page.kw-contrato-hoja').allTextContents(),pdf=await page.evaluate(()=>qaPaginasPDF);
    assert.deepEqual(pdf.map(p=>p.texto),preview,nombre+': PDF conserva texto y saltos');
    assert.ok(pdf.every(p=>p.width===816&&p.height===1056));
    assert.ok(pdf.every(p=>p.logo),nombre+': el logo esta listo en todas las hojas antes de exportar');
    assert.equal((readFileSync(path.join(root,'artifacts/contratos/'+nombre+'.pdf'),'latin1').match(/\/Type \/Page\b/g)||[]).length,preview.length);
   }
   const primera=await page.locator('.page.kw-contrato-hoja').first().elementHandle();
   await page.locator('.kw-documento-hojas').evaluate(el=>el.scrollTop=150);
   const scroll=await page.locator('.kw-documento-hojas').evaluate(el=>el.scrollTop);
   const campo=page.locator(nombre==='comercial'?'#com-cliente':nombre==='renta'?'#f-asesor':'#f-cli0-nombre');if(nombre==='profeco')await campo.evaluate(el=>el.closest('details').open=true);await campo.fill('CAMBIO SIN PARPADEO');
   await page.waitForTimeout(200);assert.ok(await primera.evaluate(el=>el.isConnected),nombre+': mantiene el nodo de la hoja');
   assert.ok(Math.abs((await page.locator('.kw-documento-hojas').evaluate(el=>el.scrollTop))-scroll)<1);
   mkdirSync(path.join(root,'artifacts/contratos'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts/contratos/'+nombre+'-1440.png')});
   await page.setViewportSize({width:390,height:1000});
   if(nombre==='comercial')await page.locator('[data-kw-mobile="preview"]').click();else await page.evaluate(()=>showMobileTab('preview'));
   await page.waitForTimeout(100);assert.ok(await revisar(),nombre+': movil sin cortes');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(root,'artifacts/contratos/'+nombre+'-390.png')});
  }
 }finally{await browser.close();}
});

test('los tres contratos separan URLs, confirman borradores incompletos y navegan por miniaturas',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  for(const [nombre,tipo]of [['renta','acuerdo_renta'],['profeco','contrato_profeco'],['comercial','contrato_comercial']]){
   const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);
   await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/auth-guard.js'))return route.fulfill({contentType:'application/javascript',body:sdk});
    if(url.pathname.endsWith('/kw-session.js'))return route.fulfill({body:''});
    if(url.hostname!=='kw.local')return route.abort();
    const file=path.join(root,decodeURIComponent(url.pathname));return route.fulfill({status:existsSync(file)?200:404,body:existsSync(file)?readFileSync(file):'',contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
   });
   await page.goto('https://kw.local/documentos/contratos/'+nombre+'.html');
   await page.evaluate(tipo=>{
    window.qaRows=Array.from({length:80},(_,i)=>({id:'seed-'+i,user_id:'qa-user',tipo_documento:tipo,nombre_archivo:'Contrato '+i,estado:i<40?'borrador':'finalizado',datos:{},updated_at:new Date().toISOString()}));sessionStorage.setItem('qaRows',JSON.stringify(qaRows));
   },tipo);
   await page.reload();await page.waitForFunction(()=>Array.from(document.querySelectorAll('.lista-documentos')).every(el=>el.querySelectorAll('.kw-fila').length>=40)).catch(async e=>{throw new Error(nombre+': '+await page.locator('#vista-lista').innerText()+'; datos='+await page.evaluate(()=>qaRows.length)+'; '+e.message);});
   const paneles=await page.locator('.lista-documentos').evaluateAll(els=>els.map(el=>({alto:el.clientHeight,total:el.scrollHeight})));assert.ok(paneles.every(p=>p.total>p.alto&&p.alto>100),nombre+': dos tablas con scroll propio');
   await page.locator('#lista-borradores').evaluate(el=>el.scrollTop=250);
   assert.equal(await page.evaluate(()=>scrollY),0);assert.equal(await page.locator('#lista-finalizados').evaluate(el=>el.scrollTop),0);
   await page.locator('.btn-nuevo-documento').click();await page.waitForURL(/\?nuevo=1$/);await page.locator('#vista-formulario').waitFor({state:'visible'});
   await page.waitForFunction(()=>window.kwContratosUX&&document.querySelector('.kw-contrato-miniatura'));
   if(nombre==='profeco'){assert.equal(await page.locator('.acuerdo-grupo[open]').count(),1);assert.equal(await page.locator('.acuerdo-grupo[open] summary').innerText(),'Generales');assert.equal(await page.locator('.acuerdos-form-sub').count(),0);}
   const paginas=await page.locator('.page.kw-contrato-hoja').count();assert.equal(await page.locator('.kw-contrato-miniatura').count(),paginas);
   assert.equal(await page.locator('.page .kw-contrato-encabezado span').count(),0);
   await page.locator('.kw-contrato-miniatura').last().click();await page.waitForTimeout(450);assert.ok((await page.locator('.kw-documento-hojas').evaluate(el=>el.scrollTop))>0);
   const guardar=page.locator(nombre==='comercial'?'#comercial-guardar':'#btn-guardar');
   await guardar.click();await page.locator('#kw-borrador-incompleto').waitFor();assert.ok((await page.locator('.kw-campos-pendientes li').count())>0);
   await page.locator('#kw-borrador-incompleto .btn-modal-cancelar').click();assert.equal(await page.evaluate(()=>qaRows.length),80);assert.equal(await page.locator('#modal-nombre').isVisible(),false);
   await guardar.click();await page.locator('#kw-borrador-incompleto .btn-modal-confirmar').click();await page.locator('#modal-nombre-input').fill('Borrador incompleto QA');
   await page.locator('#modal-nombre .btn-modal-confirmar').click();await page.locator('#guardar-exito').waitFor({state:'visible'});await page.locator('#guardar-exito .guardar-exito-ok').click();
   await page.waitForURL(/\?doc=/);const url=page.url();assert.equal(await page.evaluate(()=>qaRows.length),81);
   await page.reload();await page.locator('#vista-formulario').waitFor({state:'visible'});assert.equal(page.url(),url);
   assert.equal(await page.locator(nombre==='comercial'?'#comercial-finalizar':'#btn-finalizar').isVisible(),true);
   await page.setViewportSize({width:390,height:1000});
   if(nombre==='comercial')await page.locator('[data-kw-mobile="preview"]').click();else await page.evaluate(()=>showMobileTab('preview'));
   await page.locator('[data-miniaturas]').click();assert.equal(await page.locator('.kw-contrato-miniaturas').isVisible(),true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   mkdirSync(path.join(root,'artifacts/contratos'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts/contratos/'+nombre+'-miniaturas.png')});
   await page.close();
  }
 }finally{await browser.close();}
});

test('comercial: captura, contenido completo, guardado, reapertura, errores, finalizacion y PDF',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  for(const width of [1440,390,320]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errores=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errores.push(e.message));
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/auth-guard.js'))return route.fulfill({contentType:'application/javascript',body:sdk});
    if(url.pathname.endsWith('/kw-session.js')||url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'application/javascript',body:''});
    if(url.hostname==='cdnjs.cloudflare.com'){
      // El PDF usa exactamente la misma version que los contratos existentes.
      const local=process.env.QA_JSPDF;
      if(local)return route.fulfill({contentType:'application/javascript',body:readFileSync(local)});
      return route.continue();
    }
    if(url.hostname!=='kw.local')return route.abort();
    const file=path.join(root,decodeURIComponent(url.pathname));
    if(!file.startsWith(root)||!existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({body:readFileSync(file),contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'application/octet-stream'});
   });
   await page.goto('https://kw.local/documentos/contratos/comercial.html',{waitUntil:'domcontentloaded'});
   await page.locator('#btn-nuevo').click();await page.waitForURL(/\?nuevo=1$/);await page.waitForSelector('#com-asesor');
   await page.waitForFunction(()=>document.getElementById('com-asesor').value==='Asesora QA',null,{timeout:10000});
   assert.equal(await page.locator('#com-correo_asesor').inputValue(),'perfil@example.com');
   assert.equal(await page.locator('#com-lugar_firma').inputValue(),'Ciudad de México');
   const lugar=page.getByRole('combobox',{name:'Lugar de firma'});await lugar.fill('yuca');await lugar.press('Enter');
   assert.equal(await page.locator('#com-lugar_firma').inputValue(),'Yucatán');
   assert.equal(await page.locator('#com-telefono_asesor').inputValue(),'5511223344');
   assert.equal(await page.locator('#com-representante,#com-mca').count(),0);
   assert.equal(await page.locator('#com-precio').locator('..').locator('[data-sumar],[data-restar]').count(),0);
   await page.locator('#com-precio').fill('8000000');assert.equal(await page.locator('#com-precio').inputValue(),'8,000,000');
   assert.equal(await page.locator('#com-divisa').inputValue(),'MXN');
   for(const [codigo,palabra]of [['USD','DÓLARES ESTADOUNIDENSES'],['EUR','EUROS'],['MXN','PESOS']]){
    await page.locator('#com-divisa').selectOption(codigo,{force:true});
    await page.waitForFunction(p=>document.getElementById('comercial-paginas').innerText.includes(p),palabra);
   }
   assert.equal(await page.locator('#comercial-finalizar').isVisible(),false);assert.equal(await page.locator('#comercial-descargar').isVisible(),false);
   assert.equal(await page.locator('#com-penalidad').inputValue(),'5');
   await page.locator('#com-penalidad').locator('..').locator('[data-sumar]').click();assert.equal(await page.locator('#com-penalidad').inputValue(),'10');
   await page.locator('#com-penalidad').locator('..').locator('[data-restar]').click();assert.equal(await page.locator('#com-penalidad').inputValue(),'5');
   assert.equal(await page.locator('#com-ciudad_notaria option').count(),33);
   await llenar(page,'pais_notaria','España');await llenar(page,'ciudad_notaria','Madrid');
   await llenar(page,'pais_notaria','México');assert.equal(await page.locator('#com-ciudad_notaria').inputValue(),'Ciudad de México');
   await page.locator('#com-tipo_inmueble').locator('..').locator('.kw-select-btn').click();
   await page.locator('.kw-select-opcion').filter({hasText:/^Oficina$/}).click();
   assert.equal(await page.locator('#com-tipo_inmueble').inputValue(),'Oficina');
   const valores={nombre:'Comercial QA',fecha:'2026-10-15',cliente:'CLIENTE DE PRUEBA',estado_civil:'Soltero(a)',rfc:'XAXX010101000',domicilio_cliente:'AVENIDA DE PRUEBA 10, CIUDAD DE MÉXICO',correo_cliente:'cliente@example.com',telefono_cliente:'5512345678',tipo_inmueble:'Local comercial',inmueble:'AVENIDA COMERCIAL 20, CIUDAD DE MÉXICO',escritura:'12345',fecha_escritura:'2020-05-12',notario:'NOTARIO DE PRUEBA',notaria:'123',ciudad_notaria:'Ciudad de México',asesor:'ASESORA DE PRUEBA',correo_asesor:'asesor@example.com',whatsapp_asesor:'5587654321',telefono_asesor:'5587654321',precio:'12343370'};
   for(const [id,v]of Object.entries(valores)){
     if(id==='nombre')continue;
     if(id==='fecha'||id==='fecha_escritura')await page.locator('#com-'+id).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
     else await llenar(page,id,v);
   }
   await page.waitForFunction(()=>document.querySelector('#comercial-paginas').innerText.includes('DOCE MILLONES'));
   const contenido=await page.locator('#comercial-paginas').innerText();
   for(const texto of ['I.DECLARA','II.DECLARA','III.DECLARA','CLÁUSULAS','NOVENA.','MCA KW PREMIER','CLIENTE DE PRUEBA','DOCE MILLONES TRESCIENTOS CUARENTA Y TRES MIL TRESCIENTOS SETENTA'])assert.ok(contenido.includes(texto),texto);
   assert.ok(!contenido.includes('ARRIOJA')&&!contenido.includes('regalos.topacio'),'no conserva datos del caso original');
   assert.equal(await page.locator('.acuerdos-form-col').count(),1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no hay scroll de pagina horizontal');
   assert.ok(await page.locator('.comercial-cuerpo').evaluateAll(els=>els.every(el=>{const hoja=el.closest('.comercial-hoja'),rect=hoja.getBoundingClientRect(),escala=rect.width/hoja.offsetWidth;if(!rect.width)return true;return (el.getBoundingClientRect().bottom-rect.top)/escala<=995;})),'ningun bloque sale de su hoja');
   assert.equal(await page.locator('#com-nombre').count(),0);
   const medidas=await page.evaluate(()=>({direccion:document.querySelector('#com-domicilio_cliente').getBoundingClientRect().width,cliente:document.querySelector('#com-cliente').getBoundingClientRect().width,alto:document.querySelector('#com-domicilio_cliente').getBoundingClientRect().height}));
   assert.ok(Math.abs(medidas.direccion-medidas.cliente)<1,'direcciones conservan el mismo ancho de campo');
   assert.ok(medidas.alto>42,'la direccion crece en alto para mostrar el contenido');
   const filas=await page.locator('.kw-documentos-campos').evaluateAll(grupos=>grupos.map(grupo=>Array.from(grupo.children).map(campo=>{
    const control=campo.querySelector('.kw-select-btn,input,textarea');const rect=control.getBoundingClientRect();return {id:control.id,x:rect.x,y:rect.y,ancho:rect.width};
   })));
   for(const fila of filas)for(let i=0;i<fila.length;i+=2){
    if(!fila[i+1])continue;
    assert.ok(Math.abs(fila[i].y-fila[i+1].y)<1,'controles alineados: '+fila[i].id+' / '+fila[i+1].id);
    assert.ok(Math.abs(fila[i].ancho-fila[i+1].ancho)<1,'columnas iguales');
    assert.ok(fila[i+1].x>fila[i].x,'dos campos ordenados por fila');
    if(fila[i+2])assert.ok(fila[i+2].y>fila[i].y,'el siguiente par empieza otra fila');
   }
   await page.locator('.kw-documento-hojas').evaluate(el=>el.scrollTop=200);
   const scrollAntes=await page.locator('.kw-documento-hojas').evaluate(el=>el.scrollTop);
   const hoja=await page.locator('.comercial-hoja').first().elementHandle();
   await page.locator('#com-cliente').press('End');await page.locator('#com-cliente').pressSequentially(' PRUEBA');
   await page.waitForTimeout(200);
   assert.equal(await hoja.evaluate(el=>el.isConnected),true,'editar conserva las hojas y evita parpadeo');
   assert.ok(Math.abs(await page.locator('.kw-documento-hojas').evaluate(el=>el.scrollTop)-scrollAntes)<1,'editar conserva el desplazamiento del documento');
   await page.locator('#com-cliente').fill(valores.cliente);
   const pie=await page.locator('.kw-form-acciones').boundingBox();
   await page.locator('.kw-form-scroll').evaluate(el=>el.scrollTop=500);
   assert.ok(Math.abs((await page.locator('.kw-form-acciones').boundingBox()).y-pie.y)<1,'pie fijo al desplazar campos');
   mkdirSync(path.join(root,'artifacts/comercial'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts/comercial/ajustes-'+width+'.png')});
   await page.locator('#comercial-guardar').click();
   await page.locator('#modal-nombre-input').fill('Comercial QA');await page.locator('#kw-documento-nombre-form button[type=submit]').click();
   await aviso(page,'Contrato guardado.');
   assert.equal(await page.evaluate(()=>qaRows.length),1);
   await page.goto('https://kw.local/documentos/contratos/comercial.html');
   await page.locator('[data-abrir]').first().waitFor({state:'visible'});
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('#vista-lista')).opacity==='1');
   await page.screenshot({path:path.join(root,'artifacts/comercial/lista-'+width+'.png')});
   await page.evaluate(()=>{delete qaRows[0].datos.clientes;delete qaRows[0].datos.numero_clientes;});
   await page.locator('[data-abrir]').first().click();await page.waitForURL(/\?doc=/);await page.locator('#vista-formulario').waitFor({state:'visible'});assert.equal(await page.locator('#com-inmueble').inputValue(),valores.inmueble);
   assert.equal(await page.locator('#com-num-clientes').inputValue(),'1','abre borradores anteriores de un cliente');
   await page.locator('#com-num-clientes').selectOption('6',{force:true});
   await page.locator('#comercial-finalizar').click();
   await aviso(page,'Completa el campo: Cliente 2: Nombre completo.');
   for(let i=2;i<=6;i++)for(const id of ['cliente','estado_civil','rfc','domicilio_cliente','correo_cliente','telefono_cliente'])await llenar(page,id+'_'+i,id==='cliente'?'CLIENTE ADICIONAL '+i:valores[id]);
   await page.locator('#com-num-clientes').selectOption('2',{force:true});await page.locator('#com-num-clientes').selectOption('6',{force:true});
   assert.equal(await page.locator('#com-cliente_6').inputValue(),'CLIENTE ADICIONAL 6','cambiar el selector conserva la captura');
   await page.locator('#comercial-guardar').click();await aviso(page,'Contrato guardado.');
   assert.equal(await page.evaluate(()=>qaRows[0].datos.clientes.length),6);
   assert.equal(await page.evaluate(()=>qaRows[0].datos.lugar_firma),'Yucatán');
   await llenar(page,'pais_notaria','España');await llenar(page,'ciudad_notaria','Madrid');await llenar(page,'divisa','EUR');
   await page.locator('#comercial-guardar').click();await aviso(page,'Contrato guardado.');
   await page.goto('https://kw.local/documentos/contratos/comercial.html');await page.locator('[data-abrir]').first().click();await page.waitForURL(/\?doc=/);await page.locator('#vista-formulario').waitFor({state:'visible'});
   assert.equal(await page.locator('#com-num-clientes').inputValue(),'6');assert.equal(await page.locator('#com-cliente_6').inputValue(),'CLIENTE ADICIONAL 6');
   assert.equal(await page.locator('#com-pais_notaria').inputValue(),'España');assert.equal(await page.locator('#com-ciudad_notaria').inputValue(),'Madrid');assert.equal(await page.locator('#com-divisa').inputValue(),'EUR');
   await page.waitForFunction(()=>document.querySelector('#comercial-paginas').innerText.includes('POR EL CLIENTE 6'));
   const multiples=await page.locator('#comercial-paginas').innerText();
   for(let i=2;i<=6;i++)assert.ok(multiples.includes('CLIENTE ADICIONAL '+i),'incluye declaraciones y firma del cliente '+i);
   await page.locator('#com-precio').fill('1500000');await page.evaluate(()=>{qaError=true;});
   await page.locator('#comercial-guardar').click();await aviso(page,'Error de guardado simulado');
   assert.equal(await page.locator('#com-precio').inputValue(),'1,500,000');await page.evaluate(()=>{qaError=false;});
   await page.locator('#comercial-guardar').click();await aviso(page,'Contrato guardado.');
   await page.evaluate(()=>{window.kwUI.confirm=async()=>true;});
   await page.locator('#com-pago_promesa').fill('60');await page.locator('#comercial-finalizar').click();
   await aviso(page,'Los porcentajes de pago deben sumar 100 %. ');
   assert.equal(await page.evaluate(()=>qaRows[0].estado),'borrador');await page.locator('#com-pago_promesa').fill('20');
   await page.locator('#comercial-finalizar').click();await aviso(page,'Contrato finalizado. Folio: COM-QA-001');
   assert.equal(await page.locator('#com-cliente').isDisabled(),true);
   assert.equal(await page.getByRole('combobox',{name:'Lugar de firma'}).isDisabled(),true);
   assert.equal(await page.locator('#com-cliente_6').isDisabled(),true);assert.equal(await page.locator('#com-num-clientes').isDisabled(),true);
   await page.addScriptTag({path:path.join(root,'assets/vendor/jspdf/jspdf-4.2.1.umd.min.js')});
   await page.evaluate(()=>{
    window.qaLogos=[];const original=window.jspdf.jsPDF.API.addImage;
    window.jspdf.jsPDF.API.addImage=function(...args){if(args[0]?.alt==='KW Premier')window.qaLogos.push(args.slice(2,6));return original.apply(this,args);};
   });
   const pdf=page.waitForEvent('download');await page.locator('#comercial-descargar').click();const download=await pdf;
   const logosPDF=await page.evaluate(()=>qaLogos);assert.ok(logosPDF.length>0,'el PDF incluye el logo');
   for(const logo of logosPDF)for(let i=0;i<4;i++)assert.ok(Math.abs(logo[i]-[64,30,98,38][i]*25.4/96)<.01,'logo PDF conserva medidas y posicion');
   mkdirSync(path.join(root,'artifacts/comercial'),{recursive:true});await download.saveAs(path.join(root,'artifacts/comercial/comercial-'+width+'.pdf'));
   await page.screenshot({path:path.join(root,'artifacts/comercial/comercial-'+width+'.png'),fullPage:true});
   await page.locator('#comercial-copiar').click();assert.equal(await page.locator('#com-cliente').isEnabled(),true);await page.locator('#comercial-guardar').click();await page.locator('#kw-documento-nombre-form button[type=submit]').click();await aviso(page,'Contrato guardado.');
   assert.equal(await page.locator('#com-cliente_6').inputValue(),'CLIENTE ADICIONAL 6','la copia conserva todos los clientes');
   assert.equal(await page.evaluate(()=>qaRows.length),2,'copia crea un documento independiente');
   assert.deepEqual(errores,[]);await page.close();
  }
 }finally{await browser.close();}
});
