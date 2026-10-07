import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'
import { secureServe } from '../_shared/security.ts'
import { escaparHtml, enviarCorreo, plantillaCorreo } from '../_shared/mailer.ts'
import { buildXlsx, type XlsxCell, type XlsxSheet } from '../_shared/xlsx.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const SYNC_SECRET = Deno.env.get('SYNC_SECRET')
const DESTINATARIO = Deno.env.get('PROPIEDADES_REPORTE_EMAIL') || 'dani.guerrero@kwmexico.mx'
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
  periodoDesde: string
  periodoHasta: string
  modificadas: Historial[]
  historial: Historial[]
  propiedadesLeidas: number
  publicadasActuales: number
  suspendidasActuales: number
  totalActual: number
  inventarioAnterior: number
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

function filaPropiedad(historial: Historial): XlsxCell[] {
  const propiedad = historial.snapshot || {}
  const precio = numero(propiedad.precio)
  return [
    cell(texto(propiedad.market_center || propiedad.mc)),
    cell(direccion(propiedad)),
    cell(precio, precio === null ? undefined : 'number'),
    cell(texto(propiedad.moneda)),
    cell(texto(propiedad.asesor_nombre || propiedad.asesor)),
    cell(texto(propiedad.titulo)),
    cell(texto(propiedad.tipo)),
    cell(texto(propiedad.operacion)),
    cell(texto(historial.fuente_id || propiedad.fuente_id)),
    cell(fechaExcel(historial.registrado_at), 'date'),
    cell(enlacePropiedad(historial)),
  ]
}

