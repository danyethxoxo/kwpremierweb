import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'
import { secureServe } from '../_shared/security.ts'
import { HttpError, validUuid } from '../_shared/security-core.ts'

const BUCKET = 'propiedades-miniaturas'
async function ruta(id: string, origen: string) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(origen)))
  return `${id}/v1-${Array.from(hash).map(b => b.toString(16).padStart(2,'0')).join('')}.webp`
}

secureServe({ name: 'miniaturas-propiedades', auth: 'service', methods: ['POST'], maxBytes: 200000, ipLimit: 120 }, async (req) => {
  const secret = Deno.env.get('SYNC_SECRET')
  if (!secret || req.headers.get('x-sync-secret') !== secret) throw new HttpError(401,'No autorizado')
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url,key,{auth:{persistSession:false}})
  const body = await req.json()
  if (body.accion === 'pendientes') {
    const {data,error} = await admin.rpc('propiedades_miniaturas_pendientes',{p_limite:40})
    if (error) throw new HttpError(503,'No se pudieron consultar las miniaturas')
    const items = await Promise.all((data || []).map(async (p: {id:string;imagen_origen:string}) => {
      const path = await ruta(p.id,p.imagen_origen)
      const {data: firma,error: firmaError} = await admin.storage.from(BUCKET).createSignedUploadUrl(path,{upsert:true})
      if (firmaError || !firma) throw new HttpError(503,'No se pudo preparar la carga')
      return {...p,upload_url:firma.signedUrl}
    }))
    return Response.json({items})
  }
  if (body.accion !== 'confirmar' || !Array.isArray(body.items) || body.items.length > 40) throw new HttpError(400,'Solicitud invalida')
  for (const item of body.items) {
    if (!validUuid(item.id) || typeof item.imagen_origen !== 'string') throw new HttpError(400,'Miniatura invalida')
  }
  if (!body.items.length) return Response.json({guardadas:0})
  const {data: propiedades,error: consultaError} = await admin.from('propiedades').select('id,imagenes').in('id',body.items.map((item: {id:string}) => item.id))
  if (consultaError) throw new HttpError(503,'No se pudo verificar el inventario')
  const actuales = new Map((propiedades || []).map(p => [p.id,p.imagenes?.[0]]))
  let guardadas = 0
  const filas = await Promise.all(body.items.map(async (item: {id:string;imagen_origen:string;ok:boolean}) => {
    if (actuales.get(item.id) !== item.imagen_origen) return null
    if (!item.ok) {
      return {propiedad_id:item.id,
        imagen_origen:item.imagen_origen,miniatura_url:null,bytes:null,
        reintentar_despues:new Date(Date.now()+86400000).toISOString()}
    }
    const path = await ruta(item.id,item.imagen_origen)
    const nombre = path.split('/')[1]
    const {data: objetos,error:objError} = await admin.storage.from(BUCKET).list(item.id,{search:nombre,limit:1})
    const objeto = objetos?.find(o => o.name === nombre)
    if (objError || !objeto || objeto.metadata?.mimetype !== 'image/webp' || !objeto.metadata?.size || objeto.metadata.size > 250000) throw new HttpError(400,'La miniatura no se cargo correctamente')
    const {data:publica} = admin.storage.from(BUCKET).getPublicUrl(path)
    guardadas++
    return {propiedad_id:item.id,imagen_origen:item.imagen_origen,
      miniatura_url:publica.publicUrl,bytes:objeto.metadata.size,reintentar_despues:null}
  }))
  const validas = filas.filter(fila => fila !== null)
  if (validas.length) {
    const {error} = await admin.from('propiedades_miniaturas').upsert(validas)
    if (error) throw new HttpError(503,'No se pudieron guardar las miniaturas')
  }
  return Response.json({guardadas})
})
