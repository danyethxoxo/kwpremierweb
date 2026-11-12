import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'
import { secureServe, consumeLimit } from '../_shared/security.ts'
import { FeedError, parseFeed, sha256 } from './core.ts'

secureServe({ name: 'recibir-feed-propiedades', methods: ['GET','POST'], auth: 'service', json: false, maxBytes: 8 * 1024 * 1024, ipLimit: 60 }, async req => {
  const token = req.headers.get('x-api-key') || ''
  if (!/^kwp_feed_[a-f0-9]{64}$/.test(token)) return Response.json({ ok: false, error: 'Credencial de feed inválida.' }, { status: 401 })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: config, error } = await admin.from('propiedades_feed_config').select('id,publicacion_habilitada,url_feed,authorization_feed').eq('token_hash', await sha256(token)).eq('activo', true).maybeSingle()
  if (error) return Response.json({ ok: false, error: 'No se pudo verificar la conexión.' }, { status: 503 })
  if (!config) return Response.json({ ok: false, error: 'Credencial de feed inválida.' }, { status: 401 })
  const feedId = config.id
  await consumeLimit('feed:recepcion', config.id, 30)
  if (req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('envio_id') || ''
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(id)) return Response.json({ ok:false,error:'Indica un envio_id válido.' }, {status:400})
    const {data,error} = await admin.from('propiedades_feed_envios').select('envio_id,recibido_at,generado_at,resultado').eq('feed_id',config.id).eq('envio_id',id).eq('publicar',false).maybeSingle()
    if(error) return Response.json({ok:false,error:'No se pudo consultar el envío.'},{status:503})
    return Response.json(data ? {ok:true,...data} : {ok:false,error:'Envío no encontrado.'},{status:data?200:404})
  }
  let envioId: string | null = null
  async function rechazar(status: number, message: string) {
    const id = crypto.randomUUID()
    const {error} = await admin.from('propiedades_feed_rechazos').insert({id,feed_id:feedId,envio_id:envioId,codigo:status,mensaje:message.slice(0,500)})
    if(error) console.error('No se pudo registrar el rechazo del feed',error.code)
    return Response.json({ok:false,error:message,recepcion_id:id},{status})
  }
  const publicar = new URL(req.url).searchParams.get('publicar') === 'true'
  if (publicar && !config.publicacion_habilitada) return Response.json({ ok: false, error: 'Conexión en pruebas. La publicación requiere habilitación de Premier.' }, { status: 409 })
  try {
    let raw = await req.text(), type = (req.headers.get('content-type') || '').toLowerCase()
    if (new URL(req.url).searchParams.get('descargar') === 'true') {
      if (!config.url_feed) return Response.json({ ok: false, error: 'KW todavía no ha proporcionado una URL de feed configurada por Premier.' }, { status: 409 })
      // La URL solo puede configurarse desde el servidor; nunca se acepta una URL en el cuerpo.
      const headers: Record<string,string> = { Accept: 'application/json, application/xml' }
      if (config.authorization_feed) headers.Authorization = config.authorization_feed
      const upstream = await fetch(config.url_feed, { headers, redirect: 'error', signal: AbortSignal.timeout(30000) })
      if (!upstream.ok) return Response.json({ ok: false, error: 'La fuente del feed no respondió correctamente.' }, { status: 502 })
      const reader = upstream.body!.getReader(), chunks: Uint8Array[] = []
      let length = 0
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        length += value.length
        if (length > 8 * 1024 * 1024) { await reader.cancel(); throw new FeedError(413, 'El feed excede 8 MiB.') }
        chunks.push(value)
      }
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      type = (upstream.headers.get('content-type') || '').toLowerCase()
    }
    const feed = parseFeed(raw, type)
    envioId = feed.envioId
    const hash = await sha256(JSON.stringify({ generado: feed.generado, modo: feed.modo, rows: feed.rows }))
    const { data, error: dbError } = await admin.rpc(publicar ? 'propiedades_feed_recibir' : 'propiedades_feed_guardar_pruebas', {
      p_feed: config.id, p_envio: feed.envioId, p_hash: hash, p_generado: feed.generado,
      p_modo: feed.modo, p_filas: feed.rows, ...(publicar ? {p_publicar:true} : {}),
    })
    if (dbError) {
      if (dbError.code === 'P0001') return await rechazar(409,dbError.message)
      console.error('Error de recepción de feed', dbError.code)
      return await rechazar(503,'No se completó la recepción. Reintenta con el mismo envio_id.')
    }
    return Response.json({ ok: true, ...data })
  } catch (e) {
    if (e instanceof FeedError) return await rechazar(e.status,e.message)
    console.error('Error al validar el feed')
    return await rechazar(503,'No se pudo completar la recepción. Reintenta con el mismo envio_id.')
  }
})

