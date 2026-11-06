import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
test('webhook interno restringe sincronizaciones y rechaza accesos arbitrarios',async()=>{
 let handler,options,sync=0,altas=0;const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/hyper-processor/index.ts',import.meta.url),'utf8').replace(/^import[^\r\n]*\r?\n/gm,''));
 const scope=vm.createContext({Request,Response,Headers,URL,console,TextEncoder,Uint8Array,Map,Set,Deno:{env:{get:n=>n==='WEBHOOK_SECRET'?'private-test-secret':'test-config'}},createClient:()=>({from:()=>({select(){return this},in(){return this},order:async()=>({data:[]})})}),secureServe:(o,h)=>{options=o;handler=h;},sincronizarLibroAsesores:async()=>{sync++;return{ok:true,cambio:false};},procesarAltasGoogle:async()=>{altas++;return{ok:true,procesados:0};}});vm.runInContext(source,scope);
 const req=(secret,accion)=>new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',...(secret?{'x-webhook-secret':secret}:{})},body:JSON.stringify({accion})});
 for(const accion of ['listar','acceso','acceso_nuevo_asesor','verificar'])assert.equal((await handler(req('private-test-secret',accion))).status,401);
 assert.equal((await handler(req('wrong','sincronizar_asesores'))).status,401);assert.equal(sync,0);
 assert.equal((await handler(req('private-test-secret','sincronizar_asesores'))).status,200);assert.equal(sync,1);
 assert.equal((await handler(req('wrong','procesar_altas_google'))).status,401);assert.equal(altas,0);
 assert.equal((await handler(req('wrong','cumpleanos_contactos'))).status,401);
 assert.equal((await handler(req('wrong','actualizar_backoffice_contactos'))).status,401);
 const fichas=await handler(req('private-test-secret','actualizar_backoffice_contactos'));assert.equal(fichas.status,200);assert.equal((await fichas.json()).actualizados,0);
 assert.equal((await handler(req('private-test-secret','procesar_altas_google'))).status,200);assert.equal(altas,1);
 assert.equal(options.auth(req(null,'listar')),'user');assert.equal(options.auth(req('wrong','listar')),'service');assert.equal((await handler(req(null,'listar'))).status,401);
});
