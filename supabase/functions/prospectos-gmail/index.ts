import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'
import { secureServe } from '../_shared/security.ts'
import { HttpError } from '../_shared/security-core.ts'
import { createGmailHandler } from './gmail.ts'

const api = Deno.env.get('SUPABASE_URL')!
const key = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(api, key, { auth: { persistSession: false, autoRefreshToken: false } })
const handle = createGmailHandler({
 encryptionRoot: Deno.env.get('PROSPECTOS_TOKEN_KEY') || Deno.env.get('DATA_GATEWAY_SECRET') || '',
 redirectUri: api + '/functions/v1/prospectos-gmail',
 reservedClientIds: [Deno.env.get('GOOGLE_CLIENT_ID') || ''],
 async backend(action, user, session, data = {}) {
  const result = await admin.rpc('prospectos_gmail_backend', { p_accion: action, p_usuario: user, p_sesion: session, p_datos: data })
  if (result.error) {
   if (result.error.code === '42501') throw new HttpError(403, 'No tienes acceso a Prospectos.')
   if (result.error.code === '22023') throw new HttpError(409, 'La configuración cambió. Actualiza la página e inténtalo nuevamente.')
   throw new HttpError(503, 'Servicio no disponible')
  }
  return result.data
 },
})
// Google necesita un callback sin JWT. El GET solo redirige; todos los POST
// verifican JWT, MFA, pertenencia al piloto y vigencia de la sesion.
secureServe({ name: 'prospectos-gmail', auth: req => req.method === 'GET' ? 'optional' : 'user', methods: ['GET', 'POST'], userLimit: 20, ipLimit: 120, maxBytes: 8192 }, handle)
