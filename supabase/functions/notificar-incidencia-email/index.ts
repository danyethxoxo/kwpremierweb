// Edge Function: notificar-incidencia-email
// Envía un correo a los perfiles con puesto = 'Technology Director'
// cuando alguien reporta una incidencia nueva (hub/tickets.html la llama
// justo después de insertar en la tabla `incidencias`). Las notificaciones
// dentro de la plataforma (campanita) ya se manejan aparte, vía triggers
// en supabase/sql/013_notificaciones.sql — esta función solo cubre el
// correo adicional al Director de Tecnología.
//
// Requiere configurar, en Project Settings > Edge Functions > Secrets:
//   RESEND_API_KEY   — llave de una cuenta en https://resend.com (tiene
//                       plan gratuito). Sin esta variable, la función no
//                       manda el correo pero tampoco rompe el flujo de
//                       reportar incidencias (responde ok:false con aviso).
//   EMAIL_FROM        — opcional. Remitente a usar una vez que se verifique
//                       un dominio propio en Resend, ej.
//                       'KW Premier <notificaciones@tudominio.com>'.
//                       Si no se configura, usa el remitente de pruebas
//                       de Resend (onboarding@resend.dev), que solo llega
//                       a la cuenta con la que creaste el API key.
//
// Se crea vía Supabase Dashboard > Edge Functions > Create function,
// pegando este código.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'KW Premier <onboarding@resend.dev>'
const SITE_TICKETS_URL = 'https://danyethxoxo.github.io/kwpremierweb/hub/tickets.html'

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

function escapeHtml(str: string) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string))
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
    const { data: callerData, error: callerError } = await admin.auth.getUser(token)
    if (callerError || !callerData?.user) return respond({ error: 'Sesión inválida' }, 401)

    const body = await req.json().catch(() => ({}))
    const titulo = String(body.titulo || '').slice(0, 200).trim()
    const descripcion = String(body.descripcion || '').slice(0, 2000).trim()
    if (!titulo) return respond({ error: 'Falta el título de la incidencia' }, 400)

    if (!RESEND_API_KEY) {
      // No truena el flujo de reportar incidencias solo porque falte configurar el correo.
      return respond({ ok: false, aviso: 'RESEND_API_KEY no está configurada; no se envió correo.' })
    }

    const { data: reportante } = await admin
      .from('profiles')
      .select('nombre, apellido, email')
      .eq('id', callerData.user.id)
      .single()
    const nombreReportante = [reportante?.nombre, reportante?.apellido].filter(Boolean).join(' ')
      || reportante?.email || 'Alguien'

    const { data: dts, error: dtsError } = await admin
      .from('profiles')
      .select('email')
      .eq('puesto', 'Technology Director')

    if (dtsError) return respond({ error: 'No se pudo buscar al Director de Tecnología: ' + dtsError.message }, 500)

    const destinatarios = (dts || []).map((d) => d.email).filter(Boolean)
    if (!destinatarios.length) {
      return respond({ ok: false, aviso: 'No hay ningún perfil con puesto "Technology Director" configurado.' })
    }

    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;">
        <p><strong>${escapeHtml(nombreReportante)}</strong> reportó una nueva incidencia técnica:</p>
        <p style="font-size:16px;font-weight:700;margin:14px 0 4px;">${escapeHtml(titulo)}</p>
        <p style="white-space:pre-wrap;color:#444;">${escapeHtml(descripcion)}</p>
        <p style="margin-top:20px;">
          <a href="${SITE_TICKETS_URL}" style="color:#CC0000;">Ver en la plataforma</a>
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
        to: destinatarios,
        subject: `Nueva incidencia: ${titulo}`,
        html,
      }),
    })

    if (!resendResp.ok) {
      const errText = await resendResp.text()
      return respond({ error: 'Resend rechazó el envío: ' + errText }, 502)
    }

    return respond({ ok: true, enviado_a: destinatarios.length })
  } catch (err) {
    return respond({ error: (err as Error).message || 'Error inesperado' }, 500)
  }
})
