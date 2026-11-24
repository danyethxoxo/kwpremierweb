type GmailMessage = {
 id?: string
 internalDate?: string
 payload?: { headers?: Array<{ name?: string; value?: string }>; body?: { data?: string }; parts?: any[]; mimeType?: string; filename?: string }
}

const emailRx = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/i
const phoneRx = /\+?\d[\d ().-]{7,}\d/
const labels = [
 'first name', 'last name', 'lead name', 'lead email', 'lead phone number', 'e-mail', 'email', 'phone', 'property', 'listing',
 'message', 'source', 'property data', 'lead', 'nombre y apellido', 'nombre', 'correo electrónico', 'correo', 'teléfono', 'celular',
 'tu contacto busca', 'le interesa encontrar un inmueble en', 'interés', 'inmueble', 'mensaje', 'country', 'internal reference', 'mls number',
]

function decodeEntities(value: string) {
 return value.replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_, n) => { const code = Number(n); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '' })
  .replace(/&#x([\da-f]+);/gi, (_, n) => { const code = parseInt(n, 16); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '' })
}
function decodePart(value: string, charset = 'utf-8') {
 try {
  if (value.length > 1_000_000) return ''
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
  return new TextDecoder(charset).decode(Uint8Array.from(binary, c => c.charCodeAt(0)))
 } catch { return '' }
}
function walkParts(part: GmailMessage['payload'], out: Array<{ type: string; data: string }> = []) {
 if (!part) return out
 const disposition = (part.headers || []).find(h => String(h.name).toLowerCase() === 'content-disposition')?.value || ''
 if (part.body?.data && part.mimeType?.startsWith('text/') && !part.filename && !/^attachment\b/i.test(disposition)) {
  const contentType = (part.headers || []).find(h => String(h.name).toLowerCase() === 'content-type')?.value || ''
  const charset = contentType.match(/charset=["']?([^;"']+)/i)?.[1]?.trim() || 'utf-8'
  out.push({ type: part.mimeType, data: decodePart(part.body.data, charset) })
 }
 for (const child of part.parts || []) walkParts(child, out)
 return out
}
export function messageText(message: GmailMessage) {
 const parts = walkParts(message.payload)
 const selected = parts.find(p => p.type === 'text/plain') || parts.find(p => p.type === 'text/html')
 if (!selected) return { text: '', html: '' }
 const html = selected.type === 'text/html' ? selected.data : ''
 const text = selected.type === 'text/html'
  ? decodeEntities(selected.data.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
   .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div|tr|li|h[1-6])\s*>/gi, '\n').replace(/<[^>]*>/g, ' '))
  : selected.data
 return { text: text.replace(/\u200c|\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\r/g, ''), html }
}
function normalize(value: string) {
 return decodeEntities(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
function decodeHeader(value: string) {
 return value.replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi, (_, charset, encoding, data) => {
  try {
   if (encoding.toLowerCase() === 'b') {
    const binary = atob(data)
    return new TextDecoder(charset).decode(Uint8Array.from(binary, c => c.charCodeAt(0)))
   }
   const bytes = data.replace(/_/g, ' ').replace(/=([a-f\d]{2})/gi, (_match: string, h: string) => String.fromCharCode(parseInt(h, 16)))
   return new TextDecoder(charset).decode(Uint8Array.from(bytes, (c: string) => c.charCodeAt(0)))
  } catch { return '' }
 })
}
function isLabel(line: string) {
 const n = normalize(line).replace(/[:：-]+$/, '').trim()
 return labels.some(label => n === normalize(label))
}
function field(lines: string[], names: string[]) {
 const wanted = names.map(normalize)
 for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim()
  const colon = line.match(/^(.{2,70}?)\s*[:：]\s*(.*)$/)
  if (colon && wanted.includes(normalize(colon[1]))) {
   if (colon[2].trim()) return colon[2].trim()
   for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return isLabel(lines[j]) ? '' : lines[j].trim()
  }
  if (wanted.includes(normalize(line))) {
   for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return isLabel(lines[j]) ? '' : lines[j].trim()
  }
 }
 return ''
}
function messageField(lines: string[]) {
 const names = ['message', 'mensaje']
 for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim(), colon = line.match(/^(.{2,30}?)\s*[:：]\s*(.*)$/)
  if ((colon && names.includes(normalize(colon[1]))) || names.includes(normalize(line))) {
   const first = colon?.[2]?.trim() || ''
   const rest: string[] = first ? [first] : []
   for (let j = i + 1; j < lines.length && rest.join(' ').length < 2200; j++) {
    const next = lines[j].trim()
    if (!next) { if (rest.length) break; continue }
    if (isLabel(next) || /^(?:best regards|kind regards|regards|sincerely)\b/i.test(next)) break
    rest.push(next)
   }
   return rest.join('\n').trim()
  }
 }
 return ''
}
function portal(domain: string, subject: string, text: string) {
 const d = domain.toLowerCase(), s = normalize(subject), t = normalize(text)
 if ((d === 'omnimls.com' || d.endsWith('.omnimls.com')) && (t.includes('a new lead has been created') || s.includes('nuevo lead asignado'))) return 'OmniMLS'
 if ((d === 'jamesedition.com' || d.endsWith('.jamesedition.com')) && (s.includes('new lead') || t.includes('new interested buyer'))) return 'JamesEdition'
 if ((d === 'inmuebles24.com' || d.endsWith('.inmuebles24.com')) && (s.includes('vieron tu telefono') || t.includes('tu contacto busca'))) return 'Inmuebles24'
 return ''
}
function safeNotes(value: string) {
 return value.replace(emailRx, '').replace(phoneRx, '').replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim().slice(0, 2000)
}

