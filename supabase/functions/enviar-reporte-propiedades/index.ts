import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'
import { secureServe } from '../_shared/security.ts'
import { escaparHtml, enviarCorreo, plantillaCorreo } from '../_shared/mailer.ts'
import { buildXlsx, type XlsxCell, type XlsxSheet } from '../_shared/xlsx.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const SYNC_SECRET = Deno.env.get('SYNC_SECRET')
const DESTINATARIO = 'dani.guerrero@kwmexico.mx'
const FUENTE = 'kwmexico'
const ZONA_LOCAL = 'America/Mexico_City'
const SITIO_PROPIEDADES = 'https://www.kwpremieroficial.com/propiedades.html'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Historial = {
  id: number
  propiedad_id: string
  fuente: string
  fuente_id: string | null
  estatus_anterior: string | null
  estatus_nuevo: string
  registrado_at: string
  tipo: 'estado_inicial' | 'alta' | 'cambio'
  snapshot: Record<string, unknown>
}

type Reporte = {
  ultimaCorrida: string
  propiedadesLeidas: number
  publicadasActuales: number
  suspendidasActuales: number
  totalActual: number
  nuevas: Historial[]
  reactivadas: Historial[]
  desactivadas: Historial[]
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function texto(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function numero(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function partesLocales(iso: string) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_LOCAL,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const mapa = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]))
  return {
    year: Number(mapa.year),
    month: Number(mapa.month),
    day: Number(mapa.day),
    hour: Number(mapa.hour),
    minute: Number(mapa.minute),
    second: Number(mapa.second),
  }
}

function fechaExcel(iso: string): number {
  const local = partesLocales(iso)
  const localUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second)
  const excelEpoch = Date.UTC(1899, 11, 30)
  return (localUtc - excelEpoch) / 86400000
}

