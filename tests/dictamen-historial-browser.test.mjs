import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=fs.readFileSync(path.join(root,'hub/dictamenes.html'),'utf8');
function fn(name){const a=source.search(new RegExp('^  (?:async )?function '+name+'\\(','m'));return source.slice(a,source.indexOf('\n  }',a)+4);}
test('timeline cronologico con inicio, estatus, observaciones, envio y revision, sin desbordes',async()=>{
 const browser=await chromium.launch({channel:'chrome'});try{
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:900}});
   const css=['assets/css/kw-base.css','assets/css/kw-claro.css'].map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n')+[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+fs.readFileSync(path.join(root,'assets/css/kw-dictamen-historial.css'),'utf8');
   await page.setContent('<html class="kw-auth-ok"><style>'+css+'</style><main style="max-width:850px;padding:20px;margin:auto"><div id="timeline"></div></main></html>');
   const como=source.slice(source.indexOf('  var COMO ='),source.indexOf('  function historialHTML'));
   await page.addScriptTag({content:como+fn('historialHTML')+fn('fechaHora')+`\nvar escapar=v=>String(v).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));var historial=[['revision','Rev 1 · Se guardó una nueva versión'],['correo_enviado','Se envió a asesor@example.com, dt@example.com'],['punto_nuevo','Se pidió: corregir el nombre <script>'],['estado','Autorizado condicionado'],['creado','Se levantó el expediente']].map((x,i)=>({dictamen_id:'doc',que:x[0],detalle:x[1],created_at:new Date(Date.UTC(2026,9,30,12,5-i)).toISOString(),quien_nombre:'Daniel Guerrero'}));document.getElementById('timeline').innerHTML=historialHTML({id:'doc'});`});
   const titulos=await page.locator('.dic-historia-txt b').allTextContents();assert.equal(titulos[0],'Se inició el dictamen');assert.equal(titulos[1],'Dictamen');assert.ok(titulos.includes('Envío por correo'));assert.equal(titulos.at(-1),'Edición');
   assert.equal(await page.locator('.dic-historia script').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.ok(await page.locator('.dic-historia-fila').first().evaluate(el=>getComputedStyle(el,'::after').content!== 'none'));
   fs.mkdirSync(path.join(root,'artifacts/dictamen-historial'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts/dictamen-historial/timeline-'+width+'.png'),fullPage:true});await page.close();
  }
 }finally{await browser.close();}
});
