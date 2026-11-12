import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'
import { secureServe } from '../_shared/security.ts'

secureServe({name:'propiedades-feed-pruebas',auth:'user',maxBytes:4096,userLimit:90},async(req,ctx)=>{
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
  const {data:perfil,error:perfilError}=await admin.from('profiles').select('role').eq('id',ctx.userId!).maybeSingle()
  if(perfilError)return Response.json({error:'No se pudo verificar tu acceso.'},{status:503})
  if(!perfil||!['master','admin'].includes(perfil.role))return Response.json({error:'Este apartado es exclusivo de administración.'},{status:403})
  const body=await req.json().catch(()=>({}))
  if(!body||typeof body!=='object'||Array.isArray(body))return Response.json({error:'Consulta inválida.'},{status:400})
  const texto=typeof body.texto==='string'?body.texto.slice(0,160):''
  const estatus=typeof body.estatus==='string'?body.estatus:''
  if(!['','publicada','suspendida','vendida','rentada','reservada','no_publicada'].includes(estatus))return Response.json({error:'Estatus inválido.'},{status:400})
  const pagina=Math.max(1,Math.min(10000,Math.floor(Number(body.pagina)||1)))
  const {data,error}=await admin.rpc('propiedades_feed_consultar',{p_feed:'kw-oficial',p_texto:texto,p_estatus:estatus,p_pagina:pagina})
  if(error){console.error('No se pudo leer inventario de pruebas',error.code);return Response.json({error:'No se pudo cargar el inventario de pruebas.'},{status:503})}
  return Response.json({ok:true,...data,pagina,por_pagina:24})
})