function fechaTexto(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_LOCAL,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

function fechaArchivo(iso: string): string {
  const local = partesLocales(iso)
  return [local.year, String(local.month).padStart(2, '0'), String(local.day).padStart(2, '0')].join('-')
}

function direccion(propiedad: Record<string, unknown>): string {
  return [
    propiedad.calle,
    propiedad.colonia,
    propiedad.municipio,
    propiedad.estado,
    propiedad.cp,
  ].map(texto).filter(Boolean).join(', ')
}

function enlacePropiedad(historial: Historial): string {
  const id = texto(historial.fuente_id || historial.snapshot?.fuente_id)
  return id ? `https://www.kwmexico.mx/propiedades/${encodeURIComponent(id)}` : ''
}

function cell(value: string | number | null, style?: XlsxCell['style']): XlsxCell {
  return { value, ...(style ? { style } : {}) }
}

function filaPropiedad(historial: Historial, tipoAlta?: string): XlsxCell[] {
  const propiedad = historial.snapshot || {}
  const precio = numero(propiedad.precio)
  const fila: XlsxCell[] = []
  if (tipoAlta) fila.push(cell(tipoAlta))
  fila.push(
    cell(fechaExcel(historial.registrado_at), 'date'),
    cell(texto(historial.fuente_id || propiedad.fuente_id)),
    cell(texto(propiedad.titulo)),
    cell(texto(propiedad.tipo)),
    cell(texto(propiedad.operacion)),
    cell(precio, precio === null ? undefined : 'number'),
    cell(texto(propiedad.moneda)),
    cell(direccion(propiedad)),
    cell(texto(propiedad.estado)),
    cell(texto(propiedad.municipio)),
    cell(texto(propiedad.asesor_nombre)),
    cell(texto(propiedad.market_center)),
    cell(enlacePropiedad(historial)),
  )
  return fila
}

function reporteXlsx(reporte: Reporte): Uint8Array {
  const resumen: XlsxSheet = {
    name: 'Resumen',
    widths: [42, 24],
    rows: [
      [cell('Reporte diario de propiedades', 'title')],
      [cell('Última lectura, hora de Ciudad de México'), cell(fechaExcel(reporte.ultimaCorrida), 'date')],
      [cell('Propiedades leídas'), cell(reporte.propiedadesLeidas, 'integer')],
      [cell('Altas nuevas'), cell(reporte.nuevas.length, 'integer')],
      [cell('Reactivadas'), cell(reporte.reactivadas.length, 'integer')],
      [cell('Desactivadas'), cell(reporte.desactivadas.length, 'integer')],
      [cell('Inventario actual'), cell(reporte.totalActual, 'integer')],
      [cell('Publicadas actuales'), cell(reporte.publicadasActuales, 'integer')],
      [cell('Suspendidas actuales'), cell(reporte.suspendidasActuales, 'integer')],
      [cell('Las reactivaciones aparecen también en la hoja Nuevas como Reactivada', 'note')],
    ],
  }

  const encabezados = [
    'Tipo de alta', 'Fecha y hora', 'ID de origen', 'Título', 'Tipo', 'Operación',
    'Precio', 'Moneda', 'Dirección', 'Estado', 'Municipio', 'Asesor', 'Market Center', 'Enlace',
  ].map((value) => cell(value, 'header'))
  const nuevas: XlsxSheet = {
    name: 'Nuevas',
    widths: [16, 19, 15, 42, 20, 12, 16, 10, 48, 24, 24, 28, 24, 58],
    freezeRows: 1,
    autofilter: true,
    rows: [encabezados, ...reporte.nuevas.map((historial) => filaPropiedad(historial, 'Nueva')),
      ...reporte.reactivadas.map((historial) => filaPropiedad(historial, 'Reactivada'))],
  }

  const encabezadosDesactivadas = encabezados.slice(1)
  const desactivadas: XlsxSheet = {
    name: 'Desactivadas',
    widths: [19, 15, 42, 20, 12, 16, 10, 48, 24, 24, 28, 24, 58],
    freezeRows: 1,
    autofilter: true,
    rows: [encabezadosDesactivadas, ...reporte.desactivadas.map((historial) => filaPropiedad(historial))],
  }

  return buildXlsx([resumen, nuevas, desactivadas])
}

function base64(bytes: Uint8Array): string {
  let result = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(result)
}

async function contarInventario(admin: ReturnType<typeof createClient<any>>, estatus?: string): Promise<number> {
  let consulta = admin.from('propiedades').select('id', { count: 'exact', head: true }).eq('fuente', FUENTE)
  if (estatus) consulta = consulta.eq('estatus', estatus)
  const { count, error } = await consulta
  if (error) throw error
  return count || 0
}

async function leerHistorial(admin: ReturnType<typeof createClient<any>>, corrida: string): Promise<Historial[]> {
  const historial: Historial[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin.from('propiedades_historial')
      .select('id, propiedad_id, fuente, fuente_id, estatus_anterior, estatus_nuevo, registrado_at, tipo, snapshot')
      .eq('fuente', FUENTE)
      .gte('registrado_at', corrida)
      .order('registrado_at', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, desde + 999)
    if (error) throw error
    historial.push(...(data || []) as Historial[])
    if (!data || data.length < 1000) break
  }
  return historial
}

async function prepararReporte(admin: ReturnType<typeof createClient<any>>): Promise<Reporte> {
  const { data: sync, error: syncError } = await admin.from('propiedades_sync')
    .select('ultima_corrida, propiedades_afectadas, ultimo_error')
    .eq('fuente', FUENTE)
    .maybeSingle()
  if (syncError) throw syncError
  if (!sync?.ultima_corrida) throw new Error('No hay una lectura de propiedades disponible.')
  if (sync.ultimo_error) throw new Error('La última lectura de propiedades terminó con error.')

  const [historial, totalActual, publicadasActuales, suspendidasActuales] = await Promise.all([
    leerHistorial(admin, sync.ultima_corrida),
    contarInventario(admin),
    contarInventario(admin, 'publicada'),
    contarInventario(admin, 'suspendida'),
  ])

  const nuevas = historial.filter((item) => item.tipo === 'alta' && item.estatus_nuevo === 'publicada')
  const reactivadas = historial.filter((item) =>
    item.estatus_anterior === 'suspendida' && item.estatus_nuevo === 'publicada')
  const desactivadas = historial.filter((item) =>
    item.estatus_anterior === 'publicada' && item.estatus_nuevo === 'suspendida')

  return {
    ultimaCorrida: sync.ultima_corrida,
    propiedadesLeidas: Number(sync.propiedades_afectadas || 0),
    publicadasActuales,
    suspendidasActuales,
    totalActual,
    nuevas,
    reactivadas,
    desactivadas,
  }
}

async function reclamarReporte(admin: ReturnType<typeof createClient<any>>, reporte: Reporte) {
  const clave = { fuente: FUENTE, corrida: reporte.ultimaCorrida, destinatario: DESTINATARIO }
  const { data: existente, error: lecturaError } = await admin.from('propiedades_reportes')
    .select('id, estado, mensaje_id')
    .match(clave)
    .maybeSingle()
  if (lecturaError) throw lecturaError
  if (existente?.estado === 'enviado') return { id: existente.id, omitido: true }
  if (existente?.estado === 'enviando') return { id: existente.id, omitido: true }

  const datos = {
    ...clave,
    estado: 'enviando',
    altas_nuevas: reporte.nuevas.length,
    reactivadas: reporte.reactivadas.length,
    desactivadas: reporte.desactivadas.length,
    error: null,
  }
  if (existente) {
    const { error } = await admin.from('propiedades_reportes').update(datos).eq('id', existente.id)
    if (error) throw error
    return { id: existente.id, omitido: false }
  }
  const { data: creado, error } = await admin.from('propiedades_reportes')
    .insert(datos)
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { id: null, omitido: true }
    throw error
  }
  return { id: creado.id, omitido: false }
}

