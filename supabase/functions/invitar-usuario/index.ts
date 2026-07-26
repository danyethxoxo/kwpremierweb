// Edge Function: invitar-usuario
// Invita por correo a un nuevo usuario y le asigna un rol, sin que
// ninguna llave privilegiada (SERVICE_ROLE_KEY) toque el navegador.
// Solo Master/Admin pueden invitar; solo Master puede asignar el rol
// "admin". Se crea vía Supabase Dashboard > Edge Functions > Create
// function, pegando este código.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
// El sitio se publica en /kwpremierweb/ (GitHub Pages de proyecto).
const REDIRECT_TO = 'https://danyethxoxo.github.io/kwpremierweb/completar-registro.html'

const ROLES_ASIGNABLES = ['admin', 'staff', 'asociado']

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respond({ error: 'Método no permitido' }, 405)

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return respond({ error: 'Configuración del servidor incompleta (faltan variables de entorno).' }, 500)
    }

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return respond({ error: 'No autenticado' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Confirmar quién llama.
    const { data: callerData, error: callerError } = await admin.auth.getUser(token)
    if (callerError || !callerData?.user) return respond({ error: 'Sesión inválida' }, 401)

    const { data: callerProfile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', callerData.user.id)
      .single()

    if (profileError || !callerProfile) return respond({ error: 'No se encontró tu perfil' }, 403)

    const callerRole = callerProfile.role
    if (callerRole !== 'master' && callerRole !== 'admin') {
      return respond({ error: 'No tienes permiso para invitar usuarios' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const rol = String(body.rol || '')

    if (!email || !ROLES_ASIGNABLES.includes(rol)) {
      return respond({ error: 'Correo o rol inválido' }, 400)
    }

    if (rol === 'admin' && callerRole !== 'master') {
      return respond({ error: 'Solo el usuario master puede asignar el rol de administrador' }, 403)
    }

    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: REDIRECT_TO,
    })
    if (inviteError) {
      const mensaje = inviteError.message || 'No se pudo invitar al usuario (' + (inviteError.status || 'sin detalle') + ').'
      return respond({ error: mensaje }, 400)
    }

    const newUserId = inviteData?.user?.id
    if (!newUserId) return respond({ error: 'La invitación no devolvió un usuario válido.' }, 500)

    const { error: updateError } = await admin
      .from('profiles')
      .update({ role: rol })
      .eq('id', newUserId)

    if (updateError) {
      return respond({ error: 'Usuario invitado, pero no se pudo asignar el rol: ' + (updateError.message || 'error desconocido') }, 500)
    }

    return respond({ ok: true, user_id: newUserId })
  } catch (err) {
    return respond({ error: (err as Error).message || 'Error inesperado' }, 500)
  }
})
