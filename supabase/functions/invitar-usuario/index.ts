import { secureServe } from '../_shared/security.ts'
import { validEmail } from '../_shared/security-core.ts'
import { enviarCorreo, plantillaCorreo } from '../_shared/mailer.ts'
// Edge Function: invitar-usuario
// Invita por correo a un nuevo usuario y le asigna un rol, sin que
// ninguna llave privilegiada (SERVICE_ROLE_KEY) toque el navegador.
// Solo Master/Admin pueden invitar; solo Master puede asignar el rol
// "admin". Se crea vía Supabase Dashboard > Edge Functions > Create
// function, pegando este código.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const REDIRECT_TO = 'https://www.kwpremieroficial.com/completar-registro.html'

const ROLES_ASIGNABLES = ['admin', 'staff', 'asociado']

const CORS_HEADERS = {}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

secureServe({ name: 'invitar-usuario', userLimit: 10 }, async (req) => {
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

    if (!validEmail(email) || !ROLES_ASIGNABLES.includes(rol)) {
      return respond({ error: 'Correo o rol inválido' }, 400)
    }

    if (rol === 'admin' && callerRole !== 'master') {
      return respond({ error: 'Solo el usuario master puede asignar el rol de administrador' }, 403)
    }

    if (!Deno.env.get('RESEND_API_KEY')) return respond({ error: 'El servicio de correo no está configurado.' }, 503)
    const { data: inviteData, error: inviteError } = await admin.auth.admin.generateLink({
      type: 'invite', email, options: { redirectTo: REDIRECT_TO },
    })
    if (inviteError) {
      const mensaje = inviteError.message || 'No se pudo invitar al usuario (' + (inviteError.status || 'sin detalle') + ').'
      return respond({ error: mensaje }, 400)
    }

    const newUserId = inviteData?.user?.id
    if (!newUserId) return respond({ error: 'La invitación no devolvió un usuario válido.' }, 500)
    const enlace = inviteData?.properties?.action_link
    if (!enlace) return respond({ error: 'No se pudo generar el enlace de invitación.' }, 500)

    // Una fila inactiva obliga al invitado a verificar un correo de
    // seguridad antes de que PostgREST le permita acceder a datos. Se crea
    // antes de asignar el rol para que un fallo parcial siempre quede cerrado.
    const { error: mfaError } = await admin.from('mfa_metodos').upsert({
      user_id: newUserId,
      canal: 'correo',
      destino: null,
      activo: false,
      updated_at: new Date().toISOString(),
    })
    if (mfaError) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(newUserId)
      if (cleanupError) console.error('No se pudo eliminar la invitacion incompleta', newUserId, cleanupError.message)
      return respond({ error: cleanupError
        ? 'La invitacion quedo incompleta y debe eliminarse desde Auth antes de reintentar.'
        : 'No se pudo preparar la seguridad de la cuenta; la invitacion fue cancelada.' }, 500)
    }

    const { error: updateError } = await admin
      .from('profiles')
      .update({ role: rol })
      .eq('id', newUserId)

    if (updateError) {
      return respond({ error: 'Usuario bloqueado por MFA, pero no se pudo asignar el rol: ' + (updateError.message || 'error desconocido') }, 500)
    }

    try {
      await enviarCorreo({
        to: email, subject: 'Confirma tu cuenta en KW Premier',
        html: plantillaCorreo({
          intro: 'Te invitamos a formar parte de la plataforma de KW Premier.',
          title: 'Bienvenido a KW Premier',
          content: 'Estás a un paso de completar tu registro. Da clic en el botón para aceptar la invitación y configurar tu cuenta.',
          actionLabel: 'Aceptar invitación', actionUrl: enlace,
          note: 'El enlace es personal y solo puede utilizarse una vez. Si no esperabas esta invitación, puedes ignorar este correo.',
          footer: 'Este correo fue enviado porque administración te invitó a KW Premier.',
        }),
        text: 'Bienvenido a KW Premier\nAcepta tu invitación y configura tu cuenta:\n' + enlace + '\nSi no esperabas esta invitación, puedes ignorar este correo.',
      })
    } catch {
      // Conservar la cuenta bloqueada permite reenviar la invitacion sin borrar datos.
      return respond({ error: 'La cuenta quedó preparada, pero no se pudo enviar la invitación. Reintenta el envío.' }, 502)
    }
    return respond({ ok: true, user_id: newUserId })
  } catch (err) {
    return respond({ error: (err as Error).message || 'Error inesperado' }, 500)
  }
})
