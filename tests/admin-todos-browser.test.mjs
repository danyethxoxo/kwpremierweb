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
        estadoGoogle = {'beto@example.com':{contactos:false,drive:false,calendario:false}};
        bdAsesores = [{id:'a',nombre:'Ana',correo:'ana@example.com',grupo:'asesor_activo'},
          {id:'b',nombre:'Beto López',correo:'beto@example.com',grupo:'back_office_activo'},
          {id:'c',nombre:'Baja',correo:'baja@example.com',grupo:'asesor_baja'}];
        gruposAsesores = gruposDesdeBase(); grupoActivo = 'todos';
        armarTabsAsesores(); pintarGrupos(); document.body.classList.add('en-asesores');
        document.getElementById('contenido-panel').style.display = '';
        prepararPanelLateral(); cambiarTabPanel('asesores');
      }, guardarAltaPagina};`;
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
        else {const u=window.testUsers.find(u=>u.id===body.user_id);if(body.role)u.role=body.role;if(body.nombre!==undefined)u.nombre=body.nombre;}
        return new Response(JSON.stringify({ok:true,user_id:'new'}));
      };
    });
    await page.addScriptTag({ content: main });
    await page.evaluate(() => {window.qa.setup('master');document.documentElement.classList.add('kw-auth-ok');});
    const list = page.locator('#lista-todos');
    assert.equal(await list.locator('.kw-fila').count(), 5);
    assert.ok(!(await list.textContent()).includes('baja@example.com'));
    const beto = list.locator('.kw-fila').filter({hasText:'beto@example.com'});
    await beto.locator('.btn-abrir-accesos').click();
    assert.deepEqual(await beto.locator('.acceso-texto').allTextContents(),['Agregar Contacto','Agregar Drive','Agregar Calendario']);
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('#lista-todos .acceso-google-icono')).filter(e=>e.closest('.accesos').dataset.correo==='beto@example.com').every(e=>e.complete&&e.naturalWidth>0));
    const controls = await beto.locator('.accesos-fila > .acceso, .accesos-fila .acceso-web, .accesos-fila .acceso-rol').evaluateAll(items=>items.map(e=>e.getBoundingClientRect().top));
    assert.ok(controls.every(top=>top===controls[0]),'Google, Web y Rol comparten una fila');
    assert.equal(await beto.getByRole('button',{name:'Administrar Rol',exact:true}).isDisabled(),true);
    await beto.locator('.acceso-check[value="drive"]').check();
    assert.equal(await beto.locator('.acceso-seleccion-accion.dar').isEnabled(),true);
    await beto.locator('.acceso-check[value="drive"]').uncheck();
    assert.equal(await beto.locator('.acceso-seleccion-accion.dar').isDisabled(),true);
    await page.screenshot({path:path.join(root,'..','admin-access-controls.png'),fullPage:true});
    await beto.getByRole('button',{name:'Agregar a Web',exact:true}).click();
    assert.equal(await page.locator('#acceso-pagina-persona').textContent(),'Beto López');
    assert.equal(await page.locator('#acceso-pagina-correo').textContent(),'beto@example.com');
    assert.deepEqual(await page.locator('#acceso-pagina-rol option').evaluateAll(opts=>opts.map(o=>o.value)),['','admin','staff','asociado']);
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
    assert.equal(await beto.getByRole('button',{name:'Agregar a Web',exact:true}).isDisabled(),true);
    await beto.getByRole('button',{name:'Administrar Rol',exact:true}).click();
    await page.evaluate(()=>{const s=document.getElementById('acceso-pagina-rol');s.value='staff';s.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('#acceso-pagina-guardar').click();await page.locator('#modal-acceso-pagina').waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>window.records.at(-1).body),{accion:'actualizar',user_id:'new',role:'staff'});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await beto.getByRole('button',{name:'Administrar Rol',exact:true}).click();
    assert.equal(await page.locator('#modal-acceso-pagina').isVisible(),true);
    await page.locator('#acceso-pagina-cancelar').click();
    await page.evaluate(()=>window.qa.setup('admin'));
    await beto.getByRole('button',{name:'Administrar Rol',exact:true}).click();
    assert.deepEqual(await page.locator('#acceso-pagina-rol option').evaluateAll(opts=>opts.map(o=>o.value)),['','staff','asociado']);
    await page.locator('#acceso-pagina-cancelar').click();
    await page.evaluate(()=>window.qa.setup('staff'));
    assert.equal(await list.locator('[data-acceso-pagina]').count(),0);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});
