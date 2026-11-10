import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';import {gridPremier,gridCentro} from './dashboard-fixture.mjs';
const core=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/dashboard-tracker/core.ts',import.meta.url),'utf8').replace(/export /g,''));
const entry=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/dashboard-tracker/index.ts',import.meta.url),'utf8').replace(/^import[^\r\n]*\r?\n/gm,''),{mode:'transform'});
test('distingue ceros, vacíos y errores; extrae LORE y compara layouts sin sumar fuentes',()=>{
 const s=vm.createContext({});vm.runInContext(core,s);
 assert.equal(s.numero('0'),0);assert.equal(s.numero(''),null);assert.equal(s.numero('#DIV/0!'),null);assert.equal(s.numero('$1,234.50'),1234.5);assert.equal(s.numero('-2'),-2);
 const l=s.leerLore(gridPremier());assert.equal(l.indicadores[0].venta,12);assert.equal(l.indicadores[0].renta,18);assert.equal(l.indicadores[2].venta,0);assert.equal(l.indicadores[2].volumen.renta,null);assert.equal(l.centro.asociados,80);assert.equal(l.centro.citas,10);assert.equal(l.centro.netos,-2);assert.equal(l.diarios[10].asistencia,null);
 const c=s.leerCentro(gridCentro(2),'Centro prueba');assert.equal(c.citas,12);assert.equal(c.asociados,49);assert.equal(c.netos,0);
 assert.throws(()=>s.leerLore([]),/estructura/);assert.throws(()=>s.leerCentro([],'Centro'),/estructura/);
});
test('endpoint protege liderazgo, reutiliza lectura y no expone tokens ni modifica Sheets',async()=>{
 let handler,options,rol='asociado',calls=[];
 const s=vm.createContext({console,URL,URLSearchParams,Response,Request,AbortSignal,Date,
 Deno:{env:{get:k=>({SUPABASE_URL:'https://prueba.local',SERVICE_ROLE_KEY:'secreto-servidor',GOOGLE_CLIENT_ID:'cliente-prueba',GOOGLE_CLIENT_SECRET:'clave-prueba',GOOGLE_REFRESH_TOKEN:'refresh-prueba',WEBHOOK_SECRET:'interno-prueba'})[k]}},
 createClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:rol},error:null})})})})}),secureServe:(o,h)=>{options=o;handler=h;},
 fetch:async(url,args)=>{calls.push({url:String(url),args});if(String(url).includes('oauth2'))return Response.json({access_token:'token-prueba'});if(String(url).includes('fields=properties'))return Response.json({properties:{title:'Tracker prueba'}});return Response.json({valueRanges:String(url).includes('15LwnQ')?[{values:gridPremier()}]:[{values:gridPremier()},...Array.from({length:5},(_,i)=>({values:gridCentro(i)}))]});}});
 vm.runInContext(core,s);vm.runInContext(entry,s);
 const req=()=>new Request('https://prueba.local',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(options.auth(req()),'user');assert.equal((await handler(req(),{userId:'prueba'})).status,403);assert.equal(calls.length,0);
 rol='staff';const r=await handler(req(),{userId:'prueba'});assert.equal(r.status,200);const data=await r.json();assert.equal(data.ok,true);assert.equal(data.centros.length,6);assert.equal(data.lore.centro.asociados,80);assert.equal(data.advertencias.length,1);assert.ok(!JSON.stringify(data).includes('token-prueba'));assert.ok(!JSON.stringify(data).includes('refresh-prueba'));
 const count=calls.length;await handler(req(),{userId:'prueba'});assert.equal(calls.length,count);rol='asociado';assert.equal((await handler(req(),{userId:'prueba'})).status,403,'la caché también exige rol');
 assert.ok(calls.filter(c=>c.url.includes('sheets.googleapis')).every(c=>!c.args.method||c.args.method==='GET'));
});
