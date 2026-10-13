import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const user={id:'11111111-1111-4111-8111-111111111111',email:'qa@example.com',last_sign_in_at:new Date().toISOString()};
const perfil={...user,role:'admin',nombre:'QA',apellido:'Carga',foto_url:'/assets/img/logo-kw-premier.png',
  whatsapp:'5512345678',sitio_web:'https://qa.kw.com',puede_dictaminar:true};
const sdk=`
window.qaLecturas={usuario:0,perfil:0};
const qaUser=${JSON.stringify(user)},qaPerfil=${JSON.stringify(perfil)};
const qaSession={user:qaUser,access_token:'header.'+btoa(JSON.stringify({amr:[{method:'password',timestamp:Date.now()/1000}]}))+'.signature'};
window.supabase={createClient(){return {
  auth:{getSession:async()=>({data:{session:qaSession}}),
    getUser:async()=>{window.qaLecturas.usuario++;return {data:{user:qaUser}};},
    onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},
  from(tabla){let single=false;const filtros=[];
    const query=new Proxy({}, {get(target,key){
      if(key==='then')return (resolve,reject)=>{
        const propio=tabla==='profiles'&&filtros.some(f=>f[0]==='id'&&f[1]===qaUser.id);
        if(propio)window.qaLecturas.perfil++;
        let data=tabla==='profiles'?[qaPerfil]:[];
        if(single)data=data[0]||null;
        return Promise.resolve({data,error:null,count:Array.isArray(data)?data.length:1}).then(resolve,reject);
      };
      return (...args)=>{if(key==='single'||key==='maybeSingle')single=true;if(key==='eq')filtros.push(args);return query;};
    }});return query;},
  rpc:async()=>({data:{sin_tope:true},error:null}),
  channel(){return {on(){return this;},subscribe(){return this;},unsubscribe(){}};},
  removeChannel(){},functions:{invoke:async()=>({data:{},error:null})}
};}};
`;

test('siete pantallas reutilizan usuario y perfil verificados sin peticiones extra, escritorio y móvil',async()=>{
  const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
  const paginas=[['/portal.html','#portal-cards'],['/perfil.html','#perfil-nombre'],
    ['/hub/base-asesores.html','#bd-lista'],['/hub/firmas.html','#lista-envios'],
    ['/documentos/internos/gps.html','#lista'],['/hub/tickets.html','#inc-filas'],['/hub/resenas.html','tbody']];
  try {
    for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
      for(const [ruta,selector]of paginas){
        const page=await browser.newPage({viewport});
        const errores=[];page.on('pageerror',e=>errores.push(e.message));
        await page.route('**/*',async route=>{
          const url=new URL(route.request().url());
          if(url.pathname.includes('/functions/v1/mfa-correo'))return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({activo:true,verificado:true,requerido:true,usuario:user,perfil})});
          if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('/@supabase/'))return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/javascript',body:sdk});
          if(url.hostname!=='kw.local')return route.abort();
          const file=path.join(root,decodeURIComponent(url.pathname));
          if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
          const contentType=file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream';
          // El SDK simulado tiene otro hash; solo el HTML de la prueba omite SRI.
          const body=file.endsWith('.html')?fs.readFileSync(file,'utf8').replace(/\s+(?:integrity|crossorigin)="[^"]*"/g,''):fs.readFileSync(file);
          return route.fulfill({contentType,body});
        });
        await page.goto('http://kw.local'+ruta,{waitUntil:'domcontentloaded'});
        try {await page.waitForFunction(()=>document.documentElement.classList.contains('kw-auth-ok'),null,{timeout:5000});}
        catch(error){throw new Error(ruta+': '+errores.join('; ')+' '+await page.locator('body').innerText()+' '+error.message);}
        await page.locator(selector).first().waitFor({state:'attached'});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const reads=await page.evaluate(()=>window.qaLecturas);
        assert.deepEqual(reads,{usuario:0,perfil:0},ruta+' '+viewport.width);
        assert.deepEqual(errores,[],ruta+' '+viewport.width);
        await page.close();
      }
    }
  } finally {await browser.close();}
});