function reporteXlsx(reporte: Reporte): Uint8Array {
  const encabezados = [
    'MC', 'Dirección', 'Precio', 'Moneda', 'Asesor', 'Título', 'Tipo', 'Operación',
    'ID de origen', 'Fecha', 'Enlace',
  ].map((value) => cell(value, 'header'))
  const rows: XlsxCell[][] = [
    [cell('Reporte diario de propiedades', 'title')],
    [cell('Fuente: KW México, inventario publicado; no Command')],
    [cell('Periodo desde:'), cell(fechaExcel(reporte.periodoDesde), 'date')],
    [cell('Periodo hasta:'), cell(fechaExcel(reporte.periodoHasta), 'date')],
    [cell('Actualizaciones de datos/fotos:'), cell(reporte.modificadas.length, 'integer')],
    [cell('Última actualización:'), cell(fechaExcel(reporte.ultimaCorrida), 'date')],
    [cell('Propiedades nuevas:'), cell(reporte.nuevas.length, 'integer')],
    [cell('Propiedades desactivadas:'), cell(reporte.desactivadas.length, 'integer')],
    [cell('Reactivadas:'), cell(reporte.reactivadas.length, 'integer')],
    [cell('Inventario Total actual:'), cell(reporte.publicadasActuales, 'integer')],
    [cell('Inventario Anterior:'), cell(reporte.inventarioAnterior, 'integer')],
    [],
    [cell(`Propiedades nuevas (${reporte.nuevas.length})`, 'section')],
    encabezados,
    ...reporte.nuevas.map(filaPropiedad),
    [],
    [cell(`Propiedades desactivadas (${reporte.desactivadas.length})`, 'section')],
    encabezados,
    ...reporte.desactivadas.map(filaPropiedad),
    [],
    [cell(`Reactivadas (${reporte.reactivadas.length})`, 'section')],
    encabezados,
    ...reporte.reactivadas.map(filaPropiedad),
    [],
    [cell(`Actualizaciones de datos/fotos (${reporte.modificadas.length})`, 'section')],
    encabezados,
    ...reporte.modificadas.map(filaPropiedad),
  ]

  const reporteSheet: XlsxSheet = {
    name: 'Reporte',
    widths: [24, 48, 16, 10, 28, 42, 20, 14, 16, 19, 58],
    rows,
  }
  const cambiosSheet: XlsxSheet = {
    name: 'Todos los cambios',
    widths: [20, 18, 18, ...(reporteSheet.widths || [])],
    rows: [
      [cell('Historial acumulado del periodo', 'title')],
      [cell('Periodo desde:'), cell(fechaExcel(reporte.periodoDesde), 'date')],
      [cell('Periodo hasta:'), cell(fechaExcel(reporte.periodoHasta), 'date')],
      [cell('Evento', 'header'), cell('Estado anterior', 'header'), cell('Estado nuevo', 'header'), ...encabezados],
      ...reporte.historial.map(item => [
        cell(item.tipo === 'alta' ? 'Alta' : item.tipo === 'estado_inicial' ? 'Estado inicial' : 'Cambio'),
        cell(texto(item.estatus_anterior)), cell(item.estatus_nuevo), ...filaPropiedad(item),
      ]),
    ],
  }
  return buildXlsx([reporteSheet, cambiosSheet])
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

async function leerHistorial(admin: ReturnType<typeof createClient<any>>, desde: string, hasta: string): Promise<Historial[]> {
  const historial: Historial[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from('propiedades_historial')
      .select('id, propiedad_id, fuente, fuente_id, estatus_anterior, estatus_nuevo, registrado_at, tipo, snapshot')
      .eq('fuente', FUENTE)
      .gt('registrado_at', desde)
      .lte('registrado_at', hasta)
      .order('registrado_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999)
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

  const periodoHasta = new Date().toISOString()
  const { data: anterior, error: anteriorError } = await admin.from('propiedades_reportes')
    .select('periodo_hasta,enviado_at').eq('fuente',FUENTE).eq('destinatario',DESTINATARIO).eq('estado','enviado')
    .order('enviado_at',{ascending:false}).limit(1).maybeSingle()
  if (anteriorError) throw anteriorError
  const periodoDesde = anterior?.periodo_hasta || anterior?.enviado_at || new Date(Date.parse(periodoHasta)-24*60*60*1000).toISOString()

  const [historial, totalActual, publicadasActuales, suspendidasActuales] = await Promise.all([
    leerHistorial(admin, periodoDesde, periodoHasta),
    contarInventario(admin),
    contarInventario(admin, 'publicada'),
    contarInventario(admin, 'suspendida'),
  ])

  const nuevas = historial.filter((item) => item.tipo === 'alta' && item.estatus_nuevo === 'publicada')
  const reactivadas = historial.filter((item) =>
    item.estatus_anterior === 'suspendida' && item.estatus_nuevo === 'publicada')
  const desactivadas = historial.filter((item) =>
    item.estatus_anterior === 'publicada' && item.estatus_nuevo === 'suspendida')
  const modificadas = [...new Map(historial.filter((item) => item.tipo === 'cambio' && item.estatus_anterior === 'publicada' && item.estatus_nuevo === 'publicada').map((item) => [item.propiedad_id,item])).values()]
  const inventarioAnterior = Math.max(0, publicadasActuales - nuevas.length - reactivadas.length + desactivadas.length)

  return {
    ultimaCorrida: sync.ultima_corrida,
    periodoDesde,periodoHasta,modificadas,historial,
    propiedadesLeidas: Number(sync.propiedades_afectadas || 0),
    publicadasActuales,
    suspendidasActuales,
    totalActual,
    inventarioAnterior,
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
    periodo_desde: reporte.periodoDesde,
    periodo_hasta: reporte.periodoHasta,
    modificadas: reporte.modificadas.length,
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
    intro: `Fuente: inventario publicado de KW México, no Command. Última lectura: ${fecha}. Periodo: ${fechaTexto(reporte.periodoDesde)} a ${fechaTexto(reporte.periodoHasta)}.`,
    content: `Se encontraron ${altas} propiedades nuevas, ${reactivadas} reactivaciones y ${desactivadas} desactivaciones. También se actualizaron datos o fotos de ${reporte.modificadas.length} propiedades. El inventario publicado pasó de ${reporte.inventarioAnterior} a ${reporte.publicadasActuales} propiedades. En total hay ${reporte.totalActual} registros, incluidos ${reporte.suspendidasActuales} suspendidos.`,
    actionLabel: 'Abrir propiedades',
    actionUrl: SITIO_PROPIEDADES,
    note: 'El detalle de las altas y desactivaciones está en el archivo Excel adjunto.',
    footer: 'Reporte automático de inventario de KW Premier.',
  })
  const texto = [
    'Reporte diario de propiedades',
    'Fuente: inventario publicado de KW México, no Command.',
    `Periodo: ${fechaTexto(reporte.periodoDesde)} a ${fechaTexto(reporte.periodoHasta)}`,
    `Actualizaciones de datos/fotos: ${reporte.modificadas.length}`,
    `Última actualización: ${fecha}`,
    `Altas nuevas: ${altas}`,
    `Reactivaciones: ${reactivadas}`,
    `Desactivaciones: ${desactivadas}`,
    `Inventario Total actual: ${reporte.publicadasActuales}`,
    `Inventario Anterior: ${reporte.inventarioAnterior}`,
    `Registros totales: ${reporte.totalActual}`,
    `Suspendidas actuales: ${reporte.suspendidasActuales}`,
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
