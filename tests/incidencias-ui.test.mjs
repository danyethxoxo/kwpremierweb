import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const root=resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const asesor='11111111-1111-4111-8111-111111111111';
const caseId='22222222-2222-4222-8222-222222222222';
const captura=mkdtempSync(join(tmpdir(),'kw-incidencias-qa-'));

function mock({role,seed}) {
  const uid='11111111-1111-4111-8111-111111111111';
  window.__incMock={role,seed,rows:seed?[{id:'22222222-2222-4222-8222-222222222222',user_id:uid,titulo:'El botón de guardar no responde',descripcion:'Al completar los datos y pulsar Guardar, no ocurre nada. Lo probé desde mi teléfono.',tipo:'problema',pagina:'/propiedades.html',imagenes:[],estatus:'abierto',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),reportante_nombre:'Andrea',reportante_apellido:'García'}]:[],messages:[],inserts:0,uploads:0,failList:false,failAfterCommit:false};
  const s=window.__incMock;
  function from(table){
    const q={filters:[],action:'select',one:false,payload:null,start:0,end:49};
    const builder={select(){return this;},eq(k,v){q.filters.push([k,v]);return this;},order(){return this;},range(a,b){q.start=a;q.end=b;return this;},limit(){return this;},single(){q.one=true;return this;},maybeSingle(){q.one=true;return this;},insert(p){q.action='insert';q.payload=p;return this;},update(p){q.action='update';q.payload=p;return this;},in(){return this;},then(ok,bad){return (async()=>{
      if(table==='profiles') return {data:{id:uid,role:s.role,nombre:'Andrea',apellido:'García',email:'demo@example.com',foto_url:'/assets/img/logo-kw-premier.png',whatsapp:'+525555555555',sitio_web:'demo.kw.com'},error:null};
      if(table==='notificaciones')return {data:[],error:null};
      const collection=table==='incidencias_mensajes'?s.messages:s.rows;
      if(q.action==='insert'){
        await new Promise(r=>setTimeout(r,80));
        if(table==='incidencias')s.inserts++;
        if(collection.some(i=>i.id===q.payload.id))return {data:null,error:{code:'23505'}};
        collection.unshift({...q.payload,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),estatus:'abierto'});
        if(s.failAfterCommit){s.failAfterCommit=false;throw new TypeError('Connection lost after commit');}
        return {data:null,error:null};
      }
      if(s.failList && table!=='incidencias_mensajes')return {data:null,error:{message:'Network failure'}};
      let data=collection.filter(i=>q.filters.every(([k,v])=>i[k]===v)).slice(q.start,q.end+1);
      return {data:q.one?data[0]||null:data,error:null};
    })().then(ok,bad);}};return builder;
  }
  window.kwSupabase={supabaseUrl:'https://project.supabase.co',from,
    auth:{getUser:async()=>({data:{user:{id:uid,email:'demo@example.com'}}}),getSession:async()=>({data:{session:{user:{id:uid},access_token:'test'}}}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},
    storage:{from(){return {upload:async()=>{s.uploads++;await new Promise(r=>setTimeout(r,80));return {error:null};},createSignedUrls:async()=>({data:[],error:null})};}},
    rpc:async(name,p)=>{const row=s.rows.find(r=>r.id===p.p_id);row.estatus=p.p_estatus;row.updated_at=new Date().toISOString();if(p.p_mensaje && !s.messages.some(m=>m.id===p.p_mensaje_id))s.messages.push({id:p.p_mensaje_id,user_id:uid,incidencia_id:p.p_id,mensaje:p.p_mensaje,created_at:new Date().toISOString()});return {error:null};},
    channel(){return {on(){return this;},subscribe(){return this;}};},removeChannel(){},
  };
}

