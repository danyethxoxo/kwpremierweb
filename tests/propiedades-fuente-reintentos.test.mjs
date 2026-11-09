import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
const src=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/sincronizar-propiedades/index.ts',import.meta.url),'utf8').replace(/^import[^\r\n]*\r?\n/gm,''));
function setup(responder){const calls=[];const s=vm.createContext({Deno:{env:{get:()=>undefined}},secureServe(){},URL,Response,AbortSignal,crypto,setTimeout:fn=>fn(),fetch:async(u,o)=>{calls.push({url:new URL(u),options:o});return responder(calls.length)}});vm.runInContext(src,s);return{s,calls}}
test('reintenta la página que falla sin cambiar offset, evita caché y conserva la respuesta',async()=>{const m=setup(n=>n<3?new Response('',{status:502}):Response.json({success:true,data:{Properties_Data:[{ID:1}]}}));assert.equal((await m.s.kwJson('https://www.kwmexico.mx/api/properties?init=90')).data.Properties_Data[0].ID,1);assert.equal(m.calls.length,3);assert.ok(m.calls.every(c=>c.url.searchParams.get('init')==='90'));assert.ok(m.calls[1].url.searchParams.has('comprobacion'));assert.equal(m.calls[0].options.cache,'no-store')});
test('errores persistentes abortan la lectura; 404 no se reintenta',async()=>{const m=setup(()=>new Response('',{status:503}));await assert.rejects(m.s.kwJson('https://www.kwmexico.mx/api/properties?init=120'),/503.*página 120/);assert.equal(m.calls.length,3);const missing=setup(()=>new Response('',{status:404}));await assert.rejects(missing.s.kwJson('https://www.kwmexico.mx/api/properties/1'),/404/);assert.equal(missing.calls.length,1)});
test('recupera una interrupción de red; rechaza HTTP y respuestas de negocio fallidas',async()=>{const m=setup(n=>{if(n===1)throw Error('network');return Response.json({success:true})});assert.equal((await m.s.kwJson('https://www.kwmexico.mx/api/properties')).success,true);const bad=setup(()=>Response.json({success:false,message:'No disponible'}));await assert.rejects(bad.s.kwJson('https://www.kwmexico.mx/api/properties'),/No disponible/);assert.equal(bad.calls.length,1);await assert.rejects(m.s.kwJson('http://example.com'),/HTTPS/);assert.equal(m.calls.length,2)});

test('cada lectura usa una URL nueva desde el primer intento aunque la fuente responda 200',async()=>{
 const m=setup(()=>Response.json({success:true,data:{Properties_Data:[{ID:842678}]}}));
 await m.s.kwJson('https://www.kwmexico.mx/api/properties?init=7350');
 await m.s.kwJson('https://www.kwmexico.mx/api/properties?init=7350');
 assert.equal(m.calls.length,2);
 assert.ok(m.calls.every(c=>c.url.searchParams.get('comprobacion') && c.url.searchParams.get('init')==='7350'));
 assert.notEqual(m.calls[0].url.href,m.calls[1].url.href);
});
