import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../', import.meta.url));

test('Todos y acceso a la página: alta con nombre, rol, errores, duplicados y vista móvil', async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let html = fs.readFileSync(path.join(root, 'hub/admin.html'), 'utf8');
    let main = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m => m[1].includes('function initAdmin')).at(1);
    main = main.slice(0, main.lastIndexOf("  if (document.documentElement.classList.contains('kw-auth-ok'))")) + `
      window.qa = {setup(role) {
        miRol = role; miUserId = 'self';
        usuariosCache = window.testUsers;
        estadoGoogle = {};
        bdAsesores = [{id:'a',nombre:'Ana',correo:'ana@example.com',grupo:'asesor_activo'},
          {id:'b',nombre:'Beto López',correo:'beto@example.com',grupo:'back_office_activo'},
          {id:'c',nombre:'Baja',correo:'baja@example.com',grupo:'asesor_baja'}];
        gruposAsesores = gruposDesdeBase(); grupoActivo = 'todos';
        armarTabsAsesores(); pintarGrupos(); document.body.classList.add('en-asesores');
        document.getElementById('contenido-panel').style.display = '';
        prepararPanelLateral(); cambiarTabPanel('asesores');
      }, guardarAltaPagina, pintarGrupos, actualizarAccesosGoogleVisibles, moverAcceso, abrirVerificacion, cargarEstadoGoogle, accesoDesdeVerif, escucharCambiosDelLibro,
      estado(){return {google:estadoGoogle,verificacion:ultimaVerificacion};},
      google(lista){ultimaVerificacion=lista;estadoGoogleListo=true;aplicarEstado(lista);actualizarAccesosGoogleVisibles();}};`;
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'kw.local') return route.abort();
      if (url.pathname === '/hub/admin.html') return route.fulfill({ body: html, contentType: 'text/html' });
      const file = path.join(root, decodeURIComponent(url.pathname));
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
    });
    await page.goto('http://kw.local/hub/admin.html');
    await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'assets/js/kw-ui.js'), 'utf8') });
    await page.evaluate(() => {
      window.records = [];window.testUsers = [
        {id:'u1',nombre:'Ana',email:'ANA@example.com',role:'asociado'},
        {id:'u2',nombre:'Líder',email:'lider@example.com',role:'staff'},
        {id:'u3',nombre:'General',email:'general@example.com',role:'asociado'},
        {id:'self',nombre:'Máster',email:'master@example.com',role:'master'}];
      window.kwSupabase = {auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},
        from(){return {select(){return this},order:async()=>({data:window.testUsers})}}};
      window.fetch = async (url, options) => {
        const body = JSON.parse(options.body);window.records.push({url,body});
        await new Promise(resolve => setTimeout(resolve, 80));
        if (window.failNext) {window.failNext=false;return new Response(JSON.stringify({error:'Servicio no disponible'}),{status:503});}
        if (body.nombre !== undefined && window.failName) {window.failName=false;return new Response(JSON.stringify({error:'No se pudo guardar el nombre'}),{status:503});}
        if (url.includes('invitar-usuario')) window.testUsers.push({id:'new',nombre:'',email:body.email,role:body.rol});
        else if (body.user_id) {const u=window.testUsers.find(u=>u.id===body.user_id);if(body.role)u.role=body.role;if(body.nombre!==undefined)u.nombre=body.nombre;if(body.puesto!==undefined)u.puesto=body.puesto;}
        return new Response(JSON.stringify({ok:true,user_id:'new'}));
      };
    });
    await page.addScriptTag({ content: main });
    await page.evaluate(() => {window.qa.setup('master');document.documentElement.classList.add('kw-auth-ok');});
    const list = page.locator('#lista-todos');
    assert.equal(await list.locator('.kw-fila').count(), 5);
    assert.equal(await list.locator('.asesor-menu-btn').count(), 5);
    const primerRenglon = await list.locator('.kw-fila').first().elementHandle();
    await page.evaluate(()=>window.qa.actualizarAccesosGoogleVisibles());
    assert.equal(await primerRenglon.evaluate(el=>el.isConnected),true,'Google conserva los renglones sin volver a animarlos');
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    assert.equal(await primerRenglon.evaluate(el=>el.isConnected),true,'regresar a la pestaña conserva la lista');
    const usuarioWeb = list.locator('.kw-fila').filter({hasText:'lider@example.com'});
    await usuarioWeb.locator('.asesor-menu-btn').click();
    await usuarioWeb.locator('[data-menu-usuario]').click();
    await page.locator('#modal-editar-usuario').waitFor({state:'visible'});
    assert.equal(await page.locator('#edit-email').inputValue(),'lider@example.com');
    await page.evaluate(()=>cerrarModalEditar());
    assert.ok(!(await list.textContent()).includes('baja@example.com'));
    const beto = list.locator('.kw-fila').filter({hasText:'beto@example.com'});
    await beto.locator('.btn-abrir-accesos').click();
    assert.deepEqual(await beto.locator('.acceso-texto').allTextContents(),['Agregar Contacto','Agregar Drive','Agregar Calendario']);
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('#lista-todos .acceso-google-icono')).filter(e=>e.closest('.accesos').dataset.correo==='beto@example.com').every(e=>e.complete&&e.naturalWidth>0));
    const controls = await beto.locator('.accesos-fila > .acceso, .accesos-fila .acceso-web, .accesos-fila .acceso-rol').evaluateAll(items=>items.map(e=>e.getBoundingClientRect().top));
    assert.ok(controls.every(top=>top===controls[0]),'Google, Web y Rol comparten una fila');
    assert.equal(await beto.getByRole('button',{name:/Administrar Rol/}).isDisabled(),true);
    assert.equal(await beto.locator('.acceso-label').first().evaluate(el=>getComputedStyle(el).cursor),'pointer');
    assert.equal(await beto.locator('.acceso-check:enabled').count(),3,'puede dar accesos aunque falte verificar Google');
    await beto.locator('.acceso-check[value="drive"]').check();
    assert.equal(await beto.locator('.acceso-seleccion-accion.dar').isEnabled(),true);
    await page.evaluate(()=>window.qa.pintarGrupos());
    assert.equal(await beto.locator('.acceso-check[value="drive"]').isChecked(),true,'un repintado conserva la selección');
    assert.equal(await beto.locator('.acceso-seleccion-accion.dar').isEnabled(),true);
    await beto.locator('.acceso-check[value="drive"]').uncheck();
    assert.equal(await beto.locator('.acceso-seleccion-accion.dar').isDisabled(),true);
    const tarjetaGoogle=await list.locator('.kw-fila').first().elementHandle();
    assert.equal(await list.locator('.asesor-tipo.asesor').count(),2);
    assert.equal(await list.locator('.asesor-tipo.backoffice').count(),1);
    assert.equal(await list.locator('.asesor-tipo.liderazgo').count(),2);
    await page.evaluate(()=>{
      window.qa.google([{correo:'ana@example.com',nombre:'Ana',grupo:'activos',contactos:true,drive:true,calendario:true},
        {correo:'beto@example.com',nombre:'Beto López',grupo:'back_office_activo',contactos:false,drive:false,calendario:false}]);
    });
    const capsules=await list.locator('.btn-abrir-accesos').evaluateAll(els=>els.map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})));
    assert.ok(capsules.every(r=>r.w===capsules[0].w&&r.h===capsules[0].h),'con y sin check conservan el mismo tamaño');
    const columns=await list.locator('.kw-fila-cabeza').evaluateAll(els=>els.map(el=>({tipo:el.querySelector('.asesor-tipo').getBoundingClientRect().left,id:el.querySelector('.kw-fila-extra .kw-extra').getBoundingClientRect().left,fecha:el.querySelectorAll('.kw-fila-extra .kw-extra')[1].getBoundingClientRect().left})));
    assert.ok(columns.every(c=>Math.abs(c.tipo-columns[0].tipo)<1&&Math.abs(c.id-columns[0].id)<1&&Math.abs(c.fecha-columns[0].fecha)<1),'tipo, ID y fecha conservan su columna');
    const actions=await beto.locator('.acceso-seleccion-accion').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().toJSON()));
    assert.ok(Math.abs(actions[1].left-actions[0].right-8)<1,'Agregar y Retirar están juntos');
    assert.equal(await beto.locator('.accesos-encabezado').count(),0);
    await page.evaluate(()=>{
      window.baseFetch=window.fetch;window.googleCalls=0;
      window.kwUI.confirm=async()=>true;
      window.fetch=async(url,options)=>{
        const body=JSON.parse(options.body);
        if(body.accion!=='acceso')return window.baseFetch(url,options);
        ++window.googleCalls;await new Promise(r=>setTimeout(r,200));
        if(window.failGoogle){window.failGoogle=false;return new Response(JSON.stringify({error:'Google no disponible'}),{status:503});}
        if(window.partialGoogle){window.partialGoogle=false;return Response.json({ok:false,estado:[{correo:'beto@example.com',contactos:true,drive:true,calendario:false}],hechas:[{correo:'beto@example.com',ok:false,resultados:[{paso:'calendario',ok:false,detalle:'No se pudo compartir'}]}]});}
        const estado={correo:'beto@example.com',nombre:'Beto López',grupo:'back_office_activo',contactos:true,drive:!body.quitar,calendario:!body.quitar};
        return Response.json({ok:true,estado:[estado],hechas:[{correo:estado.correo,ok:true,resultados:[]}]});
      };
      window.qa.moverAcceso('beto@example.com',['drive','calendario'],false);
      window.qa.moverAcceso('beto@example.com',['drive','calendario'],false);
    });
    await beto.locator('.accesos[aria-busy="true"]').waitFor();
    assert.equal(await beto.locator('.accesos-progreso').isVisible(),true);
    assert.equal(await page.locator('#accesos-carga.visible').count(),0,'no bloquea toda la pantalla');
    await page.waitForFunction(()=>window.qa.estado().google['beto@example.com'].drive===true);
    await beto.locator('.accesos:not([aria-busy="true"])').waitFor();
    assert.equal(await page.evaluate(()=>window.googleCalls),1,'doble clic no duplica permisos');
    assert.equal(await tarjetaGoogle.evaluate(el=>el.isConnected),true,'dar accesos conserva las tarjetas');
    assert.equal(await beto.locator('.btn-abrir-accesos').evaluate(el=>el.classList.contains('listo')),true);
    await page.evaluate(()=>window.qa.abrirVerificacion());
    const verBeto=page.locator('.verif-item').filter({hasText:'beto@example.com'});
    assert.match(await verBeto.locator('[data-acceso="drive"]').innerText(),/con acceso/);
    await page.evaluate(()=>window.qa.accesoDesdeVerif(['beto@example.com'],['drive','calendario'],true));
    assert.match(await verBeto.locator('[data-acceso="drive"]').innerText(),/sin acceso/);
    assert.equal(await beto.locator('.btn-abrir-accesos').evaluate(el=>el.classList.contains('listo')),false);
    assert.equal(await tarjetaGoogle.evaluate(el=>el.isConnected),true,'retirar desde revisión no reconstruye la lista');
    await page.evaluate(()=>{document.getElementById('modal-verificar').style.display='none';window.failGoogle=true;return window.qa.moverAcceso('beto@example.com',['drive'],false);});
    assert.equal(await page.evaluate(()=>window.qa.estado().google['beto@example.com'].drive),false,'fallo conserva el estado confirmado');
    assert.equal(await beto.getByRole('button',{name:/Administrar Rol/}).isDisabled(),true,'fallo no habilita permisos Web');
    await page.evaluate(()=>{window.partialGoogle=true;return window.qa.moverAcceso('beto@example.com',['drive','calendario'],false);});
    assert.equal(await page.evaluate(()=>window.qa.estado().google['beto@example.com'].drive),true);
    assert.equal(await page.evaluate(()=>window.qa.estado().verificacion.find(p=>p.correo==='beto@example.com').calendario),false);
    assert.equal(await beto.locator('.btn-abrir-accesos').evaluate(el=>el.classList.contains('listo')),false,'un resultado parcial no muestra todos los accesos completos');
    await page.evaluate(async()=>{
      const normal=window.fetch;
      window.fetch=async(url,options)=>{
        if(JSON.parse(options.body).accion!=='verificar')return normal(url,options);
        ++window.revisiones;await new Promise(r=>setTimeout(r,400));
        return Response.json({personas:[{correo:'beto@example.com',nombre:'Beto López',grupo:'back_office_activo',contactos:true,drive:false,calendario:false}]});
      };
      window.revisiones=0;
      const lecturas=[window.qa.cargarEstadoGoogle(),window.qa.cargarEstadoGoogle()];
      await window.qa.moverAcceso('beto@example.com',['drive','calendario'],false);
      await Promise.all(lecturas);window.fetch=normal;
    });
    assert.equal(await page.evaluate(()=>window.revisiones),1,'verificaciones simultáneas comparten una petición');
    assert.equal(await page.evaluate(()=>window.qa.estado().google['beto@example.com'].drive),true,'una lectura anterior no pisa un cambio reciente');
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(root,'..','admin-access-design-mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'tarjetas sin desbordes en móvil');
    await page.setViewportSize({width:1366,height:900});
    await page.evaluate(()=>{window.fetch=window.baseFetch;window.records=[];window.qa.google([{correo:'ana@example.com',nombre:'Ana',grupo:'activos',contactos:true,drive:true,calendario:true},{correo:'beto@example.com',nombre:'Beto López',grupo:'back_office_activo',contactos:false,drive:false,calendario:false}]);});
    await page.screenshot({path:path.join(root,'..','admin-access-design.png'),fullPage:true});
    await page.screenshot({path:path.join(root,'..','admin-access-controls.png'),fullPage:true});
    await beto.getByRole('button',{name:/Agregar a Web/}).click();
    assert.equal(await page.locator('#acceso-pagina-persona').textContent(),'Beto López');
    assert.equal(await page.locator('#acceso-pagina-correo').textContent(),'beto@example.com');
    assert.deepEqual(await page.locator('#acceso-pagina-rol option').evaluateAll(opts=>opts.map(o=>o.value)),['','admin','staff','asociado']);
    assert.equal(await page.locator('#acceso-pagina-puesto-wrap').isVisible(),false);
    const alignment=await page.locator('#acceso-pagina-form h3, #acceso-pagina-form .acceso-alta-persona, #acceso-pagina-form .field:not([hidden]), #acceso-pagina-form .modal-actions').evaluateAll(els=>els.map(el=>Math.round(el.getBoundingClientRect().left)));
    assert.ok(alignment.every(x=>x===alignment[0]),'título, identidad, campos y acciones comparten el borde izquierdo');
    await page.screenshot({path:path.join(root,'..','admin-alta-modal-desktop.png'),animations:'disabled'});
    await page.evaluate(()=>{window.failNext=true;const s=document.getElementById('acceso-pagina-rol');s.value='asociado';s.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('#acceso-pagina-guardar').click();
    await page.locator('#acceso-pagina-msg').getByText('Servicio no disponible',{exact:true}).waitFor();
    await page.evaluate(()=>{window.failName=true;window.qa.guardarAltaPagina({preventDefault(){}});window.qa.guardarAltaPagina({preventDefault(){}});});
    await page.locator('#acceso-pagina-msg').getByText('No se pudo guardar el nombre',{exact:true}).waitFor();
    await page.evaluate(()=>{window.qa.guardarAltaPagina({preventDefault(){}});window.qa.guardarAltaPagina({preventDefault(){}});});
    await page.locator('#modal-acceso-pagina').waitFor({state:'hidden'});
    const calls = await page.evaluate(()=>window.records);
    assert.equal(calls.length,4);assert.deepEqual(calls[1].body,{email:'beto@example.com',rol:'asociado'});
    assert.deepEqual(calls[2].body,{accion:'actualizar',user_id:'new',nombre:'Beto López',apellido:''});
    assert.deepEqual(calls[3].body,{accion:'actualizar',user_id:'new',role:'asociado',nombre:'Beto López',apellido:''});
    assert.equal(await list.locator('.kw-fila').count(),5);
    assert.equal(await beto.getByRole('button',{name:/Agregar a Web/}).isDisabled(),true);
    await beto.getByRole('button',{name:/Administrar Rol/}).click();
    await page.evaluate(()=>{const s=document.getElementById('acceso-pagina-rol');s.value='staff';s.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal(await page.locator('#acceso-pagina-puesto-wrap').isVisible(),true);
    assert.equal(await page.locator('#acceso-pagina-puesto option').count(),9);
    const requestsBefore=await page.evaluate(()=>window.records.length);
    await page.evaluate(()=>window.qa.guardarAltaPagina({preventDefault(){}}));
    assert.equal(await page.evaluate(()=>window.records.length),requestsBefore,'no guarda Liderazgo sin elegir puesto');
    await page.locator('#acceso-pagina-msg').getByText('Selecciona el puesto de Liderazgo.',{exact:true}).waitFor();
    await page.evaluate(()=>{const s=document.getElementById('acceso-pagina-puesto');s.value='Technology Director';s.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('#acceso-pagina-guardar').click();await page.locator('#modal-acceso-pagina').waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>window.records.at(-1).body),{accion:'actualizar',user_id:'new',role:'staff',puesto:'Technology Director'});
    // Las acciones de Google funcionan aun sin estado conocido.
    await beto.locator('.acceso-check[value="drive"]').check();
    await page.evaluate(()=>{window.kwUI.confirm=async()=>true;});
    await beto.locator('.acceso-seleccion-accion.dar').click();
    await page.waitForFunction(()=>window.records.some(r=>r.body.accion==='acceso'));
    assert.deepEqual(await page.evaluate(()=>window.records.find(r=>r.body.accion==='acceso').body.pasos),['drive']);
    await page.locator('#accesos-carga').waitFor({state:'hidden'});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await beto.getByRole('button',{name:/Administrar Rol/}).click();
    assert.equal(await page.locator('#modal-acceso-pagina').isVisible(),true);
    assert.equal(await page.locator('#acceso-pagina-puesto').inputValue(),'Technology Director');
    assert.equal(await page.locator('#acceso-pagina-puesto-wrap').isVisible(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(root,'..','admin-alta-modal-mobile.png'),animations:'disabled'});
    await page.evaluate(()=>{const s=document.getElementById('acceso-pagina-rol');s.value='asociado';s.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal(await page.locator('#acceso-pagina-puesto-wrap').isVisible(),false);
    assert.equal(await page.locator('#acceso-pagina-puesto').isDisabled(),true);
    await page.locator('#acceso-pagina-cancelar').click();
    await page.evaluate(()=>window.qa.setup('admin'));
    await beto.getByRole('button',{name:/Administrar Rol/}).click();
    assert.deepEqual(await page.locator('#acceso-pagina-rol option').evaluateAll(opts=>opts.map(o=>o.value)),['','staff','asociado']);
    await page.locator('#acceso-pagina-cancelar').click();
    // Un alta nueva de Liderazgo guarda el puesto junto con la identidad.
    await page.setViewportSize({width:1366,height:900});
    await page.evaluate(()=>{window.testUsers=window.testUsers.filter(u=>u.id!=='new');window.qa.setup('master');});
    if (!await beto.getByRole('button',{name:/Agregar a Web/}).isVisible()) await beto.locator('.btn-abrir-accesos').click();
    await beto.getByRole('button',{name:/Agregar a Web/}).click();
    await page.evaluate(()=>{const rol=document.getElementById('acceso-pagina-rol');rol.value='staff';rol.dispatchEvent(new Event('change',{bubbles:true}));const puesto=document.getElementById('acceso-pagina-puesto');puesto.value='Team Leader';puesto.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('#acceso-pagina-guardar').click();
    await page.locator('#modal-acceso-pagina').waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>window.records.at(-1).body),{accion:'actualizar',user_id:'new',nombre:'Beto López',apellido:'',puesto:'Team Leader'});
    assert.equal(await page.evaluate(()=>window.testUsers.find(u=>u.id==='new').puesto),'Team Leader');
    await page.evaluate(()=>window.qa.setup('staff'));
    assert.equal(await list.locator('[data-acceso-pagina]').count(),0);
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'assets/js/kw-asesores-excel.js'),'utf8')});
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'assets/vendor/exceljs/exceljs-4.4.0.min.js'),'utf8')});
    await page.locator('#btn-mas').click();assert.equal(await page.locator('#op-descargar-excel').isVisible(),true);
    const downloading=page.waitForEvent('download');await page.locator('#op-descargar-excel').click();const download=await downloading;assert.match(download.suggestedFilename(),/\.xlsx$/);assert.equal(await download.failure(),null);
    await page.evaluate(()=>{
      window.syncReads=0;const original=window.kwSupabase.from;
      window.kwSupabase.from=table=>table==='asesores'?{select(){return this;},order:async()=>{window.syncReads++;return{data:[{id:'a',nombre:'Ana actualizada',correo:'ana@example.com',grupo:'asesor_activo'}],error:null};}}:original(table);
      window.kwSupabase.channel=()=>({on(event,filter,cb){window.sheetCallback=cb;return this;},subscribe(){return this;}});window.kwSupabase.removeChannel=()=>{};
      window.qa.escucharCambiosDelLibro();window.sheetCallback({new:{activo:true,cambios_at:'anterior'}});window.sheetCallback({new:{activo:false,cambios_at:'anterior'}});
    });
    await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.syncReads),0,'una revisión sin cambios no recarga el directorio');
    await page.evaluate(()=>window.sheetCallback({new:{activo:false,cambios_at:'nuevo'}}));await page.waitForFunction(()=>window.syncReads===1);await list.getByText('Ana actualizada',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});
