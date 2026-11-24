import { parseGmailLead } from './lead-parser.ts'
import { HttpError } from '../_shared/security-core.ts'

type Rules = { remitentes?: string[]; asuntos?: string[] }
type Fetcher = (url: string, init: RequestInit) => Promise<Response>
export class HistoryExpiredError extends Error {}

function senderOf(message: any) {
 const from = (message?.payload?.headers || []).find((h: any) => String(h.name).toLowerCase() === 'from')?.value || ''
 return (from.match(/<([^>]+)>/)?.[1] || from.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '').toLowerCase()
}
function matchesRules(message: any, rules: Rules) {
 const senders = (rules.remitentes || []).map(v => v.trim().toLowerCase()).filter(Boolean)
 const subjects = (rules.asuntos || []).map(v => v.trim().toLowerCase()).filter(Boolean)
 if (!senders.length && !subjects.length) return false
 const sender = senderOf(message), domain = sender.split('@')[1] || ''
 const subject = String((message?.payload?.headers || []).find((h: any) => String(h.name).toLowerCase() === 'subject')?.value || '').toLowerCase()
 return senders.some(rule => rule.includes('@') ? sender === rule : domain === rule || domain.endsWith('.' + rule)) || subjects.some(rule => subject.includes(rule))
}
function safeSearch(value: string) { return value.replace(/[{}()[\]"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) }
export function gmailSearchQuery(rules: Rules) {
 const from = [...new Set((rules.remitentes || []).map(safeSearch).filter(Boolean))].map(v => `from:${v}`)
 const subject = [...new Set((rules.asuntos || []).map(safeSearch).filter(Boolean))].map(v => `subject:"${v}"`)
 const alternatives = [...from, ...subject]
 if (!alternatives.length) throw new HttpError(409, 'Configura al menos un remitente o asunto para detectar leads.')
 return `{${alternatives.join(' ')}}`
}
async function json(fetcher: Fetcher, url: string, access: string) {
 let response: Response
 try { response = await fetcher(url, { headers: { Authorization: 'Bearer ' + access }, redirect: 'error', signal: AbortSignal.timeout(12000) }) }
 catch { throw new Error('No se pudo consultar Gmail. Intenta de nuevo.') }
 if (response.status === 404 && url.includes('/history?')) throw new HistoryExpiredError('El historial de Gmail venció.')
 if (!response.ok) throw new HttpError(response.status === 401 || response.status === 403 ? 409 : 502, response.status === 401 || response.status === 403 ? 'Gmail no autorizó la lectura. Vuelve a vincular la cuenta.' : 'No se pudo consultar Gmail. Intenta de nuevo.')
 try { return await response.json() } catch { throw new HttpError(502, 'Gmail devolvió una respuesta inválida.') }
}
async function recentMessages(fetcher: Fetcher, access: string, rules: Rules) {
 const query = new URLSearchParams({ q: `newer_than:7d ${gmailSearchQuery(rules)}`, maxResults: '100' })
 const ids: string[] = []; let pageToken = '', pages = 0
 do {
  if (pageToken) query.set('pageToken', pageToken)
  const result = await json(fetcher, `https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`, access)
  ids.push(...(result.messages || []).map((m: any) => String(m.id || '')).filter(Boolean))
  pageToken = result.nextPageToken || ''; pages++
 } while (pageToken && pages < 10)
 if (pageToken) throw new HttpError(429, 'Hay muchos correos por revisar. Vuelve a sincronizar en un momento.')
 return { ids: [...new Set(ids)], incomplete: !!pageToken }
}
async function historyMessages(fetcher: Fetcher, access: string, historyId: string) {
 const params = new URLSearchParams({ startHistoryId: historyId, historyTypes: 'messageAdded', maxResults: '500' })
 const ids: string[] = []; let pageToken = '', pages = 0, nextHistoryId = historyId
 do {
  if (pageToken) params.set('pageToken', pageToken)
  const result = await json(fetcher, `https://gmail.googleapis.com/gmail/v1/users/me/history?${params}`, access)
  if (result.historyId) nextHistoryId = String(result.historyId)
  for (const h of result.history || []) for (const item of h.messagesAdded || []) if (item.message?.id) ids.push(String(item.message.id))
  pageToken = result.nextPageToken || ''; pages++
 } while (pageToken && pages < 10)
 if (pageToken) throw new Error('Hay muchos correos nuevos para una sola lectura. Vuelve a sincronizar en un momento.')
 return { ids: [...new Set(ids)], historyId: nextHistoryId }
}
async function getMessages(fetcher: Fetcher, access: string, ids: string[]) {
 const out: any[] = []
 for (let i = 0; i < ids.length; i += 8) {
  const batch = await Promise.all(ids.slice(i, i + 8).map(async id => {
   const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`
   try {
    const response = await fetcher(url, { headers: { Authorization: 'Bearer ' + access }, redirect: 'error', signal: AbortSignal.timeout(12000) })
    if (response.status === 404) return null
    if (!response.ok) throw new HttpError(response.status === 401 || response.status === 403 ? 409 : 502, response.status === 401 || response.status === 403 ? 'Gmail no autorizó la lectura. Vuelve a vincular la cuenta.' : 'No se pudo consultar Gmail. Intenta de nuevo.')
    return await response.json()
   } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(502, 'No se pudo consultar Gmail. Intenta de nuevo.')
   }
  }))
  out.push(...batch.filter(Boolean))
 }
 return out
}
export async function syncMailbox(options: { fetcher: Fetcher; accessToken: string; historyId: string; rules: Rules }) {
 const { fetcher, accessToken, rules } = options
 gmailSearchQuery(rules)
 let ids: string[], historyId = options.historyId, incomplete = false, fallback = false
 if (historyId) {
  try {
   const history = await historyMessages(fetcher, accessToken, historyId)
   ids = history.ids; historyId = history.historyId
  } catch (error) {
   if (!(error instanceof HistoryExpiredError)) throw error
   fallback = true
   const profile = await json(fetcher, 'https://gmail.googleapis.com/gmail/v1/users/me/profile', accessToken)
   if (!profile.historyId) throw new Error('No se pudo establecer el historial de Gmail.')
   historyId = String(profile.historyId)
   const recent = await recentMessages(fetcher, accessToken, rules)
   ids = recent.ids; incomplete = recent.incomplete
  }
 } else {
  const profile = await json(fetcher, 'https://gmail.googleapis.com/gmail/v1/users/me/profile', accessToken)
  if (!profile.historyId) throw new Error('No se pudo establecer el historial de Gmail.')
  historyId = String(profile.historyId); ids = []
 }
 if (ids.length > 500) throw new HttpError(429, 'Hay muchos correos nuevos para una sola lectura. Vuelve a sincronizar en un momento.')
 const messages = await getMessages(fetcher, accessToken, ids)
 const leads = messages.filter(message => matchesRules(message, rules)).map(parseGmailLead).filter(Boolean)
 return { leads, historyId, revisados: messages.length, incomplete, fallback }
}

