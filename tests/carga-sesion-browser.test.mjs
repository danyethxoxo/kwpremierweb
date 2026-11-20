import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

test('una sesion detenida permite reintentar sin autorizar respuestas tardias ni repetir al cambiar de ventana',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try {
  const page=await browser.newPage();
  await page.clock.install();
  await page.route('**/*',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/carga-prueba.html')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>html:not(.kw-auth-ok) body{visibility:hidden}</style><script>
    window.calls=0; window.healthy=false;
    window.kwSession={limpiarInicio(){},mfaState(){window.calls++;return window.healthy?Promise.resolve({activo:true,verificado:true}):new Promise(r=>window.late=r)}};
    window.supabase={createClient:()=>({auth:{onAuthStateChange(){}}})};
    </script><script src="/assets/js/auth-guard.js"></script></head><body>Contenido protegido</body></html>`});
   if(path==='/assets/js/auth-guard.js')return route.fulfill({contentType:'application/javascript',body:readFileSync(new URL('../assets/js/auth-guard.js',import.meta.url),'utf8')});
   return route.abort();
  });
  await page.goto('https://kweb.com.mx/carga-prueba.html');
  await page.locator('#kw-cargando').waitFor();
  await page.clock.fastForward(26000);
  await page.getByRole('button',{name:'Reintentar'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('kw-auth-ok')),false);
  await page.evaluate(()=>window.late({activo:true,verificado:true}));
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('kw-auth-ok')),false,'Una respuesta tardia no abre la pagina');
  await page.evaluate(()=>{window.healthy=true});
  await page.getByRole('button',{name:'Reintentar'}).click();
  await page.waitForFunction(()=>document.documentElement.classList.contains('kw-auth-ok'));
  const calls=await page.evaluate(()=>window.calls);
  await page.evaluate(()=>{for(let i=0;i<5;i++)document.dispatchEvent(new Event('visibilitychange'))});
  assert.equal(await page.evaluate(()=>window.calls),calls);
  await page.clock.fastForward(16000);
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(n=>window.calls===n,calls+1);
 }finally{await browser.close()}
});
