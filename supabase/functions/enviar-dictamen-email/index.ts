import { prepararCorreoUtf8 } from '../_shared/email-utf8.ts'
import { correoDictamen } from '../_shared/dictamen-email.ts'
import { destinatariosDictamenLiderazgo } from '../_shared/dictamen-destinatarios.ts'
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
const EMAIL_FROM = Deno.env.get('DICTAMEN_EMAIL_FROM') || 'KW Premier <dictamenes@kwpremieroficial.com>'
const MAX_PDF_BYTES = 7 * 1024 * 1024
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RECIPIENTES_MANUALES = [
  'fernanda.pacheco@kwmexico.mx',
  'alberto.velazquez@kwpremier.com.mx',
]

function cors(_req: Request) { return {} }

function response(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
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
      .select('id, folio, inmueble, asesor_id, estado, archivado_at')
      .eq('id', body.dictamen_id).maybeSingle()
    if (dictamenError || !dictamen || dictamen.archivado_at) {
      return response(req, { error: 'No se encontró un dictamen activo para enviar.' }, 404)
    }

    const modo = body.destinatario || 'todos'
    if (!['asesor', 'mca', 'mcaa', 'todos', 'yo', 'otro'].includes(modo)) {
      return response(req, { error: 'Destinatario inválido.' }, 400)
    }
    let asesorAsignado: { nombre: string; correo: string } | null = null
    if (dictamen.asesor_id) {
      const resultado = await admin.from('dictamen_asesores').select('nombre, correo')
        .eq('id', dictamen.asesor_id).maybeSingle()
      asesorAsignado = resultado.data
    }
    const destino = String(asesorAsignado?.correo || '').trim().toLowerCase()
    if (['asesor', 'todos'].includes(modo) && !EMAIL_RE.test(destino)) {
      return response(req, { error: 'El asesor no tiene un correo válido registrado.' }, 400)
    }
    let liderazgo: string[] = []
    let avisoPC = ''
    if (modo === 'todos') {
      const [personas, baseAsesor] = await Promise.all([
        admin.from('profiles').select('nombre,apellido,email,role,puesto').in('role', ['master', 'admin', 'staff']),
        admin.from('asesores').select('coach_asignado').eq('correo', destino).maybeSingle(),
      ])
      if (personas.error || baseAsesor.error) return response(req, { error: 'No se pudieron resolver los destinatarios de liderazgo.' }, 503)
      const coach = String(baseAsesor.data?.coach_asignado || '')
      const seleccion = destinatariosDictamenLiderazgo(personas.data || [], coach)
      liderazgo = seleccion.correos
      if (!seleccion.pcEncontrado) avisoPC = coach ? 'No se encontró el correo del PC asignado.' : 'El asesor no tiene PC asignado en la base de asesores.'
    }
    const destinatarios = Array.from(new Set((modo === 'asesor' ? [destino]
      : modo === 'mca' ? [RECIPIENTES_MANUALES[0]]
      : modo === 'mcaa' ? [RECIPIENTES_MANUALES[1]]
      : modo === 'yo' ? [identity.user.email || '']
      : modo === 'otro' ? [String(body.correo || '').trim().toLowerCase()]
      : [destino, ...RECIPIENTES_MANUALES, ...liderazgo])))
    if (!destinatarios.length || destinatarios.some((correo) => !EMAIL_RE.test(correo) || correo.length > 254)) {
      return response(req, { error: 'Ingresa un correo válido.' }, 400)
    }
    const direccion = String(dictamen.inmueble || 'sin dirección').trim()
    const asesor = String(asesorAsignado?.nombre || 'Asesor(a)').trim()
    // El asesor recibe su mensaje personal; el equipo recibe la version informativa.
    const grupos = [destinatarios.filter(c => c === destino), destinatarios.filter(c => c !== destino)].filter(g => g.length)
    const avisos: string[] = avisoPC ? [avisoPC] : []
    for (const grupo of grupos) {
      const { asunto, html } = correoDictamen(asesor, direccion, String(dictamen.estado), true, grupo[0] === destino ? 'asesor' : 'liderazgo')
      const envio = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(prepararCorreoUtf8({
          from: EMAIL_FROM,
          to: grupo,
          subject: asunto,
          html,
          attachments: [
            { filename: fileName(body.nombre_archivo_solo_datos), content: pdfSoloDatos },
            { filename: fileName(body.nombre_archivo_con_correcciones), content: pdfConCorrecciones },
          ],
        })),
      })
      if (!envio.ok) {
        console.error('Resend rechazó el dictamen', envio.status, await envio.text())
        return response(req, { error: 'El proveedor de correo rechazó el envío.' }, 502)
      }
      try {
        const historial = await admin.from('dictamen_historial').insert({
          dictamen_id: dictamen.id, quien: identity.user.id, que: 'correo_enviado',
          detalle: 'Se envió a ' + grupo.join(', '),
        })
        if (historial.error) throw historial.error
      } catch (errorHistorial) {
        console.error('El correo se envió, pero no se pudo registrar en el historial', errorHistorial)
        avisos.push('El correo se envió, pero no se pudo registrar en el historial.')
      }
    }
    return response(req, { ok: true, enviado_a: destinatarios, ...(avisos.length ? { aviso: avisos.join(' ') } : {}) })
  } catch (error) {
    console.error(error)
    return response(req, { error: 'No se pudo enviar el dictamen.' }, 500)
  }
})
