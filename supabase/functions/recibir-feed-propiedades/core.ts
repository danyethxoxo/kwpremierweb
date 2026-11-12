import { XMLParser, XMLValidator } from 'https://esm.sh/fast-xml-parser@5.12.0'

export class FeedError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
function fail(message: string): never { throw new FeedError(422, message) }
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, field: string, max = 300): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) return fail(`Campo ${field} inválido.`)
  return v.trim()
}
function list(v: unknown): unknown[] { return v == null || v === '' ? [] : Array.isArray(v) ? v : [v] }
function amount(v: unknown, field: string, integer = false): number | null {
  if (v == null || v === '') return null
  if (typeof v !== 'number' && (typeof v !== 'string' || !/^\d+(\.\d+)?$/.test(v))) return fail(`Campo ${field}: usa números sin separadores.`)
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 1e13 || (integer && !Number.isInteger(n))) return fail(`Campo ${field} inválido.`)
  return n
}
function marketData(p: Record<string, any>, generado: string): Record<string, any> {
  const result: Record<string, any> = {}
  if (p.dias_en_mercado != null && p.dias_en_mercado !== '') {
    const days = amount(p.dias_en_mercado, 'dias_en_mercado', true)!
    if (days > 365000) fail('dias_en_mercado fuera de rango.')
    result.dias_en_mercado = days
  }
  for (const field of ['fecha_publicacion','fecha_cierre']) {
    if (p[field] == null || p[field] === '') continue
    const value = text(p[field],field,10)
    const date = Date.parse(value+'T00:00:00Z')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date) || new Date(date).toISOString().slice(0,10)!==value) fail(`Campo ${field}: usa una fecha válida AAAA-MM-DD.`)
    if (value > new Date(generado).toISOString().slice(0,10)) fail(`Campo ${field}: no se permiten fechas futuras.`)
    result[field] = value
  }
  if (result.fecha_publicacion && result.fecha_cierre && result.fecha_cierre < result.fecha_publicacion) fail('fecha_cierre no puede ser anterior a fecha_publicacion.')
  // Si el proveedor cambia las fechas sin enviar días, recalcular en lugar de conservar una cifra anterior.
  if ((result.fecha_publicacion || result.fecha_cierre) && result.dias_en_mercado == null) result.dias_en_mercado = null
  return result
}
function urls(v: unknown): string[] {
  const values = object(v) ? v.foto ?? v.imagen ?? v.url : v
  return list(values).map((u) => {
    const s = text(u, 'imagenes', 2000)
    try { if (new URL(s).protocol !== 'https:') fail('Las fotografías deben usar HTTPS.') } catch { fail('URL de fotografía inválida.') }
    return s
  })
}
export function parseFeed(raw: string, contentType: string) {
  let root: any
  if (contentType.includes('xml')) {
    if (/<!DOCTYPE|<!ENTITY/i.test(raw)) fail('XML con DTD o entidades no permitido.')
    if (XMLValidator.validate(raw) !== true) fail('XML inválido.')
    root = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true, processEntities: true }).parse(raw).feed
  } else if (contentType.includes('json')) {
    try { root = JSON.parse(raw) } catch { fail('JSON inválido.') }
  } else throw new FeedError(415, 'Usa application/json o application/xml.')
  if (!object(root)) fail('Se requiere un objeto JSON o una raíz XML <feed>.')
  if (String(root.version) !== '1') fail('Versión no soportada. Usa version 1.')
  const envioId = text(root.envio_id, 'envio_id', 100)
  if (!/^[A-Za-z0-9._:-]+$/.test(envioId)) fail('envio_id solo admite letras, números, punto, guion, dos puntos y guion bajo.')
  const generado = text(root.generado_at, 'generado_at', 40)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(generado) || !Number.isFinite(Date.parse(generado))) fail('generado_at debe ser una fecha ISO 8601 con zona horaria.')
  if (Date.parse(generado) > Date.now() + 5 * 60000) fail('generado_at no puede estar en el futuro.')
  if (!['incremental', 'completo'].includes(root.modo)) fail('modo debe ser incremental o completo.')
  const sourceRows = Array.isArray(root.propiedades) ? root.propiedades : object(root.propiedades) ? list(root.propiedades.propiedad) : null
  if (!sourceRows || !sourceRows.length || sourceRows.length > 10000) fail('Se requieren entre 1 y 10000 propiedades por envío.')
  if (amount(root.total, 'total', true) !== sourceRows.length) fail('total debe coincidir con la cantidad de propiedades del envío.')
  const seen = new Set<string>()
  const rows = sourceRows.map((p: unknown, i: number) => {
    if (!object(p)) fail(`La propiedad ${i + 1} no es un objeto.`)
    const id = text(p.id, 'id', 120)
    if (seen.has(id)) fail(`ID repetido: ${id}`)
    seen.add(id)
    const statuses: Record<string, string> = { activa: 'publicada', publicada: 'publicada', inactiva: 'suspendida', suspendida: 'suspendida', vendida: 'vendida', rentada: 'rentada', reservada: 'reservada', no_publicada: 'no_publicada' }
    const status = statuses[typeof p.estatus==='string' ? p.estatus.trim().toLowerCase() : '']
    if (!status) fail(`Estatus desconocido para ${id}.`)
    // Una baja puede traer solo el ID y el estatus; nunca borra la ficha.
    const market = marketData(p,generado)
    if (status !== 'publicada') return { fuente_id: id, estatus: status, ...market }
    const row: Record<string, any> = { fuente_id: id, estatus: status, ...market, titulo: text(p.titulo, 'titulo') }
    if (!['venta', 'renta'].includes(p.operacion)) fail(`Operación inválida para ${id}.`)
    row.operacion = p.operacion
    row.tipo = text(p.tipo, 'tipo', 100)
    row.precio = amount(p.precio, 'precio')
    if (!row.precio) fail(`Precio requerido y mayor a cero para ${id}.`)
    if (!['MXN', 'USD'].includes(p.moneda)) fail(`Moneda inválida para ${id}.`)
    row.moneda = p.moneda
    for (const field of ['descripcion', 'calle', 'colonia', 'municipio', 'estado', 'cp', 'pais', 'market_center', 'asesor_nombre', 'asesor_kw_id']) {
      if (p[field] != null && p[field] !== '') row[field] = text(p[field], field, field === 'descripcion' ? 30000 : 300)
    }
    if (!row.estado || !row.municipio) fail(`Estado y municipio requeridos para ${id}.`)
    for (const field of ['recamaras', 'banos', 'estacionamientos', 'm2_construccion', 'm2_terreno']) row[field] = amount(p[field], field, ['recamaras', 'estacionamientos'].includes(field))
    for (const field of ['lat', 'lng']) {
      if (p[field] == null || p[field] === '') continue
      const n = Number(p[field]), limit = field === 'lat' ? 90 : 180
      if (!Number.isFinite(n) || Math.abs(n) > limit) fail(`Coordenada ${field} inválida para ${id}.`)
      row[field] = n
    }
    row.imagenes = urls(p.imagenes)
    if (row.imagenes.length > 100) fail(`Máximo 100 fotografías por propiedad: ${id}.`)
    row.caracteristicas = list(object(p.caracteristicas) ? p.caracteristicas.caracteristica : p.caracteristicas).map(v => text(v, 'caracteristicas', 300))
    if (p.asesor_email != null && p.asesor_email !== '') {
      const email = text(p.asesor_email, 'asesor_email', 254).toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`Correo de asesor inválido para ${id}.`)
      row.asesor_email = email
    }
    return row
  })
  return { envioId, generado: new Date(generado).toISOString(), modo: root.modo as string, rows }
}

export async function sha256(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}


