import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import sharp from 'sharp';
const root=fileURLToPath(new URL('../',import.meta.url));
// Reutiliza la cuenta y los documentos simulados de la prueba de contratos.
const sdk=readFileSync(path.join(root,'tests/contrato-comercial-browser.test.mjs'),'utf8').split('const sdk=`')[1].split('`;')[0];
const marca=`
const original=kwSupabase.auth.getUser;
kwSupabase.auth.getUser=async()=>{const r=await original();r.data.user.user_metadata=JSON.parse(sessionStorage.getItem('marca')||'{}');return r;};
kwSupabase.auth.updateUser=async({data})=>{if(window.fallarLogo)return {error:{message:'No se pudo guardar el perfil'}};sessionStorage.setItem('marca',JSON.stringify(data));return {data:{user:(await kwSupabase.auth.getUser()).data.user}};};
kwSupabase.storage={from:()=>({getPublicUrl:r=>({data:{publicUrl:'https://kw.local/perfiles/'+r}}),upload:async(r,blob)=>{const data=await new Promise(resolve=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.readAsDataURL(blob);});sessionStorage.setItem('imagenLogo',data);return {data:{path:r},error:null};}})};
`;
test('logo: perfil reutilizable, copia por contrato, bloqueo y encabezado PDF sin deformar',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);
  const errores=[];page.on('pageerror',e=>errores.push(e.message));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname.endsWith('/auth-guard.js'))return route.fulfill({body:sdk+marca,contentType:'application/javascript'});
   if(u.pathname.startsWith('/perfiles/')){const img=await page.evaluate(()=>sessionStorage.getItem('imagenLogo'));return route.fulfill({body:Buffer.from(img.split(',')[1],'base64'),contentType:'image/png'});}
   if(u.hostname!=='kw.local'||u.pathname.endsWith('/kw-session.js'))return route.fulfill({body:'',contentType:'application/javascript'});
   const f=path.join(root,decodeURIComponent(u.pathname));return route.fulfill({status:existsSync(f)?200:404,body:existsSync(f)?readFileSync(f):'',contentType:f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':'application/javascript'});
  });
  mkdirSync(path.join(root,'artifacts/logos'),{recursive:true});
  const buffer=await sharp({create:{width:300,height:80,channels:4,background:'#226688'}}).png().toBuffer();
  for(const nombre of ['renta','comercial']){
   await page.goto('https://kw.local/documentos/contratos/'+nombre+'.html?nuevo=1');
   await page.locator('#kw-logo-empresa-archivo').waitFor({state:'attached'});await page.waitForFunction(()=>!kwLogoEmpresa.pendiente());
   assert.equal(await page.locator('#kw-logo-empresa-archivo').isVisible(),false);
   assert.equal(await page.getByRole('button',{name:'Subir logo',exact:true}).isVisible(),true);
   await page.locator('#kw-logo-empresa-archivo').setInputFiles({name:'empresa.png',mimeType:'image/png',buffer});
   await page.locator('.kw-logo-recorte .btn-modal-confirmar').click();
   await page.waitForFunction(()=>kwLogoEmpresa.obtener()&&!kwLogoEmpresa.pendiente());
   assert.equal(await page.getByRole('button',{name:'Subir logo',exact:true}).isVisible(),false);
   assert.equal(await page.getByRole('button',{name:'Eliminar logo',exact:true}).isVisible(),true);
   assert.equal(await page.locator('#kw-logo-empresa [role="status"]').textContent(),'');
   await page.getByRole('button',{name:'Eliminar logo',exact:true}).click();
   await page.waitForFunction(()=>!kwLogoEmpresa.obtener()&&!kwLogoEmpresa.pendiente());
   assert.equal(await page.getByRole('button',{name:'Subir logo',exact:true}).isVisible(),true);
   await page.locator('#kw-logo-empresa-archivo').setInputFiles({name:'empresa.png',mimeType:'image/png',buffer});
   await page.locator('.kw-logo-recorte .btn-modal-confirmar').click();
   await page.waitForFunction(()=>kwLogoEmpresa.obtener()&&!kwLogoEmpresa.pendiente());
   const guardado=await page.evaluate(()=>kwLogoEmpresa.obtener());
   await page.getByRole('button',{name:'Recortar logo',exact:true}).click();
   await page.locator('.kw-logo-recorte canvas').waitFor();
   assert.equal(await page.evaluate(()=>kwLogoEmpresa.pendiente()),true);
   const canvas=page.locator('.kw-logo-recorte canvas');
   const box=await canvas.boundingBox();
   await page.mouse.move(box.x+box.width-2,box.y+box.height-2);await page.mouse.down();
   await page.mouse.move(box.x+box.width*.6,box.y+box.height*.8);await page.mouse.up();
   const recorte=await page.locator('.kw-recorte-vista img').getAttribute('src');
   assert.notEqual(recorte,guardado,'el recorte cambia la imagen de salida');
   await page.locator('.kw-logo-recorte [data-cancelar]').click();
   await page.waitForFunction(()=>!kwLogoEmpresa.pendiente());
   assert.equal(await page.evaluate(()=>kwLogoEmpresa.obtener()),guardado,'cancelar conserva el logo');
   await page.setViewportSize({width:390,height:844});
   await page.getByRole('button',{name:'Recortar logo',exact:true}).click();
   await page.locator('.kw-logo-recorte canvas').waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.waitForTimeout(200);
   await page.screenshot({path:path.join(root,'artifacts/logos/'+nombre+'-recorte-mobile.png')});
   await page.locator('.kw-logo-recorte canvas').press('Escape');
   await page.waitForFunction(()=>!kwLogoEmpresa.pendiente());
   await page.setViewportSize({width:1440,height:1000});

   assert.ok(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('marca')).kw_logo_empresa_url.includes('/qa-user/logo-empresa-')));
   await page.waitForTimeout(200);
   const medidas=await page.locator('.kw-contrato-hoja').first().evaluate(hoja=>{const a=hoja.querySelector('.kw-contrato-encabezado img').getBoundingClientRect(),b=hoja.querySelector('.kw-logo-empresa-hoja').getBoundingClientRect(),texto=hoja.querySelector('.kw-contrato-cuerpo').getBoundingClientRect();return {ancho:Math.abs(b.width/a.width-1.1)<.01,alto:Math.abs(b.height/a.height-1.1)<.01,top:Math.abs(a.top-b.top)<1,derecha:b.left>a.right,inicio:Math.abs(a.left-texto.left)<1,fin:Math.abs(b.right-texto.right)<1};});
   assert.deepEqual(medidas,{ancho:true,alto:true,top:true,derecha:true,inicio:true,fin:true});
   // Cambiar el perfil no cambia el logo de un documento ya guardado.
   await page.evaluate(async logo=>{sessionStorage.setItem('marca','{}');await kwLogoEmpresa.cargar({logo_empresa:logo},true);},guardado);
   assert.equal(await page.locator('#kw-logo-empresa-archivo').isDisabled(),true);
   assert.equal(await page.getByRole('button',{name:'Recortar logo',exact:true}).isDisabled(),true);
   assert.equal(await page.evaluate(()=>kwLogoEmpresa.obtener()),guardado);
   await page.evaluate(()=>kwLogoEmpresa.cargar({},true));assert.equal(await page.evaluate(()=>kwLogoEmpresa.obtener()),'');
   await page.evaluate(()=>kwLogoEmpresa.cargar(null,false,true));await page.waitForFunction(()=>!kwLogoEmpresa.pendiente());
   await page.evaluate(()=>window.fallarLogo=true);
   await page.locator('#kw-logo-empresa-archivo').setInputFiles({name:'empresa.png',mimeType:'image/png',buffer});
   await page.locator('.kw-logo-recorte .btn-modal-confirmar').click();
   await page.waitForFunction(()=>!kwLogoEmpresa.pendiente());assert.equal(await page.evaluate(()=>kwLogoEmpresa.obtener()),'');
   assert.match(await page.locator('#kw-logo-empresa [role="status"]').innerText(),/No se pudo guardar/);
   await page.evaluate(()=>window.fallarLogo=false);
   await page.locator('#kw-logo-empresa-archivo').setInputFiles({name:'empresa.png',mimeType:'image/png',buffer});
   await page.locator('.kw-logo-recorte .btn-modal-confirmar').click();await page.waitForFunction(()=>kwLogoEmpresa.obtener()&&!kwLogoEmpresa.pendiente());
   await page.reload();await page.waitForFunction(()=>kwLogoEmpresa.obtener()&&!kwLogoEmpresa.pendiente());await page.locator('.kw-contrato-hoja').first().waitFor();
   assert.equal(await page.evaluate(()=>kwLogoEmpresa.obtener()),guardado,'reutiliza el perfil tras recargar');
   await page.locator(nombre==='renta'?'#btn-guardar':'#comercial-guardar').click();
   await page.locator('#kw-borrador-incompleto .btn-modal-confirmar').click();
   await page.locator('#modal-nombre-input').fill('Contrato con logo');
   await page.locator('#modal-nombre .btn-modal-confirmar').click();
   await page.waitForFunction(()=>qaRows.some(r=>r.datos?.logo_empresa));
   assert.equal(await page.evaluate(()=>qaRows.at(-1).datos.logo_empresa),guardado,'guarda una copia del logo con el contrato');
   await page.locator('#guardar-exito .guardar-exito-ok').click();
   await page.evaluate(()=>sessionStorage.setItem('marca','{}'));
   await page.reload();await page.locator('.kw-contrato-hoja').first().waitFor();
   assert.equal(await page.evaluate(()=>kwLogoEmpresa.obtener()),guardado,'reabre el contrato con su logo aunque el perfil ya no tenga logo');
   mkdirSync(path.join(root,'artifacts/logos'),{recursive:true});
   await page.screenshot({path:path.join(root,'artifacts/logos/'+nombre+'-desktop.png')});
   await page.setViewportSize({width:390,height:844});
   await page.evaluate(()=>{if(window.showMobileTab)showMobileTab('preview');else kwDocumentosShell.mobile('preview');});
   await page.waitForTimeout(150);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(root,'artifacts/logos/'+nombre+'-mobile.png')});
   await page.setViewportSize({width:1440,height:1000});
   await page.evaluate(async()=>{
    window.kwPDFVector={crear:async doc=>{window.logoPDF=Array.from(doc.querySelectorAll('.kw-logo-empresa-hoja'),img=>({src:img.src,w:img.width,h:img.height,lista:img.complete&&img.naturalWidth>0}));return {save(){}};}};
    const p=document.createElement('p');p.textContent='Contrato de prueba';
    await kwContratoDocumento.exportar({stack:document.querySelector('.kw-contrato-hoja').parentElement.closest('.page-stack').id,titulo:'Prueba',bloques:()=>[p]});
   });
   const pdf=await page.evaluate(()=>logoPDF);assert.ok(pdf.length);assert.ok(pdf.every(img=>img.src===guardado&&img.w===108&&img.h===42&&img.lista));
   if(nombre==='renta')assert.equal(await page.evaluate(()=>datosActuales().logo_empresa),guardado);
  }
  assert.deepEqual(errores,[]);
 }finally{await browser.close();}
});
