import { escaparHtml, plantillaCorreo } from './mailer.ts'

type Propiedad = Record<string, unknown>
type Cliente = { id: string; nombre: string; propiedades: Propiedad[] }
const SITIO = 'https://www.kwpremieroficial.com'
function urlSegura(valor: unknown, soloKW = false): string {
  try {
    const url = new URL(String(valor || ''))
    if (url.protocol !== 'https:' || url.username || url.password) return ''
    if (soloKW && !/^(?:[a-z0-9-]+\.)*(?:kw\.com|kwmexico\.mx)$/i.test(url.hostname)) return ''
    return url.href
  } catch { return '' }
}
function enlacePropiedad(p: Propiedad, sitioAsesor: string) {
  const original = urlSegura(p.enlace_kw, true) || (p.fuente === 'kwmexico' && p.fuente_id ? 'https://www.kwmexico.mx/propiedades/' + encodeURIComponent(String(p.fuente_id)) : '')
  try {
    const sitio = new URL(/^https?:\/\//i.test(sitioAsesor) ? sitioAsesor : 'https://' + sitioAsesor)
    const enlace = new URL(original)
    if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.kw\.com$/i.test(sitio.hostname) && sitio.hostname !== 'www.kw.com' && !sitio.username && !sitio.password && !sitio.port && enlace.origin === 'https://kw.com' && /^\/es-419\/property\/[^/]+\/\d+$/.test(enlace.pathname)) return 'https://' + sitio.hostname + enlace.pathname + enlace.search + enlace.hash
  } catch { /* Sin sitio KW personal se conserva el enlace del inventario. */ }
  return original
}
function frase(cantidad: number, nombre: string) {
  return cantidad === 1 ? '1 nueva propiedad que le puede interesar a ' + nombre : cantidad + ' nuevas propiedades que le pueden interesar a ' + nombre
}
function boton(texto: string, url: string) {
  return `<a href="${escaparHtml(url)}" style="display:inline-block;margin:4px 8px 4px 0;padding:10px 14px;border:1px solid #800020;border-radius:8px;color:#800020 !important;background:#ffffff;font-size:12px;line-height:18px;font-weight:700;text-decoration:none !important;">${escaparHtml(texto)}</a>`
}
function precio(p: Propiedad) {
  if (!Number.isFinite(Number(p.precio)) || Number(p.precio) <= 0) return 'Precio a consultar'
  const moneda = String(p.moneda || 'MXN').toUpperCase()
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(Number(p.precio)) + ' ' + moneda }
  catch { return Number(p.precio).toLocaleString('es-MX') + ' ' + moneda }
}
export function correoCoincidencias(contenido: { clientes?: Cliente[] } | null, asesor: { nombre?: string; sitio_web?: string }) {
  const clientes = (Array.isArray(contenido?.clientes) ? contenido.clientes : []).filter(c => /^[0-9a-f-]{36}$/i.test(c.id) && Array.isArray(c.propiedades) && c.propiedades.length)
  if (!clientes.length) return null
  const asunto = (clientes.length === 1 ? frase(clientes[0].propiedades.length, clientes[0].nombre || 'tu cliente') : 'Nuevas propiedades para ' + clientes.length + ' clientes').replace(/[\r\n]+/g, ' ')
  let disponibles = 20
  const texto: string[] = [asunto]
  const grupos = clientes.map(c => {
    const perfil = SITIO + '/hub/perfil-comprador.html?perfil=' + encodeURIComponent(c.id)
    const visibles = c.propiedades.slice(0, Math.min(10, disponibles)); disponibles -= visibles.length
    const tarjetas = visibles.map(p => {
      const enlace = enlacePropiedad(p, asesor.sitio_web || '')
      const nombreAsesor = String(p.asesor_nombre || '').trim()
      const enlaceAsesor = nombreAsesor && /^\d+$/.test(String(p.asesor_kw_id || '')) ? 'https://kw.com/es-419/agent/' + encodeURIComponent(nombreAsesor.toLocaleLowerCase('es-MX').replace(/\s+/g, '-')) + '/' + p.asesor_kw_id : ''
      const foto = urlSegura(p.imagen)
      const titulo = String(p.titulo || 'Propiedad sin título')
      const ubicacion = [p.colonia, p.municipio, p.estado].filter(Boolean).join(', ')
      const datos = [[p.recamaras, 'recámaras'], [p.banos, 'baños'], [p.estacionamientos, 'estacionamientos'], [p.m2_construccion, 'm² de construcción'], [p.m2_terreno, 'm² de terreno']].filter(([v]) => v !== null && v !== undefined && v !== '').map(([v, etiqueta]) => v + ' ' + etiqueta).join(' · ')
      const operacion = p.operacion === 'renta' ? 'Renta' : p.operacion === 'venta' ? 'Venta' : ''
      texto.push([c.nombre, titulo, precio(p), ubicacion, datos, enlace, perfil, enlaceAsesor].filter(Boolean).join('\n'))
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border:1px solid #e9e4e6;border-radius:12px;margin-bottom:18px;">
        ${foto ? `<tr><td><img src="${escaparHtml(foto)}" alt="${escaparHtml(titulo)}" width="560" style="display:block;width:100%;max-width:560px;height:220px;object-fit:cover;border:0;border-radius:11px 11px 0 0;"></td></tr>` : ''}
        <tr><td style="padding:18px;overflow-wrap:anywhere;">
          <p style="margin:0 0 6px;font-size:12px;color:#777;">${escaparHtml([operacion, p.tipo].filter(Boolean).join(' · '))}</p>
          <h2 style="margin:0 0 8px;font-size:18px;line-height:1.4;color:#222;">${escaparHtml(titulo)}</h2>
          <p style="margin:0 0 10px;font-size:20px;font-weight:700;color:#800020;">${escaparHtml(precio(p))}</p>
          ${ubicacion ? `<p style="margin:0 0 10px;font-size:13px;color:#666;">${escaparHtml(ubicacion)}</p>` : ''}
          ${datos ? `<p style="margin:0 0 10px;font-size:12px;color:#555;line-height:1.7;">${escaparHtml(datos)}</p>` : ''}
          ${p.market_center || p.asesor_nombre ? `<p style="margin:0 0 14px;font-size:12px;color:#777;">${escaparHtml([p.market_center, p.asesor_nombre].filter(Boolean).join(' · '))}</p>` : ''}
          ${enlace ? boton('Ver propiedad en KW', enlace) : ''} ${boton('Abrir perfil comprador', perfil)} ${enlaceAsesor ? boton('Ver perfil del asesor', enlaceAsesor) : ''}
        </td></tr></table>`
    }).join('')
    const restantes = c.propiedades.length - visibles.length
    return `${clientes.length > 1 ? `<h2 style="font-size:16px;line-height:1.5;margin:0 0 14px;">${escaparHtml(frase(c.propiedades.length, c.nombre))}</h2>` : ''}${tarjetas}${restantes ? `<p style="margin:0 0 20px;color:#666;font-size:13px;">${visibles.length ? 'Mostramos las primeras ' + visibles.length + ' propiedades. ' : ''}Hay ${restantes} más para ${escaparHtml(c.nombre)}. <a href="${escaparHtml(perfil)}" style="color:#800020;">Verlas en el perfil comprador</a>.</p>` : ''}`
  }).join('')
  const html = plantillaCorreo({ intro: 'Hola ' + (asesor.nombre || 'asesor') + ',', title: asunto, content: '', bodyHtml: grupos })
  return { asunto, html, text: texto.join('\n\n') }
}

