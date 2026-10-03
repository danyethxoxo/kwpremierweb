import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
const record={notificacion_id:'11111111-1111-4111-8111-111111111111',user_id:'asesor',titulo:'Nuevas propiedades',mensaje:'Cliente: 2 coincidencias',url:'/hub/perfil-comprador.html'};
function preparar(falla=false){
 let handler,updates=[],keys=[],aceptados=new Set();
 const admin={from(tabla){return {select(){return this},eq(){return this},async single(){return{data:tabla==='notificaciones'?{...record,tipo:'comprador_matches'}:{nombre:'Asesor',email:'test@example.com'}}},update(datos){updates.push(datos);return{eq:async()=>({error:null})}}}}};
 let source=readFileSync(new URL('../supabase/functions/notificar-email/index.ts',import.meta.url),'utf8').replace(/^\uFEFF/,'').replace(/^import[^\r\n]*\r?\n/gm,'');
 source=stripTypeScriptTypes(source,{mode:'strip'});
 const scope=vm.createContext({Response,console,Deno:{env:{get:()=> 'test'}},createClient:()=>admin,secureServe:(_,h)=>{handler=h},fetch:async(_,req)=>{
  keys.push(req.headers['Idempotency-Key']);if(falla)return new Response('{}',{status:503});
  aceptados.add(req.headers['Idempotency-Key']);return Response.json({id:'provider-test'});
 }});vm.runInContext(source,scope);
 return {handler,updates,keys,aceptados};
}
function solicitud(body=record){return new Request('https://example.com',{method:'POST',headers:{'Content-Type':'application/json','x-webhook-secret':'test'},body:JSON.stringify({record:body})});}
test('confirma correos de comprador y reutiliza la clave para evitar duplicados',async()=>{
 const m=preparar();assert.equal((await m.handler(solicitud())).status,200);assert.equal((await m.handler(solicitud())).status,200);
 assert.equal(m.aceptados.size,1);assert.equal(m.keys[0],m.keys[1]);assert.equal(m.updates[0].estado,'enviado');
});
test('fallo del proveedor no confirma entrega; aviso manipulado no envia',async()=>{
 const m=preparar(true);assert.equal((await m.handler(solicitud())).status,502);assert.equal(m.updates.length,0);
 const n=preparar();assert.equal((await n.handler(solicitud({...record,user_id:'otro'}))).status,400);assert.equal(n.keys.length,0);
});
