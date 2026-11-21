import {strict as assert} from 'node:assert'
import {secureHandler} from '../supabase/functions/_shared/security.ts'

Deno.test('200 consultas concurrentes verifican firmas ES256 sin pedir el usuario a Auth y conservan revocacion y MFA',async()=>{
 const originalFetch=globalThis.fetch
 const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','DATA_GATEWAY_SECRET','ALLOWED_ORIGINS']
 const before=names.map(name=>Deno.env.get(name))
 const base='https://concurrencia-fixture.supabase.co'
 const values=[base,'fixture-service','','fixture-anon','fixture-gateway','https://www.kwpremieroficial.com']
 names.forEach((name,i)=>Deno.env.set(name,values[i]))
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
 const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:crypto.randomUUID(),alg:'ES256',use:'sig'}
 const encode=(value:Uint8Array|string)=>btoa(typeof value==='string'?value:String.fromCharCode(...value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
 const sign=async(claims:Record<string,unknown>)=>{
  const body=encode(JSON.stringify({alg:'ES256',typ:'JWT',kid:jwk.kid}))+'.'+encode(JSON.stringify(claims))
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(body))
  return body+'.'+encode(new Uint8Array(signature))
 }
 const active=new Map<string,string>();let sessionError=false,mfa=true,rate=true,authCalls=0,jwksCalls=0,sessionCalls=0,ipCalls=0
 const handler=secureHandler({name:'data-gateway'},(_req,context)=>Response.json({id:context.userId}))
 const request=(token:string)=>new Request(base+'/functions/v1/data-gateway/rpc/propiedades_inventario_pagina',{
  method:'POST',headers:{Origin:'https://kweb.com.mx',Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',
 })
 globalThis.fetch=async(input,init)=>{
  const url=String(input)
  if(url.includes('/.well-known/jwks.json')){jwksCalls++;return Response.json({keys:[jwk]})}
  if(url.includes('/auth/v1/user')){authCalls++;throw Error('No debe consultar Auth por cada busqueda')}
  if(url.includes('/rpc/security_consume_rates')){ipCalls++;return Response.json({allowed:true,retry_after:1})}
  if(url.includes('/rpc/security_gateway_autorizar')){
   sessionCalls++;const body=JSON.parse(String(init?.body))
   assert.equal(body.p_ip,'unknown')
   assert.equal(body.p_mfa,true)
   assert.equal(body.p_limite,60)
   const estado=active.get(body.p_sesion)!==body.p_usuario?'revocada':!rate?'limite':!mfa?'mfa':'ok'
   return Response.json(sessionError?{message:'temporary'}:{estado,retry_after:19},{status:sessionError?503:200})
  }
  if(url.includes('/rpc/security_sesion_vigente')){
   sessionCalls++;const body=JSON.parse(String(init?.body))
   return Response.json(sessionError?{message:'temporary'}:active.get(body.p_sesion)===body.p_usuario,{status:sessionError?503:200})
  }
  if(url.includes('/rpc/security_identidad_sesion')){
   const body=JSON.parse(String(init?.body))
   return Response.json(active.get(body.p_sesion)===body.p_usuario?{id:body.p_usuario,email:'fixture@example.invalid',aud:'authenticated',created_at:new Date().toISOString(),app_metadata:{},user_metadata:{}}:null)
  }
  if(url.includes('/rpc/mfa_sesion_autorizada'))return Response.json(mfa)
  throw Error('Peticion inesperada: '+url)
 }
 try{
  const now=Math.floor(Date.now()/1000)
  const claims=Array.from({length:200},()=>({sub:crypto.randomUUID(),session_id:crypto.randomUUID(),role:'authenticated',aud:'authenticated',iss:base+'/auth/v1',iat:now,exp:now+600}))
  claims.forEach(c=>active.set(c.session_id,c.sub))
  const tokens=await Promise.all(claims.map(c=>sign(c)))
  assert.equal((await handler(request(tokens[0]))).status,200)
  const start=performance.now()
  const results=await Promise.all(tokens.map(async(token,i)=>{
   const response=await handler(request(token));assert.equal(response.status,200)
   assert.equal((await response.json()).id,claims[i].sub)
  }))
  assert.equal(results.length,200);assert.equal(authCalls,0);assert.equal(sessionCalls,201);assert.equal(ipCalls,201)
  assert(jwksCalls<5,'Reutiliza la llave publica verificada')
  console.log(`200 peticiones concurrentes con servicios simulados: ${Math.round(performance.now()-start)} ms; no es una medicion de produccion`)
  const mfaHandler=secureHandler({name:'mfa-correo',mfa:false,userLimit:30,ipLimit:1200},(_req,context)=>Response.json({id:context.user?.id,email:context.user?.email}))
  const mfaStart=performance.now()
  await Promise.all(tokens.map(async(token,i)=>{
   const response=await mfaHandler(request(token));assert.equal(response.status,200)
   assert.equal((await response.json()).id,claims[i].sub)
  }))
  assert.equal(authCalls,0)
  console.log(`200 validaciones de sesion concurrentes con servicios simulados: ${Math.round(performance.now()-mfaStart)} ms; no mide contrasenas ni capacidad real`)
  active.delete(claims[0].session_id)
  assert.equal((await handler(request(tokens[0]))).status,401,'Una sesion revocada se rechaza aun con firma valida')
  mfa=false;assert.equal((await handler(request(tokens[1]))).status,403);mfa=true
  rate=false;const denied=await handler(request(tokens[1]));assert.equal(denied.status,429);assert.equal(denied.headers.get('Retry-After'),'19');rate=true
  sessionError=true;assert.equal((await handler(request(tokens[1]))).status,503);sessionError=false
  assert.equal((await handler(request(await sign({...claims[1],exp:now-10})))).status,401)
  assert.equal((await handler(request(await sign({...claims[1],role:'service_role'})))).status,401)
  assert.equal((await handler(request(await sign({...claims[1],iss:'https://other.example/auth/v1'})))).status,401)
  const parts=tokens[1].split('.');parts[1]=encode(JSON.stringify({...claims[1],sub:claims[2].sub}))
  assert.equal((await handler(request(parts.join('.')))).status,401,'Cambiar el usuario sin firmar no autoriza')
 }finally{
  globalThis.fetch=originalFetch
  names.forEach((name,i)=>before[i]===undefined?Deno.env.delete(name):Deno.env.set(name,before[i]!))
 }
})
