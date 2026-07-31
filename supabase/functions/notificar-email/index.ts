// Edge Function: notificar-email
//
// Manda un correo cada vez que se guarda una notificación en la
// plataforma (la de la campanita). No la llama ninguna pantalla: la
// dispara la base de datos sola, con un Database Webhook sobre la tabla
// `notificaciones`, así que sirve para todas por igual —usuario nuevo,
// incidencia, prospecto, lo que se agregue después— sin tener que tocar
// nada más.
//
// A quién le llega: al dueño de la notificación, al correo con el que
// entra a la plataforma.
//
// ─────────────────────────────────────────────────────────────
// CÓMO SE PONE A FUNCIONAR (una sola vez)
// ─────────────────────────────────────────────────────────────
// 1. Edge Functions > Create function, con el nombre `notificar-email`,
//    y se pega este archivo completo.
//
// 2. Project Settings > Edge Functions > Secrets:
//      RESEND_API_KEY   la llave de https://resend.com (tiene plan gratis)
//      EMAIL_FROM       opcional, ej. 'KW Premier <avisos@tudominio.com>'
//      WEBHOOK_SECRET   una contraseña larga que tú inventes
//
// 3. Database > Webhooks > Create a new hook:
//      Tabla:      notificaciones
//      Eventos:    Insert
//      Tipo:       HTTP Request  →  POST
//      URL:        https://<tu-proyecto>.supabase.co/functions/v1/notificar-email
//      Headers:    Content-Type: application/json
//                  x-webhook-secret: <la misma contraseña del paso 2>
//
// El secreto del paso 2 y 3 es lo que impide que cualquiera con la URL
// se ponga a mandar correos a nombre de la oficina.
//
// Mientras no se configure RESEND_API_KEY, la función responde que no
// mandó nada pero no truena: la campanita sigue funcionando igual.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'KW Premier <onboarding@resend.dev>'
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')

const SITIO = 'https://danyethxoxo.github.io/kwpremierweb'

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function escapeHtml(str: string) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string))
}

// El webhook manda la URL relativa que guardó la notificación
// (ej. "hub/tickets.html"); aquí se vuelve una liga completa.
function ligaCompleta(url: string | null) {
  if (!url) return SITIO + '/portal.html'
  if (/^https?:\/\//i.test(url)) return url
  return SITIO + '/' + String(url).replace(/^\/+/, '')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond({ error: 'Método no permitido' }, 405)

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return respond({ error: 'Faltan variables de entorno del proyecto.' }, 500)
    }

    // Quien llama es la base de datos, no una persona con sesión: por eso
    // el candado es un secreto compartido y no un token de usuario.
    if (!WEBHOOK_SECRET) {
      return respond({ error: 'Falta configurar WEBHOOK_SECRET.' }, 500)
    }
    if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
      return respond({ error: 'No autorizado' }, 401)
    }

    const cuerpo = await req.json().catch(() => ({}))
    // Un Database Webhook manda { type, table, record, old_record }.
    const fila = cuerpo.record || cuerpo
    const userId = fila?.user_id
    const titulo = String(fila?.titulo || '').trim()
    const mensaje = String(fila?.mensaje || '').trim()

    if (!userId || !titulo) {
      return respond({ error: 'La notificación viene sin destinatario o sin título.' }, 400)
    }

    if (!RESEND_API_KEY) {
      return respond({ ok: false, aviso: 'RESEND_API_KEY no está configurada; no se envió correo.' })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: perfil, error: errPerfil } = await admin
      .from('profiles')
      .select('nombre, apellido, email')
      .eq('id', userId)
      .single()

    if (errPerfil || !perfil?.email) {
      return respond({ ok: false, aviso: 'El destinatario no tiene correo registrado.' })
    }

    const nombre = String(perfil.nombre || '').trim() || 'Hola'
    const liga = ligaCompleta(fila?.url)

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55;max-width:560px;">
        <p style="margin:0 0 16px;">${escapeHtml(nombre)}, tienes un aviso nuevo en la plataforma:</p>
        <div style="border-left:3px solid #CC0000;padding:2px 0 2px 14px;margin:0 0 20px;">
          <p style="font-size:16px;font-weight:700;margin:0 0 4px;">${escapeHtml(titulo)}</p>
          ${mensaje ? `<p style="margin:0;color:#555;white-space:pre-wrap;">${escapeHtml(mensaje)}</p>` : ''}
        </div>
        <p style="margin:0 0 24px;">
          <a href="${escapeHtml(liga)}"
             style="display:inline-block;background:#CC0000;color:#fff;text-decoration:none;
                    padding:11px 22px;border-radius:30px;font-weight:700;">Verlo en la plataforma</a>
        </p>
        <p style="margin:0;color:#999;font-size:12px;">
          Te llega porque tienes cuenta en el portal de KW Premier.
        </p>
      </div>`

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [perfil.email],
        subject: titulo,
        html,
      }),
    })

    if (!resendResp.ok) {
      const errText = await resendResp.text()
      return respond({ error: 'Resend rechazó el envío: ' + errText }, 502)
    }

    return respond({ ok: true, enviado_a: perfil.email })
  } catch (err) {
    return respond({ error: (err as Error).message || 'Error inesperado' }, 500)
  }
})
