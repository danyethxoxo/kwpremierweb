import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
test('las comisiones decimales conservan los ceros al escribirse en letra',()=>{
 const script=readFileSync(path.join(root,'assets/js/contrato-comercial.js'),'utf8');
 const contexto=vm.createContext({});
 vm.runInContext(script.slice(script.indexOf('  function entero('),script.indexOf('  function valoresDocumento(')),contexto);
 assert.equal(contexto.letras('5.05'),'CINCO PUNTO CERO CINCO');
 assert.equal(contexto.letras('5'),'CINCO');
 assert.equal(contexto.entero(12343370),'DOCE MILLONES TRESCIENTOS CUARENTA Y TRES MIL TRESCIENTOS SETENTA');
});
const sdk=`window.qaRows=[];window.qaError=false;window.qaGuardados=0;
window.kwSupabase={auth:{getUser:async()=>({data:{user:{id:'qa-user'}}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
from(tabla){let accion='select',payload,filtros=[],single=false;const q=new Proxy({}, {get(_,key){
 if(key==='then')return (resolve,reject)=>Promise.resolve().then(()=>{
  if(tabla!=='documentos_guardados')return {data:single?{role:'asesor',nombre:'Asesora QA'}:[],error:null};
  if(window.qaError)return {data:null,error:{message:'Error de guardado simulado'}};
  if(accion==='insert'){window.qaGuardados++;const r={id:'qa-'+window.qaGuardados,estado:'borrador',updated_at:new Date().toISOString(),...payload};window.qaRows.push(r);return {data:{...r},error:null};}
  let filas=window.qaRows.filter(r=>filtros.every(([k,v])=>r[k]===v));
  if(accion==='update'){if(!filtros.some(([k,v])=>k==='user_id'&&v==='qa-user'))throw Error('Falta aislamiento de usuario');filas.forEach(r=>Object.assign(r,payload));}
  return {data:single?filas[0]||null:filas.map(r=>({...r})),error:null};
 }).then(resolve,reject);
 return (...args)=>{if(key==='insert'||key==='update'){accion=key;payload=args[0];}if(key==='eq')filtros.push(args);if(key==='single'||key==='maybeSingle')single=true;return q;};
 }});return q;},rpc:async(nombre,args)=>{const r=window.qaRows.find(r=>r.id===args.p_id);r.estado='finalizado';r.folio='COM-QA-001';return {data:r.folio,error:null};},
channel(){return {on(){return this},subscribe(){return this},unsubscribe(){}}},removeChannel(){}};
setTimeout(()=>{document.documentElement.classList.add('kw-auth-ok');window.dispatchEvent(new Event('kw-auth-ready'));},50);`;

test('comercial: captura, contenido completo, guardado, reapertura, errores, finalizacion y PDF',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errores=[];page.on('pageerror',e=>errores.push(e.message));
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
   await page.goto('http://kw.local/documentos/contratos/comercial.html',{waitUntil:'domcontentloaded'});
   await page.locator('#btn-nuevo').click();
   const valores={nombre:'Comercial QA',fecha:'2026-10-15',cliente:'CLIENTE DE PRUEBA',estado_civil:'SOLTERO',rfc:'XAXX010101000',domicilio_cliente:'AVENIDA DE PRUEBA 10, CIUDAD DE MÉXICO',correo_cliente:'cliente@example.com',telefono_cliente:'5512345678',tipo_inmueble:'LOCAL COMERCIAL',inmueble:'AVENIDA COMERCIAL 20, CIUDAD DE MÉXICO',escritura:'12345',fecha_escritura:'2020-05-12',notario:'NOTARIO DE PRUEBA',notaria:'123',ciudad_notaria:'CIUDAD DE MÉXICO',asesor:'ASESORA DE PRUEBA',correo_asesor:'asesor@example.com',whatsapp_asesor:'5587654321',telefono_asesor:'5587654321',precio:'12343370'};
   for(const [id,v]of Object.entries(valores)){
     if(id==='fecha'||id==='fecha_escritura')await page.locator('#com-'+id).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
     else await page.locator('#com-'+id).fill(v);
   }
   await page.waitForFunction(()=>document.querySelector('#comercial-paginas').innerText.includes('DOCE MILLONES'));
   const contenido=await page.locator('#comercial-paginas').innerText();
   for(const texto of ['I.DECLARA','II.DECLARA','III.DECLARA','CLÁUSULAS','NOVENA.','MCA KW PREMIER','CLIENTE DE PRUEBA','DOCE MILLONES TRESCIENTOS CUARENTA Y TRES MIL TRESCIENTOS SETENTA'])assert.ok(contenido.includes(texto),texto);
   assert.ok(!contenido.includes('ARRIOJA')&&!contenido.includes('regalos.topacio'),'no conserva datos del caso original');
   assert.equal(await page.locator('#notif-bell-slot').count(),1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no hay scroll de pagina horizontal');
   assert.ok(await page.locator('.comercial-cuerpo').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().bottom-el.closest('.comercial-hoja').getBoundingClientRect().top<=995)),'ningun bloque sale de su hoja');
   await page.locator('#comercial-guardar').click();await page.getByText('Contrato guardado.',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>qaRows.length),1);
   await page.locator('[data-vista-universal="lista"]').last().click();
   await page.locator('[data-abrir]').click();assert.equal(await page.locator('#com-inmueble').inputValue(),valores.inmueble);
   await page.locator('#com-precio').fill('1500000');await page.evaluate(()=>{qaError=true;});
   await page.locator('#comercial-guardar').click();await page.getByText('Error de guardado simulado',{exact:true}).waitFor();
   assert.equal(await page.locator('#com-precio').inputValue(),'1500000');await page.evaluate(()=>{qaError=false;});
   await page.locator('#comercial-guardar').click();await page.getByText('Contrato guardado.',{exact:true}).waitFor();
   await page.evaluate(()=>{window.kwUI.confirm=async()=>true;});
   await page.locator('#com-pago_promesa').fill('60');await page.locator('#comercial-finalizar').click();
   await page.getByText('Los porcentajes de pago deben sumar 100 %. ',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>qaRows[0].estado),'borrador');await page.locator('#com-pago_promesa').fill('20');
   await page.locator('#comercial-finalizar').click();await page.getByText('Contrato finalizado. Folio: COM-QA-001',{exact:true}).waitFor();
   assert.equal(await page.locator('#com-cliente').isDisabled(),true);
   const pdf=page.waitForEvent('download');await page.locator('#comercial-descargar').click();const download=await pdf;
   mkdirSync(path.join(root,'artifacts/comercial'),{recursive:true});await download.saveAs(path.join(root,'artifacts/comercial/comercial-'+width+'.pdf'));
   await page.screenshot({path:path.join(root,'artifacts/comercial/comercial-'+width+'.png'),fullPage:true});
   await page.locator('#comercial-copiar').click();assert.equal(await page.locator('#com-cliente').isEnabled(),true);await page.locator('#comercial-guardar').click();await page.getByText('Contrato guardado.',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>qaRows.length),2,'copia crea un documento independiente');
   assert.deepEqual(errores,[]);await page.close();
  }
 }finally{await browser.close();}
});