function armarCorreo(reporte: Reporte) {
  const fecha = fechaTexto(reporte.ultimaCorrida)
  const altas = reporte.nuevas.length
  const reactivadas = reporte.reactivadas.length
  const desactivadas = reporte.desactivadas.length
  const html = plantillaCorreo({
    title: 'Reporte diario de propiedades',
    intro: `La última lectura terminó el ${fecha}.`,
    content: `Se encontraron ${altas} altas nuevas, ${reactivadas} reactivaciones y ${desactivadas} desactivaciones. El inventario actual tiene ${reporte.totalActual} registros, de los cuales ${reporte.publicadasActuales} están publicados.`,
    actionLabel: 'Abrir propiedades',
    actionUrl: SITIO_PROPIEDADES,
    note: 'El detalle de las altas y desactivaciones está en el archivo Excel adjunto.',
    footer: 'Reporte automático de inventario de KW Premier.',
  })
  const texto = [
    'Reporte diario de propiedades',
    `Última lectura: ${fecha}`,
    `Altas nuevas: ${altas}`,
    `Reactivaciones: ${reactivadas}`,
    `Desactivaciones: ${desactivadas}`,
    `Inventario actual: ${reporte.totalActual}`,
    `Publicadas: ${reporte.publicadasActuales}`,
    '',
    'El detalle va en el archivo Excel adjunto.',
  ].join('\n')
  return { html, texto }
}

secureServe({ name: 'enviar-reporte-propiedades', auth: 'service', ipLimit: 30, maxBytes: 128 * 1024 }, async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SYNC_SECRET || !EMAIL_RE.test(DESTINATARIO)) {
    return response({ error: 'Servicio no configurado.' }, 503)
  }
  if (req.headers.get('x-sync-secret') !== SYNC_SECRET) return response({ error: 'No autorizado.' }, 401)

  let admin: ReturnType<typeof createClient<any>> | null = null
  let reporteId: number | null = null
  try {
    admin = createClient<any>(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const cliente = admin
    const reporte = await prepararReporte(cliente)
    const reclamo = await reclamarReporte(cliente, reporte)
    reporteId = reclamo.id
    if (reclamo.omitido) return response({ ok: true, omitido: true, corrida: reporte.ultimaCorrida })

    const archivo = reporteXlsx(reporte)
    const nombreArchivo = `reporte-propiedades-${fechaArchivo(reporte.ultimaCorrida)}.xlsx`
    const correo = armarCorreo(reporte)
    const envio = await enviarCorreo({
      to: DESTINATARIO,
      subject: `Reporte diario de propiedades | ${fechaArchivo(reporte.ultimaCorrida)}`,
      html: correo.html,
      text: correo.texto,
      attachments: [{
        filename: nombreArchivo,
        content: base64(archivo),
        content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }],
    })
    await cliente.from('propiedades_reportes').update({
      estado: 'enviado',
      enviado_at: new Date().toISOString(),
      mensaje_id: envio?.id || null,
      error: null,
    }).eq('id', reporteId)
    return response({
      ok: true,
      enviado_a: DESTINATARIO,
      corrida: reporte.ultimaCorrida,
      altas_nuevas: reporte.nuevas.length,
      reactivadas: reporte.reactivadas.length,
      desactivadas: reporte.desactivadas.length,
    })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error desconocido'
    if (admin && reporteId) {
      await admin.from('propiedades_reportes').update({ estado: 'error', error: mensaje.slice(0, 500) }).eq('id', reporteId)
    }
    console.error('No se pudo enviar el reporte diario de propiedades', mensaje)
    return response({ error: 'No se pudo enviar el reporte diario.' }, 502)
  }
})
