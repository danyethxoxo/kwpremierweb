// Edge Function: avisar-prospecto
//
// Manda por correo el aviso de un prospecto nuevo. La dispara sola la
// base de datos (ver 029_correo_prospecto.sql): cada vez que alguien
// deja sus datos en un perfil público, se llama a esta función con el
// registro recién insertado.
//
// El aviso de la campanita ya existía y se queda; esto es aparte, para
// que el asesor se entere aunque no tenga el portal abierto.
//
// ─────────────────────────────────────────────────────────────
// VARIABLES DE ENTORNO (Project Settings > Edge Functions > Secrets)
// ─────────────────────────────────────────────────────────────
//   SERVICE_ROLE_KEY   - ya la usan las otras funciones del proyecto
//   RESEND_API_KEY     - la llave de Resend (resend.com), quien manda el correo
//   CORREO_REMITENTE   - de dónde sale, p. ej. "KW Premier <avisos@tudominio.com>"
//                        Tiene que ser de un dominio verificado en Resend.
//   CORREO_COPIA       - opcional, para que le llegue copia a la oficina
//   SYNC_SECRET        - la misma que ya se usa; autoriza la llamada
//
// Se crea vía Supabase Dashboard > Edge Functions > Create function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const CORREO_REMITENTE = Deno.env.get('CORREO_REMITENTE') || 'KW Premier <onboarding@resend.dev>'
const CORREO_COPIA = Deno.env.get('CORREO_COPIA')
const SYNC_SECRET = Deno.env.get('SYNC_SECRET')

const SITIO = 'https://danyethxoxo.github.io/kwpremierweb'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function escapar(t: unknown): string {
  return String(t ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Un solo bloque de HTML, con estilos en línea: los clientes de correo
// ignoran las hojas de estilo y muchos ni siquiera cargan imágenes.
function armarCorreo(p: Record<string, unknown>, nombreAsesor: string) {
  const nombre = escapar(p.nombre)
  const tel = p.telefono ? escapar(p.telefono) : null
  const correo = p.correo ? escapar(p.correo) : null
  const mensaje = p.mensaje ? escapar(p.mensaje) : null
  const soloDigitos = String(p.telefono ?? '').replace(/\D/g, '')
  const wa = soloDigitos
    ? 'https://wa.me/' + (soloDigitos.length === 10 ? '52' + soloDigitos : soloDigitos)
    : null

  const fila = (etiqueta: string, valor: string, enlace?: string) =>
    `<tr>
       <td style="padding:6px 0;color:#8a8a88;font-size:13px;width:90px;">${etiqueta}</td>
       <td style="padding:6px 0;font-size:15px;font-weight:600;color:#1a1a1a;">
         ${enlace ? `<a href="${enlace}" style="color:#CC0000;text-decoration:none;">${valor}</a>` : valor}
       </td>
     </tr>`

  const html = `
<div style="background:#f2f2f1;padding:28px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <div style="background:#CC0000;padding:22px 26px;">
      <div style="color:#ffffff;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;opacity:0.85;">KW Premier</div>
      <div style="color:#ffffff;font-size:21px;font-weight:800;margin-top:4px;">Tienes un prospecto nuevo</div>
    </div>
    <div style="padding:26px;">
      <p style="margin:0 0 18px;font-size:15px;color:#444;line-height:1.6;">
        ${escapar(nombreAsesor)}, alguien dejó sus datos en tu perfil público:
      </p>
      <table style="width:100%;border-collapse:collapse;">
        ${fila('Nombre', nombre)}
        ${tel ? fila('Teléfono', tel, 'tel:' + tel) : ''}
        ${correo ? fila('Correo', correo, 'mailto:' + correo) : ''}
      </table>
      ${mensaje ? `
      <div style="margin-top:18px;background:#fafafa;border-radius:10px;padding:14px 16px;">
        <div style="font-size:12px;color:#8a8a88;margin-bottom:5px;">Qué está buscando</div>
        <div style="font-size:14.5px;color:#333;line-height:1.6;white-space:pre-line;">${mensaje}</div>
      </div>` : ''}
      <div style="margin-top:24px;">
        ${wa ? `<a href="${wa}" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;border-radius:30px;margin:0 8px 8px 0;">Escribirle por WhatsApp</a>` : ''}
        <a href="${SITIO}/hub/prospectos.html" style="display:inline-block;background:#ffffff;color:#333;text-decoration:none;font-size:14px;font-weight:700;padding:11px 21px;border-radius:30px;border:1.5px solid #e3e3e1;margin:0 8px 8px 0;">Ver mis prospectos</a>
      </div>
      <p style="margin:22px 0 0;font-size:12px;color:#a0a09e;line-height:1.6;">
        Entre más rápido le contestes, más probable es que siga contigo.
        Este aviso también aparece en la campanita del portal.
      </p>
    </div>
  </div>
</div>`

  const texto = [
    'Tienes un prospecto nuevo en KW Premier.',
    '',
    'Nombre: ' + String(p.nombre ?? ''),
    p.telefono ? 'Teléfono: ' + p.telefono : null,
    p.correo ? 'Correo: ' + p.correo : null,
    p.mensaje ? '\nQué está buscando:\n' + p.mensaje : null,
    '',
    'Ver todos: ' + SITIO + '/hub/prospectos.html',
  ].filter(Boolean).join('\n')

  return { html, texto }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respond({ error: 'Método no permitido' }, 405)

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return respond({ error: 'Configuración del servidor incompleta.' }, 500)
    }
    // La llama la base de datos, no el navegador: se autoriza con el
    // mismo secreto que ya usa la sincronización.
    if (!SYNC_SECRET || req.headers.get('x-sync-secret') !== SYNC_SECRET) {
      return respond({ error: 'No autorizado' }, 401)
    }

    const cuerpo = await req.json().catch(() => null)
    const p = (cuerpo && (cuerpo.record ?? cuerpo)) as Record<string, unknown> | null
    if (!p || !p.asesor_id) return respond({ error: 'Falta el prospecto.' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: asesor } = await admin
      .from('profiles')
      .select('nombre, apellido, email')
      .eq('id', p.asesor_id)
      .single()

    if (!asesor?.email) {
      return respond({ ok: false, aviso: 'El asesor no tiene correo registrado.' })
    }
    if (!RESEND_API_KEY) {
      // Sin llave no se puede mandar, pero no es motivo para marcar el
      // prospecto como fallido: ya quedó guardado y avisado en la campanita.
      return respond({ ok: false, aviso: 'Falta RESEND_API_KEY; no se mandó el correo.' })
    }

    const nombreAsesor = String(asesor.nombre ?? '').trim() || 'Hola'
    const { html, texto } = armarCorreo(p, nombreAsesor)

    const envio = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: CORREO_REMITENTE,
        to: [asesor.email],
        ...(CORREO_COPIA ? { bcc: [CORREO_COPIA] } : {}),
        ...(p.correo ? { reply_to: String(p.correo) } : {}),
        subject: 'Nuevo prospecto: ' + String(p.nombre ?? ''),
        html,
        text: texto,
      }),
    })

    if (!envio.ok) {
      const detalle = (await envio.text()).slice(0, 300)
      return respond({ ok: false, error: 'Resend respondió ' + envio.status, detalle }, 502)
    }

    return respond({ ok: true, enviado_a: asesor.email })
  } catch (err) {
    return respond({ error: (err as Error).message || 'Error inesperado' }, 500)
  }
})
