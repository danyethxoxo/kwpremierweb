// Servicio temporal de preparacion y limpieza. Retirarlo despues de la prueba.
const api=Deno.env.get('SUPABASE_URL')!,role=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,gate=Deno.env.get('DATA_GATEWAY_SECRET')!
async function authorized(value:string){
 if(!gate||!value)return false
 const hash=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))
 const [a,b]=await Promise.all([hash(value),hash(gate)]);let different=0;for(let i=0;i<a.length;i++)different|=a[i]^b[i];return different===0
}
async function admin(path:string,method:string,body?:unknown,token=role){return await fetch(api+'/auth/v1/'+path,{method,headers:{apikey:role,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)})}
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes))
Deno.serve(async req=>{
 if(req.method!=='POST'||!await authorized(req.headers.get('x-kw-load-key')||''))return Response.json({error:'No autorizado'},{status:403})
 const body=await req.json().catch(()=>({}))
 if(body.accion==='limpiar'){
  if(!/^[a-f0-9-]{36}$/.test(body.id||''))return Response.json({error:'Identificador invalido'},{status:400})
  const lookup=await admin('admin/users/'+body.id,'GET');if(!lookup.ok)return Response.json({error:'No se encontro la cuenta de prueba'},{status:404})
  const user=await lookup.json()
  if(user.app_metadata?.kweb_load_test!==true||!/^carga-.*@pruebas\.kweb\.invalid$/.test(user.email||''))return Response.json({error:'No es una cuenta de prueba'},{status:403})
  const deleted=await admin('admin/users/'+body.id,'DELETE',{should_soft_delete:false});await deleted.arrayBuffer()
  return Response.json({eliminada:deleted.ok})
 }
 if(body.accion!=='preparar'||body.publicKey?.kty!=='RSA')return Response.json({error:'Solicitud invalida'},{status:400})
 let id='',ready=false
 try{
  const email='carga-'+crypto.randomUUID()+'@pruebas.kweb.invalid',password=b64(crypto.getRandomValues(new Uint8Array(32)))
  const created=await admin('admin/users','POST',{email,password,email_confirm:true,app_metadata:{confort4_editor_only:true,kweb_load_test:true},user_metadata:{nombre:'Prueba temporal de carga'}})
  if(!created.ok)throw Error('No se pudo preparar la cuenta')
  const user=await created.json();id=user.id
  const signed=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(10000)})
  if(!signed.ok)throw Error('No se pudo iniciar la sesion temporal')
  const session=await signed.json()
  const publicKey=await crypto.subtle.importKey('jwk',body.publicKey,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt'])
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12))
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify({api,token:session.access_token,apikey:anon})))
  const encryptedKey=await crypto.subtle.encrypt({name:'RSA-OAEP'},publicKey,await crypto.subtle.exportKey('raw',key))
  ready=true
  return Response.json({id,encryptedKey:b64(new Uint8Array(encryptedKey)),iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))},{headers:{'Cache-Control':'no-store'}})
 }catch{return Response.json({error:'No se pudo preparar la prueba'},{status:500})}
 finally{if(id&&!ready){try{const r=await admin('admin/users/'+id,'DELETE',{should_soft_delete:false});await r.arrayBuffer()}catch{}}}
})
