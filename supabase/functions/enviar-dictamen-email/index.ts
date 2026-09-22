import { secureServe } from '../_shared/security.ts'
// Envía al asesor el PDF del dictamen que acaba de finalizarse.
//
// Secrets requeridos en Supabase:
//   RESEND_API_KEY  clave de envío de Resend
//   EMAIL_FROM      por ejemplo: KW Premier <noreply@kwpremieroficial.com>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'KW Premier <noreply@kwpremieroficial.com>'
const MAX_PDF_BYTES = 7 * 1024 * 1024

function cors(_req: Request) { return {} }

function response(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function escapeHtml(value: unknown) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] as string))
}

function validUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}

function pdfBase64(value: unknown) {
  const base64 = String(value || '').replace(/\s/g, '')
  if (!base64 || base64.length > Math.ceil(MAX_PDF_BYTES * 4 / 3) + 8 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return ''
  try {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    if (bytes.length > MAX_PDF_BYTES || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return ''
    return base64
  } catch {
    return ''
  }
}

function fileName(value: unknown) {
  const name = String(value || '').trim()
  return /^[A-Za-z0-9áéíóúÁÉÍÓÚñÑ._ -]{1,140}\.pdf$/i.test(name) ? name : 'dictamen.pdf'
}

secureServe({ name: 'enviar-dictamen-email', userLimit: 10, maxBytes: 20 * 1024 * 1024 }, async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return response(req, { error: 'Método no permitido.' }, 405)

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !RESEND_API_KEY) {
      return response(req, { error: 'El envío de correo no está configurado.' }, 500)
    }
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return response(req, { error: 'No autenticado.' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: identity, error: identityError } = await admin.auth.getUser(token)
    if (identityError || !identity?.user) return response(req, { error: 'Sesión inválida.' }, 401)

    const { data: perfil, error: profileError } = await admin
      .from('profiles').select('role, puede_dictaminar').eq('id', identity.user.id).single()
    if (profileError || !perfil || !(perfil.puede_dictaminar || ['master', 'admin'].includes(perfil.role))) {
      return response(req, { error: 'No tienes permiso para enviar dictámenes.' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    if (!validUuid(body.dictamen_id)) return response(req, { error: 'Dictamen inválido.' }, 400)
    const pdfSoloDatos = pdfBase64(body.pdf_solo_datos)
    const pdfConCorrecciones = pdfBase64(body.pdf_con_correcciones)
    if (!pdfSoloDatos || !pdfConCorrecciones) {
      return response(req, { error: 'Los dos archivos adjuntos deben ser PDFs válidos de hasta 7 MB.' }, 400)
    }

    // Se consulta la tabla directamente, no la vista de listado: algunos
    // proyectos aún conservan una versión anterior de esa vista sin todos
    // los campos que requiere el envío.
    const { data: dictamen, error: dictamenError } = await admin
      .from('dictamenes')
      .select('id, folio, inmueble, asesor_id, archivado_at')
      .eq('id', body.dictamen_id).maybeSingle()
    if (dictamenError || !dictamen || dictamen.archivado_at) {
      return response(req, { error: 'No se encontró un dictamen activo para enviar.' }, 404)
    }

    if (!dictamen.asesor_id) {
      return response(req, { error: 'El dictamen no tiene una persona asignada.' }, 400)
    }
    const { data: asesorAsignado, error: asesorError } = await admin
      .from('dictamen_asesores').select('nombre, correo').eq('id', dictamen.asesor_id).maybeSingle()
    if (asesorError || !asesorAsignado) {
      return response(req, { error: 'No se encontró la persona asignada al dictamen.' }, 404)
    }

    const destino = String(asesorAsignado.correo || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) {
      return response(req, { error: 'El asesor no tiene un correo válido registrado.' }, 400)
    }
    const direccion = String(dictamen.inmueble || 'sin dirección').trim()
    const asesor = String(asesorAsignado.nombre || 'Asesor(a)').trim()
    const asunto = 'Dictamen de Expediente, ' + direccion

    const envio = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [destino],
        subject: asunto,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.6;max-width:560px">
          <p>Hola ${escapeHtml(asesor)},</p>
          <p>Adjuntamos el dictamen de expediente correspondiente a:</p>
          <p style="font-weight:700;color:#7d0000">${escapeHtml(direccion)}</p>
          <p>Incluye una versión con los datos y otra con las correcciones.</p>
          <p>Saludos,<br>KW Premier</p>
        </div>`,
        attachments: [
          { filename: fileName(body.nombre_archivo_solo_datos), content: pdfSoloDatos },
          { filename: fileName(body.nombre_archivo_con_correcciones), content: pdfConCorrecciones },
        ],
      }),
    })
    if (!envio.ok) {
      console.error('Resend rechazó el dictamen', envio.status, await envio.text())
      return response(req, { error: 'El proveedor de correo rechazó el envío.' }, 502)
    }
    return response(req, { ok: true, enviado_a: destino })
  } catch (error) {
    console.error(error)
    return response(req, { error: 'No se pudo enviar el dictamen.' }, 500)
  }
})
