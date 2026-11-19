import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright';
const root=new URL('../',import.meta.url);
const leer=p=>fs.readFileSync(new URL(p,root));

test('el logo nuevo tiene transparencia real y conserva la cápsula negra',async()=>{
 const {data,info}=await sharp(leer('assets/img/kweb-logo-flecha.png')).raw().toBuffer({resolveWithObject:true});
 assert.equal(info.channels,4);
 assert.equal(data[3],0);
 assert.ok(data[(210*info.width+650)*4+3]>250);
});

test('KWEB usa el mismo logo en navegación, acceso y cargas; conserva marcas de documentos y Premier',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try{
  for(const host of ['kweb.com.mx','www.kwpremieroficial.com'])for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async r=>{
    const url=new URL(r.request().url());
    if(url.pathname==='/qa-logo.html')return r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><title>Prueba</title><script>
      window.kwSession={deviceToken:()=>'',mfaState:()=>new Promise(r=>window.soltarSesion=r),prepararInicio(){}};
      window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}})};
      </script><script src="/assets/js/kw-security.js"></script><script src="/assets/js/auth-guard.js"></script>
      <style>body{margin:24px;font-family:Arial}header img,.kw-lateral-logo img,main.card>img{width:180px;height:auto}.muestras{display:flex;gap:20px;margin-top:24px}.muestras img{width:240px}.oscuro{background:#222;padding:16px}.claro{background:white;padding:16px}</style></head><body>
      <header><a class="logo" aria-label="KW Premier"><img src="/assets/img/logo-kw-premier.png" alt="KW Premier"></a></header>
      <div class="kw-lateral-logo"><img src="/assets/img/logo-kw-premier.png" alt="KW Premier"></div>
      <main class="card"><img class="logo" src="/assets/img/logo-kw-premier.png" alt="KW Premier"></main>
      <div id="documento-legal"><img width="180" src="/assets/img/logo-kw-premier.png" alt="KW Premier"></div>
      <div class="muestras"><div class="claro"><img src="/assets/img/kweb-logo-flecha.png"></div><div class="oscuro"><img src="/assets/img/kweb-logo-flecha.png"></div></div>
      </body></html>`});
    if(url.pathname.startsWith('/assets/'))return r.fulfill({contentType:url.pathname.endsWith('.js')?'application/javascript':'image/png',body:leer(url.pathname.slice(1))});
    return r.abort();
   });
   await page.goto('https://'+host+'/qa-logo.html');
   const esperado=host==='kweb.com.mx'?'/assets/img/kweb-logo-flecha.png':'/assets/img/logo-kw-premier.png';
   await page.waitForFunction(src=>document.querySelector('#kw-cargando img')?.getAttribute('src')===src,esperado);
   assert.equal(await page.locator('header .logo img').getAttribute('src'),esperado);
   assert.equal(await page.locator('main.card>img').getAttribute('src'),esperado);
   assert.equal(await page.locator('#documento-legal img').getAttribute('src'),'/assets/img/logo-kw-premier.png');
   const out=path.resolve('outputs/marca-kweb');fs.mkdirSync(out,{recursive:true});
   await page.screenshot({path:path.join(out,host+'-carga-'+width+'.png')});
   await page.evaluate(()=>soltarSesion({activo:true,verificado:true,requerido:true}));
   await page.locator('#kw-cargando').waitFor({state:'detached'});
   assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('kw-auth-ok')),true);
   if(host==='kweb.com.mx'){
    await page.evaluate(()=>{const c=document.createElement('div');c.id='kw-cargando';c.innerHTML='<img src="/assets/img/logo-kw-premier.png" alt="KW Premier">';document.body.append(c);});
    await page.waitForFunction(()=>document.querySelector('#kw-cargando img').getAttribute('src')==='/assets/img/kweb-logo-flecha.png');
    await page.evaluate(()=>document.getElementById('kw-cargando').remove());
   }
   await page.screenshot({path:path.join(out,host+'-pagina-'+width+'.png')});
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();}
});