export function parseGmailLead(message: GmailMessage) {
 const headers = new Map((message.payload?.headers || []).map(h => [String(h.name || '').toLowerCase(), h.value || '']))
 const from = headers.get('from') || '', subject = decodeEntities(decodeHeader(headers.get('subject') || ''))
 const sender = (from.match(/<([^>]+)>/)?.[1] || from.match(emailRx)?.[0] || '').toLowerCase()
 const domain = sender.split('@')[1] || ''
 const { text, html } = messageText(message)
 if (!text || !sender) return null
 let origin = portal(domain, subject, text)
 const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean)
 const first = field(lines, ['first name']), last = field(lines, ['last name'])
 const name = field(lines, ['lead name', 'nombre y apellido', 'nombre', 'name']) || [first, last].filter(Boolean).join(' ')
 const emailValue = field(lines, ['lead email', 'e-mail', 'email', 'correo electrónico', 'correo'])
 const phoneValue = field(lines, ['lead phone number', 'phone', 'teléfono', 'celular'])
 const correo = emailValue.match(emailRx)?.[0]?.toLowerCase() || ''
 const telefono = phoneValue.match(phoneRx)?.[0]?.trim() || ''
 if (!correo && !telefono) return null
 if (!origin && /(?:lead|prospect|interesad|contacto|consulta|inquiry)/i.test(subject + ' ' + text)) origin = 'Otro portal'
 if (!origin) return null
 const interest = field(lines, ['property', 'listing', 'tu contacto busca', 'le interesa encontrar un inmueble en', 'interés', 'inmueble'])
 const notes = safeNotes(messageField(lines))
 const rawDate = Number(message.internalDate)
 const received = Number.isFinite(rawDate) && rawDate > 0 ? new Date(rawDate) : new Date()
 return {
  gmail_message_id: String(message.id || '').slice(0, 256),
  nombre: (name || 'Prospecto sin nombre').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 160),
  correo: correo.slice(0, 254), telefono: telefono.slice(0, 50),
  interes: interest.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 1000), inmueble_url: '',
  origen: origin, notas: notes, created_at: received.toISOString(),
 }
}

