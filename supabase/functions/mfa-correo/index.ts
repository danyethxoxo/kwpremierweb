// Edge Function: mfa-correo
//
// Verificación en dos pasos por correo: en vez de una app autenticadora
// (Google Authenticator y similares), manda un código de 6 dígitos al
// correo personal de quien entra. Se creó porque el mecanismo con QR
// resultó incómodo: esto no depende de instalar nada.
//
// Cómo funciona, en corto:
//   1. "enviar"    -> genera un código, lo guarda con hash (nunca en
//                     claro) y lo manda por Resend.
//   2. "verificar" -> compara el código; si acierta, marca la cuenta
//                     como "aal2 por las próximas horas" escribiendo
//                     en app_metadata (con la llave de servicio: eso
//                     es justo lo que hace que el cliente no se lo
//                     pueda inventar solo).
//   3. "desactivar"-> apaga el requisito para esa cuenta.
//
// El candado real vive en dos lugares más, no aquí: login.html pide el
// código después de la contraseña, y assets/js/auth-guard.js revisa
// app_metadata en TODAS las páginas protegidas (para que no se pueda
// saltar navegando directo a otra URL).
//
// ─────────────────────────────────────────────────────────────
// CÓMO SE PONE A FUNCIONAR (una sola vez)
// ─────────────────────────────────────────────────────────────
// 1. Edge Functions > Create function, con el nombre `mfa-correo`, y
//    se pega este archivo completo.
// 2. No hace falta ningún secret nuevo: reutiliza RESEND_API_KEY y
//    EMAIL_FROM, que ya están configurados para las notificaciones.
// 3. Correr supabase/sql/069_mfa_correo.sql en el SQL Editor (la
//    tabla donde se guardan los códigos).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'KW Premier <onboarding@resend.dev>'

const VIGENCIA_CODIGO_MIN = 10
const VIGENCIA_SESION_HORAS = 4 // igual que el cierre por inactividad del sitio
const INTENTOS_MAXIMOS = 5
const ESPERA_ENTRE_ENVIOS_SEG = 30

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
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string))
}

async function sha256(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto)
  const buffer = await crypto.subtle.digest('SHA-256', datos)
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function generarCodigo(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000
  return String(n).padStart(6, '0')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respond({ error: 'Método no permitido' }, 405)

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return respond({ error: 'Configuración del servidor incompleta (faltan variables de entorno).' }, 500)
    }

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return respond({ error: 'No autenticado' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: quien, error: errQuien } = await admin.auth.getUser(token)
    if (errQuien || !quien?.user) return respond({ error: 'Sesión inválida' }, 401)
    const userId = quien.user.id
    const correo = quien.user.email
    if (!correo) return respond({ error: 'Tu cuenta no tiene correo registrado.' }, 400)

    const body = await req.json().catch(() => ({}))
    const accion = String(body.accion || '')

    // ── Mandar un código nuevo ──────────────────────────────────
    if (accion === 'enviar') {
      const { data: ultimo } = await admin
        .from('mfa_correo_codigos')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (ultimo?.created_at) {
        const segundos = (Date.now() - new Date(ultimo.created_at).getTime()) / 1000
        if (segundos < ESPERA_ENTRE_ENVIOS_SEG) {
          return respond({ error: `Espera ${Math.ceil(ESPERA_ENTRE_ENVIOS_SEG - segundos)} segundos antes de pedir otro código.` }, 429)
        }
      }

      const codigo = generarCodigo()
      const expiraEn = new Date(Date.now() + VIGENCIA_CODIGO_MIN * 60 * 1000).toISOString()

      const { error: errInsert } = await admin.from('mfa_correo_codigos').insert({
        user_id: userId,
        codigo_hash: await sha256(codigo),
        expira_en: expiraEn,
      })
      if (errInsert) return respond({ error: 'No se pudo generar el código.' }, 500)

      if (!RESEND_API_KEY) {
        // Sin esto configurado no hay manera de mandar el código: mejor
        // decirlo claro que fallar en silencio y dejar a alguien afuera.
        return respond({ error: 'El envío de correos no está configurado (RESEND_API_KEY).' }, 500)
      }

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55;max-width:480px;">
          <p style="margin:0 0 16px;">Tu código para entrar a KW Premier es:</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 16px;color:#8a0000;">${codigo}</p>
          <p style="margin:0 0 20px;color:#555;">Vence en ${VIGENCIA_CODIGO_MIN} minutos. Si no fuiste tú, ignora este correo.</p>
          <p style="margin:0;color:#999;font-size:12px;">Te llega porque tu cuenta tiene activada la verificación en dos pasos.</p>
        </div>`

      const resendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [correo],
          subject: 'Tu código de verificación',
          html,
        }),
      })
      if (!resendResp.ok) {
        const errText = await resendResp.text()
        return respond({ error: 'No se pudo enviar el correo: ' + errText }, 502)
      }

      return respond({ ok: true, enviado_a: correo.replace(/(.{2}).+(@.+)/, '$1***$2') })
    }

    // ── Verificar el código ─────────────────────────────────────
    if (accion === 'verificar') {
      const codigo = String(body.codigo || '').trim()
      if (!/^\d{6}$/.test(codigo)) return respond({ error: 'Código inválido.' }, 400)

      const { data: fila, error: errFila } = await admin
        .from('mfa_correo_codigos')
        .select('id, codigo_hash, expira_en, intentos, usado')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (errFila || !fila) return respond({ error: 'Pide un código nuevo.' }, 400)
      if (fila.usado) return respond({ error: 'Ese código ya se usó. Pide uno nuevo.' }, 400)
      if (new Date(fila.expira_en).getTime() < Date.now()) return respond({ error: 'El código venció. Pide uno nuevo.' }, 400)
      if (fila.intentos >= INTENTOS_MAXIMOS) {
        await admin.from('mfa_correo_codigos').update({ usado: true }).eq('id', fila.id)
        return respond({ error: 'Demasiados intentos. Pide un código nuevo.' }, 400)
      }

      const hashRecibido = await sha256(codigo)
      if (hashRecibido !== fila.codigo_hash) {
        await admin.from('mfa_correo_codigos').update({ intentos: fila.intentos + 1 }).eq('id', fila.id)
        return respond({ error: 'Código incorrecto.' }, 400)
      }

      await admin.from('mfa_correo_codigos').update({ usado: true }).eq('id', fila.id)

      // El primer código que se verifica bien también activa el
      // requisito para esa cuenta de aquí en adelante (igual que
      // "escanear el QR" activaba la app autenticadora antes).
      const okHasta = new Date(Date.now() + VIGENCIA_SESION_HORAS * 60 * 60 * 1000).toISOString()
      const { error: errUpdate } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { mfa_correo_activo: true, mfa_correo_ok_hasta: okHasta },
      })
      if (errUpdate) return respond({ error: 'No se pudo confirmar la verificación.' }, 500)

      return respond({ ok: true })
    }

    // ── Desactivar ───────────────────────────────────────────────
    if (accion === 'desactivar') {
      const { error: errUpdate } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { mfa_correo_activo: false, mfa_correo_ok_hasta: null },
      })
      if (errUpdate) return respond({ error: 'No se pudo desactivar.' }, 500)
      return respond({ ok: true })
    }

    return respond({ error: 'Acción no reconocida.' }, 400)
  } catch (err) {
    return respond({ error: (err as Error).message || 'Error inesperado' }, 500)
  }
})
