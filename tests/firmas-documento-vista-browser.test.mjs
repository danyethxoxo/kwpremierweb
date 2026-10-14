import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {posicionesDeWeetrust} from '../supabase/functions/firmar-documento/documento-vista.ts';

const html=readFileSync(new URL('../hub/firmas.html',import.meta.url),'utf8');
const inicio=html.indexOf('  async function abrirDocumento(');
const abrir=html.slice(inicio,html.indexOf('  // ── Retomar un borrador',inicio));
const estilos=['kw-base.css','kw-claro.css'].map(f=>readFileSync(new URL('../assets/css/'+f,import.meta.url),'utf8')).join('\n')+
 [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]).join('\n');
const modal=html.slice(html.indexOf('<div id="modal-doc"'),html.indexOf('<div id="modal-detalle"'));

test('importados muestran trazos y campos pendientes en escritorio y movil, sin CORS ni duplicar el PDF completado',async()=>{
 const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
 try {
  const trazo='data:image/png;base64,'+(await sharp(Buffer.from('<svg width="160" height="40"><path d="M8 30 Q25 3 40 24 T80 16 T135 22 L151 9" stroke="black" stroke-width="3" fill="none"/></svg>')).png().toBuffer()).toString('base64');
  const suyos=Array.from({length:3},(_,n)=>({emailID:'firmado'+n+'@kw.mx',isSigned:1,fieldArray:[{type:'SIGNATURE',page:0,
   originalLeft:n%2?320:60,originalScale:1,lastScale:1,pageYv2:530+n*60,width:160,height:40,viewport:{width:600,height:800},ref:trazo}]}));
  const posiciones=posicionesDeWeetrust({signatory:suyos,staticSignPositions:[{user:{email:'pendiente@kw.mx'},page:1,coordinates:{x:320,y:530},imageSize:{width:160,height:40},parentImageSize:{width:600,height:800}}]});
  const firmantes=suyos.map((s,n)=>({correo:s.emailID,nombre:'Firmante '+n,firmado:true})).concat({correo:'pendiente@kw.mx',nombre:'Firmante pendiente',firmado:false});
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:900}});
   const errores=[];page.on('pageerror',error=>errores.push(error.message));
   await page.setContent('<html class="kw-auth-ok"><style>'+estilos+'</style><body>'+modal+'</body></html>');
   await page.addScriptTag({content:`var $=id=>document.getElementById(id),pedidos=[],dibujos=0;
    var visibles=[{id:'importado',titulo:'Prueba de documento parcial',estado:'pendiente',weetrust_document_id:'remoto',firmantes:[],posiciones:[]}],miPerfil={correo:'yo@kw.mx'};
    var datos=${JSON.stringify({firmantes,posiciones})};
    var nombreDoc=f=>f.titulo,bloquearFondo=()=>{},fecha=()=>'',puedeAdministrarEnvio=()=>false,correoNormalizado=c=>String(c||'').trim().toLowerCase();
    var escapar=v=>String(v||'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),construirBotonFirmar=()=>'',cablearAcciones=()=>{};
    var cargarLibs=async()=>{},pintarMiniaturasEn=()=>{},marcarMiniaturaVisibleEn=()=>{},retomarBorrador=()=>{};
    async function llamarFuncion(args){pedidos.push(args);if(args.accion==='url_documento')return {...datos,url:'https://production-signing-files.s3.amazonaws.com/doc.pdf',estado:visibles[0].estado};return new Blob(['%PDF-1.7'],{type:'application/pdf'});}
    window.fetch=async()=>{throw new Error('El navegador no debe pedir el PDF externo');};
    async function dibujarEn(bytes,cont){dibujos++;if(!new TextDecoder().decode(bytes).startsWith('%PDF-'))throw Error('PDF invalido');cont.innerHTML='<div class="pagina-caja" style="width:600px;aspect-ratio:3/4;border:1px solid #ddd;background:white"><div class="pagina-capa"></div></div>';return [{capa:cont.querySelector('.pagina-capa')}];}
    ${abrir}`});
   await page.evaluate(()=>abrirDocumento(0));
   assert.equal(await page.locator('.firma-trazo img').count(),3);
   assert.equal(await page.locator('.firma-trazo img').first().isVisible(),true);
   assert.equal(await page.locator('.marca-firma.vista').count(),1);
   assert.equal(await page.locator('#doc-lado .doc-firmo').count(),3);
   assert.equal(await page.locator('#doc-bajar').isDisabled(),true);
   const primera=await page.locator('.firma-trazo').first().evaluate(el=>({left:parseFloat(el.style.left),top:parseFloat(el.style.top)}));
   assert.equal(primera.left,10);assert.equal(primera.top,66.25);
   assert.deepEqual(await page.evaluate(()=>pedidos.map(p=>p.accion)),['url_documento','archivo_documento']);
   mkdirSync(new URL('../artifacts/firmas-vista/',import.meta.url),{recursive:true});
   await page.screenshot({path:new URL('../artifacts/firmas-vista/parcial-'+width+'.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
   await page.evaluate(async()=>{visibles[0].estado='completado';datos.firmantes=datos.firmantes.map(f=>({...f,firmado:true}));await abrirDocumento(0);});
   assert.equal(await page.locator('.firma-trazo').count(),0,'las firmas ya incluidas en el PDF completado no se repiten');
   assert.equal(await page.locator('#doc-bajar').isDisabled(),false);
   assert.deepEqual(errores,[]);await page.close();
  }
 } finally {await browser.close();}
});
