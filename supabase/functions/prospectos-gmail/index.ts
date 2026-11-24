import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'
import { secureServe } from '../_shared/security.ts'
import { HttpError } from '../_shared/security-core.ts'
import { createGmailHandler, syncConnectedMailbox } from './gmail.ts'

const api = Deno.env.get('SUPABASE_URL')!
const key = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(api, key, { auth: { persistSession: false, autoRefreshToken: false } })
const webhookSecret = Deno.env.get('WEBHOOK_SECRET') || ''
const encryptionRoot = Deno.env.get('PROSPECTOS_TOKEN_KEY') || Deno.env.get('DATA_GATEWAY_SECRET') || ''
const handle = createGmailHandler({
 encryptionRoot,
 redirectUri: api + '/functions/v1/prospectos-gmail',
 approvedClientIds: [Deno.env.get('GOOGLE_CLIENT_ID') || ''],
 async backend(action, user, session, data = {}) {
  const endpoint = ['reglas', 'checkpoint', 'importar'].includes(action) ? 'prospectos_gmail_import_backend' : 'prospectos_gmail_backend'
  const result = await admin.rpc(endpoint, { p_accion: action, p_usuario: user, p_sesion: session, p_datos: data })
  if (result.error) {
   if (result.error.code === '42501') throw new HttpError(403, 'No tienes acceso a Prospectos.')
   if (result.error.code === '22023') throw new HttpError(409, 'La configuración cambió. Actualiza la página e inténtalo nuevamente.')
   throw new HttpError(503, 'Servicio no disponible')
  }
  return result.data
 },
})
async function syncAll() {
 const loaded = await admin.rpc('prospectos_gmail_sync_accounts')
 if (loaded.error) throw new HttpError(503, 'No se pudo iniciar la sincronización automática.')
 const accounts = Array.isArray(loaded.data) ? loaded.data : []
 let importados = 0, procesados = 0, errores = 0
 for (const account of accounts) {
  try {
   const result = await syncConnectedMailbox({ user: account.user_id, current: { config: account.config, conexion: account.conexion },
    encryptionRoot, rules: account.rules, save: async data => {
     const saved = await admin.rpc('prospectos_gmail_import_job', { p_usuario: account.user_id, p_datos: data })
     if (saved.error) throw new HttpError(503, 'No se pudo guardar la sincronización.')
     return saved.data
    } })
   procesados++; importados += result.importados
  } catch { errores++ }
 }
 return Response.json({ ok: true, cuentas: procesados, importados, errores }, { headers: { 'Cache-Control': 'no-store' } })
}
// Google necesita un callback sin JWT. El GET solo redirige; todos los POST
// de usuario verifican JWT, MFA, pertenencia al piloto y vigencia de sesión.
secureServe({ name: 'prospectos-gmail', auth: req => req.headers.has('x-webhook-secret') ? 'service' : req.method === 'GET' ? 'optional' : 'user', methods: ['GET', 'POST'], userLimit: 20, ipLimit: 120, maxBytes: 8192 }, async (req, context) => {
 if (req.headers.has('x-webhook-secret')) {
  if (!webhookSecret || req.headers.get('x-webhook-secret') !== webhookSecret) throw new HttpError(401, 'No autorizado')
  const data = await req.json().catch(() => ({}))
  if (data?.accion !== 'sincronizar_todos' || req.method !== 'POST') throw new HttpError(400, 'Acción inválida')
  return await syncAll()
 }
 return handle(req, context)
})

