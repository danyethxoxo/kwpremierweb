import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'
import { secureServe } from '../_shared/security.ts'
import { enviarCorreo } from '../_shared/mailer.ts'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
const syncSecret = Deno.env.get('SYNC_SECRET')
const destinatario = Deno.env.get('PROPIEDADES_REPORTE_EMAIL') || 'dani.guerrero@kwmexico.mx'

function corteLectura(fecha: Date) {
  // Medianoche y mediodia en Ciudad de Mexico, UTC-6.
  const hora = 60 * 60 * 1000
  return Math.floor((fecha.getTime() - 6 * hora) / (12 * hora)) * 12 * hora + 6 * hora
}

async function llamar(nombre: string) {
  const response = await fetch(`${url}/functions/v1/${nombre}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-secret': syncSecret!, 'x-sync-source': 'kwmexico' },
    body: '{}', signal: AbortSignal.timeout(140000),
  })
  const body = await response.json()
  if (!response.ok || body.ok !== true) throw new Error(`${nombre}: ${response.status}`)
  return body
}

secureServe({ name: 'inventario-diario', auth: 'service', maxBytes: 4096 }, async (req) => {
  if (!webhookSecret || req.headers.get('x-webhook-secret') !== webhookSecret) return Response.json({ error: 'No autorizado' }, { status: 401 })
  if (!url || !serviceKey || !syncSecret) return Response.json({ error: 'Servicio no configurado' }, { status: 503 })
  const opciones = await req.json().catch(() => ({}))
  const soloSincronizar = opciones.solo_sincronizar === true
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const corte = corteLectura(new Date())
  try {
    const sync = await admin.from('propiedades_sync').select('ultimo_cursor,ultimo_error').eq('fuente', 'kwmexico').maybeSingle()
    if (sync.error) throw sync.error
    const actualizada = !sync.data?.ultimo_error && sync.data?.ultimo_cursor && Date.parse(sync.data.ultimo_cursor) >= corte
    if (!actualizada || soloSincronizar) {
      const lectura = await llamar('sincronizar-propiedades')
      if (lectura.corrida_completa !== true) {
        await admin.from('propiedades_sync').update({ ultimo_error: 'Lectura de inventario incompleta' }).eq('fuente', 'kwmexico')
        throw new Error('Lectura de inventario incompleta')
      }
      if (soloSincronizar) return Response.json({ ok: true, lectura })
    }
    const envio = await admin.from('propiedades_reportes').select('enviado_at').eq('fuente', 'kwmexico')
      .eq('destinatario', destinatario).eq('estado', 'enviado').order('enviado_at', { ascending: false }).limit(1).maybeSingle()
    if (envio.error) throw envio.error
    if (envio.data?.enviado_at && Date.parse(envio.data.enviado_at) >= corte) return Response.json({ ok: true, omitido: true })
    const reporte = await llamar('enviar-reporte-propiedades')
    return Response.json({ ok: true, reporte })
  } catch (error) {
    console.error('Inventario diario pendiente de reintento', error)
    if (req.headers.get('x-ultimo-intento') === 'true') {
      await enviarCorreo({ to: destinatario, subject: 'No se pudo completar la actualización de propiedades',
        html: '<p>No se pudo completar la sincronización o el reporte de KW México después de los reintentos de esta actualización.</p><p>El inventario conserva la última lectura disponible. Revisa el panel de propiedades.</p>',
        text: 'No se pudo completar la sincronización o el reporte de KW México. El inventario conserva la última lectura disponible.' })
    }
    return Response.json({ error: 'La actualización diaria queda pendiente' }, { status: 502 })
  }
})
