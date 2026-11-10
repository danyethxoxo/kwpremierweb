import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
const core=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/interpretar-busqueda/core.ts',import.meta.url),'utf8').replace(/export /g,''));
const entry=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/interpretar-busqueda/index.ts',import.meta.url),'utf8').replace(/^import[^\r\n]*\r?\n/gm,''));
const ui=fs.readFileSync(new URL('../assets/js/kw-busqueda-ia.js',import.meta.url),'utf8');
function scope(extra={}){const s=vm.createContext({console,Response,Request,AbortSignal,TextEncoder,Set,Map,...extra});vm.runInContext(core,s);return s;}
const criteria={operacion:'venta',moneda:'MXN',tipos:['Departamento'],precio_max:4500000,recamaras_min:2,estados:['Ciudad de México'],municipios:[],colonias:['Narvarte'],requisitos:[],dudas:[]};
test('valida números y tipos, no acepta rangos contradictorios y omite instrucciones ajenas',()=>{
 const s=scope();assert.equal(s.validarCriterios({...criteria,sql:'delete from propiedades'}).sql,undefined);
 assert.throws(()=>s.validarCriterios({...criteria,precio_min:5000000}),/mínimo/);
 assert.throws(()=>s.validarCriterios({...criteria,precio_max:'4500000'}),/cantidad/);
 assert.throws(()=>s.validarCriterios({...criteria,tipos:['Palacio inventado']}),/tipo/);
 assert.throws(()=>s.prepararTexto('hola'),/Describe/);
 const text=s.prepararTexto('Busco depa hasta 4.5 millones. Contacto ana@ejemplo.com y 55 1234 5678');assert.ok(!text.includes('ana@'));assert.ok(!text.includes('1234'));assert.ok(text.includes('4.5 millones'));
});
test('resuelve colonias reales, expande Narvarte y rechaza ubicaciones ambiguas sin inventar',()=>{
 const s=scope({window:{},document:{readyState:'loading',addEventListener(){}}});vm.runInContext(ui,s);
 const rows=[{estado:'Ciudad de México',municipio:'Benito Juárez',colonia:'Narvarte Poniente'},{estado:'Ciudad de México',municipio:'Benito Juárez',colonia:'Narvarte Oriente'}];
 const c=s.window.kwBusquedaIA.resolver(criteria,rows,true);assert.deepEqual(Array.from(c.colonias),['Narvarte Poniente','Narvarte Oriente']);assert.deepEqual(Array.from(c.municipios),['Benito Juárez']);assert.equal(criteria.municipios.length,0);
 const ambiguous=[...rows,{estado:'Jalisco',municipio:'Guadalajara',colonia:'Narvarte'}];assert.throws(()=>s.window.kwBusquedaIA.resolver({...criteria,estados:[]},ambiguous,true),/Indica/);
 assert.throws(()=>s.window.kwBusquedaIA.resolver({...criteria,colonias:['No existe']},rows,true),/No encontré/);
});
test('envía solo el texto depurado, limita uso y conserva una salida ante cuota agotada',async()=>{
 let handler,options,fetches=0,payload,limits=[];
 const s=scope({Deno:{env:{get:k=>({GEMINI_API_KEY:'secreto-prueba',WEBHOOK_SECRET:'interno'})[k]}},secureServe:(o,h)=>{options=o;handler=h;},consumeLimit:async(...args)=>limits.push(args),fetch:async(u,o)=>{fetches++;payload=JSON.parse(o.body);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(criteria)}]}}]});}});vm.runInContext(entry,s);
 const req=text=>new Request('https://kw.local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto:text})});
 const r=await handler(req('Departamento en Narvarte hasta 4.5 millones de pesos, llamar a ana@ejemplo.com'),{userId:'usuario'});const result=await r.json();assert.equal(r.status,200);assert.equal(result.criterios.precio_max,4500000);assert.equal(result.criterios.operacion,undefined,'no deduce venta sin que se solicite');assert.ok(!JSON.stringify(payload).includes('ana@'));assert.equal(limits[0][2],30);assert.equal(options.auth(new Request('https://kw.local')),'user');assert.equal(options.userLimit,5);
 s.fetch=async()=>new Response('',{status:429});assert.equal((await handler(req('Busco casa en venta hasta 4 millones de pesos'),{userId:'usuario'})).status,429);
 const invalid=await handler(req('hola'),{userId:'usuario'});assert.equal(invalid.status,400);assert.equal(fetches,1);
 assert.equal((await handler(new Request('https://kw.local',{method:'POST',body:JSON.stringify({comprobar:true})}),{userId:'usuario'})).status,403);
});
