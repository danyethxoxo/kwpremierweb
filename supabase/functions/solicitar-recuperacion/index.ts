import { secureServe, consumeLimit } from '../_shared/security.ts'
import { validEmail } from '../_shared/security-core.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'
import { enviarCorreo, plantillaCorreo } from '../_shared/mailer.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const REDIRECT_TO = 'https://www.kwpremieroficial.com/restablecer-password.html'
const GENERIC_MESSAGE = 'Si ese correo tiene una cuenta, te llegará un enlace para restablecer tu contraseña.'

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function normalizeEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase()
  return validEmail(email) ? email : ''
}

secureServe({
  name: 'solicitar-recuperacion',
  auth: 'service',
  ipLimit: 8,
  maxBytes: 8192,
}, async (req) => {
  if (req.method !== 'POST') return response({ error: 'Método no permitido.' }, 405)
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return response({ error: 'Servicio no disponible.' }, 503)

  const body = await req.json().catch(() => ({}))
  const email = normalizeEmail(body.email)
  if (!email) return response({ ok: true, mensaje: GENERIC_MESSAGE })

  // El límite por correo evita que un tercero pueda bombardear una cuenta;
  // la respuesta sigue siendo genérica para no revelar si existe.
  await consumeLimit('recovery:email', email, 3, 3600)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: REDIRECT_TO },
  })
  const actionLink = data?.properties?.action_link
  if (error || !actionLink) {
    // La respuesta no distingue cuentas existentes de inexistentes.
    if (error) console.warn('No se generó enlace de recuperación', error.status || 400)
    return response({ ok: true, mensaje: GENERIC_MESSAGE })
  }

  const subject = 'Restablece tu contraseña | KW Premier'
  try {
    await enviarCorreo({
      to: email,
      subject,
      html: plantillaCorreo({
        title: 'Restablece tu contraseña',
        intro: 'Recibimos una solicitud para restablecer la contraseña de tu cuenta de KW Premier.',
        content: 'Da clic en el botón para crear una nueva contraseña. El enlace es personal y solo puede utilizarse una vez.',
        actionLabel: 'Restablecer contraseña',
        actionUrl: actionLink,
        note: 'Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña actual seguirá funcionando.',
      }),
      text: [
        'Restablece tu contraseña',
        '',
        'Recibimos una solicitud para restablecer la contraseña de tu cuenta de KW Premier.',
        'Abre este enlace para crear una nueva contraseña:',
        actionLink,
        '',
        'Si no solicitaste este cambio, puedes ignorar este correo.',
      ].join('\n'),
    })
  } catch (sendError) {
    console.error('No se pudo enviar el enlace de recuperación', sendError)
    return response({ error: 'No se pudo enviar el correo.' }, 502)
  }

  return response({ ok: true, mensaje: GENERIC_MESSAGE })
})
