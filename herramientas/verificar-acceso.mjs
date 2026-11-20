import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/js/auth-guard.js',import.meta.url),'utf8');
const api=source.match(/SUPABASE_URL = '([^']+)'/)[1];
const key=source.match(/SUPABASE_KEY = '([^']+)'/)[1];
const checks=[];
async function check(name,run){
 try{await run();checks.push({name,ok:true});}catch(error){checks.push({name,ok:false,error:error.message});}
}
for(const origin of ['https://kweb.com.mx','https://www.kweb.com.mx','https://kwpremieroficial.com','https://www.kwpremieroficial.com','https://untrusted.invalid']){
 for(const endpoint of ['mfa-correo','data-gateway/profiles'])await check(endpoint+' CORS '+origin,async()=>{
  const r=await fetch(api+'/functions/v1/'+endpoint,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':endpoint==='mfa-correo'?'POST':'GET','Access-Control-Request-Headers':'authorization,content-type'},signal:AbortSignal.timeout(10000)});
  const expected=origin==='https://untrusted.invalid'?403:204;
  if(r.status!==expected||(expected===204&&r.headers.get('access-control-allow-origin')!==origin))throw Error('Respuesta CORS inesperada: '+r.status);
  await r.arrayBuffer();
 });
}
await check('Auth health',async()=>{
 const r=await fetch(api+'/auth/v1/health',{headers:{apikey:key},signal:AbortSignal.timeout(10000)});
 if(r.status!==200)throw Error('Auth responde '+r.status);await r.arrayBuffer();
});
await check('KWEB portal',async()=>{
 const r=await fetch('https://kweb.com.mx/portal.html',{signal:AbortSignal.timeout(10000)});
 if(r.status!==200||!(await r.text()).includes('auth-guard.js'))throw Error('No se entrega el portal protegido');
});
await check('JWT alterado rechazado',async()=>{
 const r=await fetch(api+'/auth/v1/.well-known/jwks.json',{signal:AbortSignal.timeout(10000)});
 const keys=await r.json();const pub=keys.keys.find(k=>k.alg==='ES256');if(!pub)throw Error('No se encuentra la llave ES256');
 const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 const token=b({alg:'ES256',kid:pub.kid})+'.'+b({sub:'00000000-0000-4000-8000-000000000001',session_id:'00000000-0000-4000-8000-000000000002',role:'authenticated',iss:api+'/auth/v1',exp:Math.floor(Date.now()/1000)+60})+'.'+Buffer.alloc(64).toString('base64url');
 const denied=await fetch(api+'/functions/v1/data-gateway/profiles?select=id',{headers:{Origin:'https://kweb.com.mx',Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
 if(denied.status!==401)throw Error('Un JWT alterado responde '+denied.status);await denied.arrayBuffer();
});
for(const result of checks)console.log(JSON.stringify(result));
if(checks.some(c=>!c.ok))process.exitCode=1;