test('incidencias browser: desktop/mobile, draft, retry, double submit, screenshots and follow-up',async()=>{
  const server=createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/assets/js/auth-guard.js'){res.setHeader('Content-Type','text/javascript');res.end("document.documentElement.classList.add('kw-auth-ok');");return;}
    if(path==='/assets/js/kw-security.js'||path==='/assets/js/kw-session.js'){res.setHeader('Content-Type','text/javascript');res.end('');return;}
    const file=resolve(root,'.'+path);if(!file.startsWith(root)){res.writeHead(403).end();return;}
    try {const data=readFileSync(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/hub/tickets.html';
  const browser=await chromium.launch({...(process.platform==='win32'?{channel:'chrome'}:{}),headless:true});
  try {
    for(const config of [{name:'desktop',width:1440,height:960,role:'admin',seed:true},{name:'mobile',width:390,height:844,role:'asociado',seed:false}]){
      const context=await browser.newContext({viewport:{width:config.width,height:config.height},reducedMotion:'reduce'});
      await context.addInitScript(mock,{role:config.role,seed:config.seed});
      await context.route('https://**',route=>route.fulfill({status:200,body:'',contentType:'text/javascript'}));
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url);await page.waitForFunction(()=>!document.getElementById('btn-nuevo').disabled);
      await page.waitForFunction(()=>!document.querySelector('#inc-filas .inc-carga'));
      assert.equal(await page.locator('#notif-bell-slot').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(config.name==='mobile') {
        assert.equal(await page.locator('#inc-filtros summary').isVisible(),true);
        assert.equal(await page.locator('#inc-filtros').evaluate(el=>el.open),false);
        await page.locator('#inc-filtros summary').click();
        assert.equal(await page.locator('#inc-estado').isVisible(),true);
        await page.locator('#inc-filtros summary').click();
      }
      await page.screenshot({path:join(captura,config.name+'-lista.png'),fullPage:true});
      await page.getByRole('button',{name:'Reportar',exact:true}).click();
      await page.locator('#rep-titulo').fill('Sugerencia: guardar un borrador de la captación');
      await page.locator('#rep-descripcion').fill('Me gustaría retomar los datos de una propiedad sin volver a capturarlos. Sería útil cuando estoy visitando un inmueble.');
      await page.locator('#rep-tipo').selectOption('mejora',{force:true});
      await page.getByRole('button',{name:'Volver al listado'}).click();
      await page.getByRole('button',{name:'Reportar',exact:true}).click();
      assert.match(await page.locator('#rep-titulo').inputValue(),/Sugerencia/);
      await page.reload();
      await page.waitForFunction(()=>!document.getElementById('btn-nuevo').disabled);
      await page.getByRole('button',{name:'Reportar',exact:true}).click();
      assert.match(await page.locator('#rep-titulo').inputValue(),/Sugerencia/);
      assert.equal(await page.locator('#rep-tipo').inputValue(),'mejora');
      if(config.name==='mobile')assert.ok((await page.locator('#inc-titulo-pagina').boundingBox()).y>=60);
      await page.screenshot({path:join(captura,config.name+'-formulario.png'),fullPage:true});
      await page.locator('#rep-imagenes').setInputFiles({name:'captura.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')});
      assert.match(await page.locator('#rep-archivos-error').textContent(),/JPG/);
      const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64');
      await page.locator('#rep-imagenes').setInputFiles({name:'captura.png',mimeType:'image/png',buffer:image});
      await page.evaluate(()=>{window.__incMock.failAfterCommit=true;document.getElementById('btn-nuevo').click();document.getElementById('btn-nuevo').click();});
      await page.waitForFunction(()=>document.getElementById('rep-error').hidden===false);
      await page.getByRole('button',{name:'Enviar reporte',exact:true}).click();
      await page.waitForFunction(()=>document.getElementById('inc-formulario').hidden);
      assert.equal(await page.evaluate(()=>window.__incMock.inserts),1);
      assert.equal(await page.evaluate(()=>window.__incMock.uploads),1);
      const saved=await page.evaluate(()=>window.__incMock.rows.find(r=>r.titulo.startsWith('Sugerencia')));
      await page.locator('[data-reporte="'+saved.id+'"]').click();
      await page.waitForFunction(()=>document.getElementById('det-titulo').textContent.startsWith('Sugerencia'));
      await page.locator('#det-mensaje').fill('También ayudaría desde el celular.');
      if(config.role==='admin')await page.locator('#det-estatus').selectOption('en_revision',{force:true});
      await page.locator('#det-guardar').click();
      await page.waitForFunction(()=>document.getElementById('det-hilo').textContent.includes('También ayudaría'));
      if(config.role==='admin')assert.equal(await page.locator('#det-estatus').inputValue(),'en_revision');
      await page.screenshot({path:join(captura,config.name+'-seguimiento.png'),fullPage:true});
      await page.getByRole('button',{name:'Cerrar reporte',exact:true}).click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('QA screenshots: '+captura);
  } finally {await browser.close();await new Promise(r=>server.close(r));}
});
