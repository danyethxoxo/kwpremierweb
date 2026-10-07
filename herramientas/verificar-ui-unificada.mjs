import http from 'node:http';
import {readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync} from 'node:fs';
import {resolve, extname} from 'node:path';
import {chromium} from 'playwright';
const root=process.cwd();
const server=http.createServer((req,res)=>{const file=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base=`http://127.0.0.1:${server.address().port}`;
const mock=`
document.documentElement.classList.add('kw-auth-ok');
window.kwSupabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel(){},auth:{getUser:async()=>({data:{user:{id:'qa'}}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async()=>({data:[]}),from(table){const data=table==='profiles'?{role:'master',nombre:'QA'}:table==='roles_kw'?[{id:'DT',nombre:'Tecnología',color:'#8a0000'}]:table==='documentos_internos'?[{id:'abc',titulo:'ABC de la tecnología',descripcion:'Seguimiento',href:'dt/abc-tracker.html',roles:['DT']}]:[];const q=new Proxy({}, {get(t,k){if(k==='then')return (ok,bad)=>Promise.resolve({data,error:null}).then(ok,bad);return ()=>q}});return q;}};`;
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
mkdirSync('outputs/ui-unificada',{recursive:true});
const resultados=[];
try {
 for(const width of [1440,390]) {
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.route('https://**/*',r=>r.abort());
  await context.route('**/auth-guard.js*',r=>r.fulfill({contentType:'application/javascript',body:mock}));
  const page=await context.newPage();
  const documentos=['documentos/contratos','documentos/acuerdos'].flatMap(dir=>readdirSync(dir).filter(f=>f.endsWith('.html')&&readFileSync(dir+'/'+f,'utf8').includes('const TIPO_DOCUMENTO')).map(f=>dir+'/'+f));
  for(const path of ['documentos/internos/index.html','hub/prospectos.html','hub/drive.html','hub/plantillas.html','perfil.html','hub/calendario.html',...documentos]) {
   const errores=[];page.removeAllListeners('pageerror');page.on('pageerror',e=>errores.push(e.message));
   await page.goto(base+'/'+path+((path.includes('/contratos/')||path.includes('/acuerdos/'))?'?nuevo=1':''),{waitUntil:'load'});
   await page.waitForTimeout(200);
   if(path.includes('/contratos/')||path.includes('/acuerdos/')) {
    await page.evaluate(()=>{crearNuevoDocumento();});
    await page.locator('#vista-formulario').waitFor();
    await page.waitForTimeout(100);
    await page.evaluate(()=>{estadoActual='finalizado';actualizarVisibilidadBotones();kwRevisiones.iniciar({id:()=> 'qa',estado:()=> 'finalizado',folio:()=> 'QA',revision:()=>0});kwRevisiones.refrescar();});
    const enlazar=await page.locator('#btn-enlazar-dictamen').count();
    if(enlazar!==Number(path.includes('/contratos/')))throw new Error('Enlazar incorrecto: '+path);
    if(width<900)await page.evaluate(()=>showMobileTab('preview'));
    await page.locator('.kw-documento-zoom input').evaluate(el=>{el.value='75';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.evaluate(()=>updatePreview());await page.waitForTimeout(100);
    const scale=await page.locator('.kw-documento-preview-zoom .page').first().evaluate(el=>el.style.transform);
    if(scale!=='scale(0.75)')throw new Error('Zoom no se conserva '+path+' '+scale);
    await page.click('[data-zoom-ajustar]');await page.waitForTimeout(100);
    if(path.includes('acuerdoreferido')) {
     const alturas=await page.locator('.referido-form-grid input, .referido-form-grid textarea').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
     if(width>900&&alturas.some(h=>h!==44))throw new Error('Campos con alturas distintas');
    }
   }
   if(path==='documentos/internos/index.html') {
    await page.locator('a[data-doc-id="abc"]').waitFor({timeout:3000});
    const href=await page.locator('a[data-doc-id="abc"]').getAttribute('href');
    if(!href.endsWith('/documentos/internos/dt/abc-tracker.html'))throw new Error('Ruta incorrecta '+href);
    await page.fill('#kw-card-search','inexistente');
    if(await page.locator('.kw-liderazgo-rol').isVisible())throw new Error('Filtro no oculta rol');
    await page.fill('#kw-card-search','ABC');
    await page.locator('.kw-liderazgo-rol').waitFor({timeout:3000});
    await page.waitForTimeout(350);
   }
   const medicion=await page.evaluate(()=>({desbordamiento:document.documentElement.scrollWidth-innerWidth,campanas:document.querySelectorAll('#notif-bell-slot').length,principal:document.querySelector('main')?.getBoundingClientRect().x}));
   if(medicion.desbordamiento>0||medicion.campanas>1)throw new Error('Distribucion incorrecta '+path);
   if(!path.includes('/contratos/')&&!path.includes('/acuerdos/')&&medicion.principal!==(width>=1024?292:0))throw new Error('Barra tapa contenido '+path);
   if(errores.length)throw new Error(path+': '+errores.join('; '));
   await page.screenshot({path:'outputs/ui-unificada/'+path.replaceAll('/','-')+'-'+width+'.png',fullPage:false});
   resultados.push({path,width,...medicion,errores});
  }
  await context.close();
 }
 writeFileSync('outputs/ui-unificada/resultado.json',JSON.stringify(resultados,null,2));
 console.log(JSON.stringify(resultados));
} finally {await browser.close();server.close();}
