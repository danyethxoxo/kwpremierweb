import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const src=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/prospectos-gmail/gmail.ts',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replace(/\bexport /g,''));
const context=vm.createContext({HttpError,validUuid:s=>/^[a-f0-9-]{36}$/.test(s),crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,URL,URLSearchParams,Response,Request,AbortSignal,atob,btoa,fetch});vm.runInContext(src,context);
const uid='00000000-0000-4000-8000-000000000001',sid='00000000-0000-4000-8000-000000000002';
const token='header.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.signature';
const actor={userId:uid,token},root='test-encryption-root-for-prospectos-only',redirect='https://example.supabase.co/functions/v1/prospectos-gmail';
const request=(accion,data={})=>new Request(redirect,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion,...data})});
async function fixture(){
 const box=await context.secretBox(root),calls=[],net=[];let pending=null,connection=null;
 const client='123456-test.apps.googleusercontent.com';let config={client_id:client,secreto:await box.seal('test-client-secret',uid,'config')};
 const backend=async(action,user,session,data)=>{
  assert.equal(user,uid);assert.equal(session,sid);calls.push({action,data});
  if(action==='estado')return {config,conexion:connection};
  if(action==='crear_estado'){pending=data;return {ok:true};}
  if(action==='consumir_estado'){if(!pending||data.hash!==pending.hash)return null;const p=pending;pending=null;return p.verificador;}
  if(action==='conectar'){connection={correo:data.correo,credenciales:data.credenciales,scopes:data.scopes};return {ok:true};}
  if(action==='desconectar'){const p=connection;connection=null;return p;}
  if(action==='configurar'){config={client_id:data.client_id,secreto:data.secreto};return {ok:true};}
 };
 const handler=context.createGmailHandler({backend,encryptionRoot:root,redirectUri:redirect,fetcher:async(url,init)=>{
  net.push({url,init});
  if(url.endsWith('/token'))return Response.json({access_token:'test-access',refresh_token:'test-refresh-token',scope:context.GMAIL_SCOPE||'https://www.googleapis.com/auth/gmail.readonly'});
  if(url.endsWith('/profile'))return Response.json({emailAddress:'asesor@example.com',messagesTotal:100});
  if(url.endsWith('/revoke'))return new Response('');
  throw Error('No debe leer mensajes ni acceder a otro servicio');
 }});
 return {handler,box,calls,net,get config(){return config;},get connection(){return connection;},clearConfig(){config=null;}};
}
test('cifra credenciales con identidad y finalidad; el estado publico nunca contiene secretos',async()=>{
 const f=await fixture(),box=await f.box.seal({refresh_token:'test-refresh-token'},uid,'tokens');
 assert.ok(!JSON.stringify(box).includes('test-refresh-token'));
 assert.equal((await f.box.open(box,uid,'tokens')).refresh_token,'test-refresh-token');
 await assert.rejects(()=>f.box.open(box,sid,'tokens'));await assert.rejects(()=>f.box.open(box,uid,'config'));
 const out=await (await f.handler(request('estado'),actor)).text();assert.ok(!out.includes('test-client-secret'));assert.ok(!out.includes('secreto'));assert.ok(!out.includes('credenciales'));
});
test('OAuth usa solo lectura, PKCE y estado de un uso; devuelve una cuenta real sin leer correos',async()=>{
 const f=await fixture(),start=await (await f.handler(request('iniciar'),actor)).json(),url=new URL(start.url);
 assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/gmail.readonly');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('redirect_uri'),redirect);
 const state=url.searchParams.get('state');assert.match(state,/^[a-f0-9]{64}$/);
 assert.equal(f.calls.find(x=>x.action==='crear_estado').data.hash,await context.fingerprint(state));
 const linked=await(await f.handler(request('vincular',{state,code:'test-code'}),actor)).json();assert.equal(linked.correo,'asesor@example.com');
 assert.ok(!JSON.stringify(f.connection).includes('test-refresh-token'));assert.equal(f.net.length,2);
 await assert.rejects(()=>f.handler(request('vincular',{state,code:'test-code'}),actor),e=>e.status===400);
 assert.equal(f.net.length,2,'un codigo repetido no llega a Google');
 await f.handler(request('desconectar'),actor);assert.equal(f.connection,null);assert.ok(f.net.at(-1).url.endsWith('/revoke'));
});
test('el callback solo redirige al modulo y no ejecuta el intercambio ni confunde el login',async()=>{
 const f=await fixture(),state='a'.repeat(64),r=await f.handler(new Request(redirect+'?code=example%26code&state='+state),{}),url=new URL(r.headers.get('Location'));
 assert.equal(r.status,303);assert.equal(url.origin,'https://kweb.com.mx');assert.equal(url.search,'');assert.equal(new URLSearchParams(url.hash.slice(1)).get('gmail_code'),'example&code');assert.equal(f.net.length,0);assert.equal(f.calls.length,0);
 const err=await f.handler(new Request(redirect+'?error=access_denied&error_description=%3Cscript%3E'),{});assert.ok(err.headers.get('Location').endsWith('#gmail_error=cancelado'));
});
test('rechaza contexto sin sesion, estado desconocido y operacion sin cliente configurado',async()=>{
 const f=await fixture();await assert.rejects(()=>f.handler(request('estado'),{}),e=>e.status===401);
 await assert.rejects(()=>f.handler(request('vincular',{state:'b'.repeat(64),code:'test-code'}),actor),e=>e.status===400);assert.equal(f.net.length,0);
 f.clearConfig();assert.equal((await(await f.handler(request('estado'),actor)).json()).configurada,false);await assert.rejects(()=>f.handler(request('iniciar'),actor),e=>e.status===409);
});
test('el backend decide el acceso antes de generar OAuth o leer configuracion',async()=>{
 let called=false;const h=context.createGmailHandler({backend:async()=>{throw new HttpError(403,'Sin acceso');},encryptionRoot:root,redirectUri:redirect,fetcher:async()=>{called=true;throw Error();}});
 await assert.rejects(()=>h(request('iniciar'),actor),e=>e.status===403);assert.equal(called,false);
});
test('no reutiliza el cliente de las conexiones Google existentes',async()=>{
 const h=context.createGmailHandler({backend:async()=>({config:null,conexion:null}),encryptionRoot:root,redirectUri:redirect,reservedClientIds:['actual.apps.googleusercontent.com']});
 await assert.rejects(()=>h(request('configurar',{client_id:'actual.apps.googleusercontent.com',client_secret:'test-client-secret'}),actor),e=>e.status===400);
});
