import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
test('webhook interno rechaza secretos inválidos y nunca permite gestionar accesos con el secreto',async()=>{
 let handler,options,sync=0;const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/hyper-processor/index.ts',import.meta.url),'utf8').replace(/^import[^\r\n]*\r?\n/gm,''));
 const scope=vm.createContext({Request,Response,Headers,URL,console,TextEncoder,Uint8Array,Map,Set,Deno:{env:{get:n=>n==='WEBHOOK_SECRET'?'private-test-secret':'test-config'}},createClient:()=>({}),secureServe:(o,h)=>{options=o;handler=h;},sincronizarLibroAsesores:async()=>{sync++;return{ok:true,cambio:false};}});vm.runInContext(source,scope);
 const req=(secret,accion)=>new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',...(secret?{'x-webhook-secret':secret}:{})},body:JSON.stringify({accion})});
 for(const accion of ['listar','acceso','acceso_nuevo_asesor','verificar'])assert.equal((await handler(req('private-test-secret',accion))).status,401);
 assert.equal((await handler(req('wrong','sincronizar_asesores'))).status,401);assert.equal(sync,0);
 assert.equal((await handler(req('private-test-secret','sincronizar_asesores'))).status,200);assert.equal(sync,1);
 assert.equal(options.auth(req(null,'listar')),'user');assert.equal(options.auth(req('wrong','listar')),'service');assert.equal((await handler(req(null,'listar'))).status,401);
});
