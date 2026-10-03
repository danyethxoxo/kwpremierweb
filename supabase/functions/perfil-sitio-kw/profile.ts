/// <reference lib="dom" />
import { parseHTML } from 'npm:linkedom@0.18.12'

export function sitioKW(value: unknown): string {
  const raw = String(value || '').trim()
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.kw\.com$/i.test(url.hostname)) {
    throw new Error('Sitio de KW no valido')
  }
  return `https://${url.hostname.toLowerCase()}`
}

export function extraerPerfil(html: string, sitio: string) {
  const { document } = parseHTML(html)
  const people: Record<string, unknown>[] = []
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(visit); return }
    const obj = value as Record<string, unknown>
    const types = [obj['@type']].flat()
    if (types.includes('Person') || types.includes('RealEstateAgent')) people.push(obj)
    Object.values(obj).forEach(visit)
  }
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(script.textContent || '')) } catch { /* Ignore malformed metadata. */ }
  }
  const person = people.find(p => p.name && (p.email || p.telephone || p.image)) || people[0] || {}
  const clean = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim()
  const text = (selector: string) => clean(document.querySelector(selector)?.textContent)
  const name = clean(person.name) || text('[class*="AgentProfile-name"], [class*="AgentBio-name"], [itemprop="name"]') || text('h1')
  const email = clean(person.email).replace(/^mailto:/i, '') ||
    clean(document.querySelector('a[href^="mailto:"]')?.getAttribute('href')).replace(/^mailto:/i, '').split('?')[0]
  const phone = clean(person.telephone) ||
    clean(document.querySelector('a[href^="tel:"]')?.getAttribute('href')).replace(/^tel:/i, '')
  const image = person.image as string | { url?: string } | undefined
  let foto = typeof image === 'string' ? image : image?.url || ''
  if (!foto) {
    const images = [...document.querySelectorAll('img')]
    const candidate = images.find(img => name && clean(img.getAttribute('alt')).toLowerCase().includes(name.toLowerCase())) ||
      document.querySelector('[class*="AgentProfile"] img, [class*="AgentBio"] img, img[itemprop="image"]')
    foto = candidate?.getAttribute('src') || candidate?.getAttribute('data-src') || ''
  }
  if (foto) {
    try { foto = new URL(foto, sitio).href; if (!foto.startsWith('https://')) foto = '' } catch { foto = '' }
  }
  if (!name || /^(about|about me|sobre m[ií]|acerca de|just a moment)/i.test(name) || (!email && !phone)) {
    throw new Error('No se pudo leer el perfil del asesor en su sitio KW')
  }
  return { nombre: name, apellido: '', email, whatsapp: phone, foto_url: foto, sitio_web: sitio, puesto: 'Asesor Inmobiliario' }
}
