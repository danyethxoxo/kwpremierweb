import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'
import { secureServe } from '../_shared/security.ts'
import '../../../assets/js/colonias-cdmx.js'
import '../../../assets/js/comprador-matches.js'

const motor = (globalThis as unknown as {kwCompradorMatches:{evaluar:(c:Record<string,unknown>,p:Record<string,unknown>)=>{porcentaje:number,criterios:unknown[]}|null}}).kwCompradorMatches
const secret = Deno.env.get('WEBHOOK_SECRET')
secureServe({name:'matches-comprador',auth:req=>req.headers.has('x-webhook-secret')?'service':'user',maxBytes:16384},async(req,context)=>{
 const service=req.headers.has('x-webhook-secret')
 if(service && (!secret || req.headers.get('x-webhook-secret')!==secret)) return Response.json({error:'No autorizado'},{status:401})
 const body=await req.json().catch(()=>({}))
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
 let query=admin.from('comprador_estados').select('perfil_id,revision,perfiles_comprador!inner(*)').eq('pendiente',true).limit(service?20:1)
 if(!service) {
  if(!/^[0-9a-f-]{36}$/i.test(body.perfil_id || '')) return Response.json({error:'Perfil inválido'},{status:400})
  query=query.eq('perfil_id',body.perfil_id).eq('asesor_id',context.userId!)
 }
 const {data:pendientes,error}=await query
 if(error) throw error
 let procesados=0
 const catalogos=new Map<string,Record<string,unknown>[]>()
 for(const estado of pendientes || []) {
  const cliente=estado.perfiles_comprador as unknown as Record<string,unknown>
  try {
   const clave=JSON.stringify([cliente.estado,cliente.operacion])
   if(cliente.activo && !catalogos.has(clave)) {
    const filas:Record<string,unknown>[]=[]
    if(cliente.activo) for(let offset=0;;offset+=1000) {
     const res=await admin.rpc('comprador_catalogo_calculo',{p_estado:cliente.estado,p_operacion:cliente.operacion,p_offset:offset})
     if(res.error) throw res.error
     filas.push(...res.data)
     if(res.data.length<1000) break
    }
    catalogos.set(clave,filas)
   }
   const resultados=cliente.activo ? catalogos.get(clave)!.flatMap(p=>{
    const m=motor.evaluar(cliente,p)
    return m && m.porcentaje>=Number(cliente.umbral_match) ? [{propiedad_id:p.id,porcentaje:m.porcentaje,criterios:m.criterios}] : []
   }) : []
   const guardado=await admin.rpc('comprador_guardar_resultados',{p_perfil:estado.perfil_id,p_revision:estado.revision,p_resultados:resultados})
   if(guardado.error) throw guardado.error
   if(guardado.data) procesados++
  } catch(err) {
   console.error('Error calculando perfil',estado.perfil_id,err)
   await admin.from('comprador_estados').update({ultimo_error:'No se pudo completar el cálculo; se reintentará.'}).eq('perfil_id',estado.perfil_id).eq('revision',estado.revision)
  }
 }
 return Response.json({ok:true,procesados})
})
