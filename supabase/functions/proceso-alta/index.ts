// Edge Function: proceso-alta
//
// Da de alta a un asesor nuevo en las plataformas de Google, desde el
// Panel, sin tener que entrar a cada una a mano:
//
//   1. Lo agrega a Google Contacts de dani.guerrero@kwmexico.mx
//   2. Le comparte la carpeta de Drive como lector
//   3. Le da acceso de lectura al calendario de KW Premier
//
// Los asesores nuevos se leen de un Google Sheet que se llena a mano;
// esta función lo lee y devuelve las filas para que en la pantalla se
// elija a quién procesar.
//
// Cada paso va por separado a propósito: si uno falla, los demás sí se
// hacen y se reporta cuál falló. Así nunca se queda a medias sin saber
// en qué.
//
// ─────────────────────────────────────────────────────────────
// CÓMO SE PONE A FUNCIONAR (una sola vez)
// ─────────────────────────────────────────────────────────────
// A) En Google Cloud (el mismo proyecto donde ya está el calendario),
//    en "APIs y servicios > Biblioteca", habilitar:
//      Google Sheets API, People API, Google Drive API, Google Calendar API
//
// B) El token que ya existe (GOOGLE_REFRESH_TOKEN) probablemente solo
//    tiene permiso de calendario. Hay que volver a autorizar pidiendo
//    TODOS estos permisos, entrando con dani.guerrero@kwmexico.mx:
//      https://www.googleapis.com/auth/spreadsheets.readonly
//      https://www.googleapis.com/auth/contacts
//      https://www.googleapis.com/auth/drive
//      https://www.googleapis.com/auth/calendar
//    El token que salga de ahí reemplaza a GOOGLE_REFRESH_TOKEN.
//
// C) Project Settings > Edge Functions > Secrets:
//      ALTA_SHEET_ID          el id del Google Sheet (va en su URL,
//                             entre /d/ y /edit)
//      ALTA_SHEET_RANGO       opcional, por defecto 'A1:Z500'
//      ALTA_DRIVE_FOLDER_ID   el id de la carpeta de Drive (va en su
//                             URL, después de /folders/)
//      ALTA_EMAILS            los correos que pueden usar esto,
//                             separados por coma. Ej:
//                             dani.guerrero@kwmexico.mx,tumaster@correo.com
//
// Ya existen y se reusan: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const GOOGLE_REFRESH_TOKEN = Deno.env.get('GOOGLE_REFRESH_TOKEN')!
const GOOGLE_CALENDAR_ID = Deno.env.get('GOOGLE_CALENDAR_ID')

const ALTA_SHEET_ID = Deno.env.get('ALTA_SHEET_ID')
const ALTA_SHEET_RANGO = Deno.env.get('ALTA_SHEET_RANGO') || 'A1:Z500'
const ALTA_DRIVE_FOLDER_ID = Deno.env.get('ALTA_DRIVE_FOLDER_ID')
const ALTA_EMAILS = Deno.env.get('ALTA_EMAILS') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Un token de acceso por cuenta. Se piden al vuelo porque duran una
// hora; guardarlos no vale la pena para lo poco que se usa esto.
async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    throw new Error(`No se pudo renovar el token de Google: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.access_token as string
}

// ── Lectura del Google Sheet ────────────────────────────────
// Las columnas se buscan por su encabezado, no por posición: la hoja se
// llena a mano y mover una columna no debe romper esto.
// La hoja se llena a mano (a veces pegando desde Word o el correo), y
// eso a veces mete caracteres invisibles (espacios de ancho cero, BOM)
// que no se ven pero rompen el correo para las APIs de Google — por
// ejemplo "nombre@‌dominio.mx" truena con "invalidSharingRequest"
// aunque en la hoja se vea perfecto. trim() no los quita porque no
// están en los extremos, así que se limpian de todo el texto.
function limpiarCorreo(s: unknown): string {
  return String(s || '').replace(/[\u200B\u200C\u200D\uFEFF\s]/g, '')
}

// Convierte "DD/MM/AAAA" (o con guiones, o "AAAA-MM-DD") al formato de
// fecha de la People API. El anio es opcional: si la celda solo trae
// dia y mes, el cumpleanos igual se guarda (sin anio) en vez de
// descartarse.
function parseFecha(s: string): { day: number; month: number; year?: number } | null {
  const texto = String(s || '').trim()
  if (!texto) return null
  let m = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) }
  m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  m = texto.match(/^(\d{1,2})[\/\-](\d{1,2})$/)
  if (m) return { day: Number(m[1]), month: Number(m[2]) }
  return null
}

function indiceDe(encabezados: string[], claves: string[]): number {
  const limpio = encabezados.map((h) =>
    String(h || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  )
  for (const clave of claves) {
    const i = limpio.findIndex((h) => h.includes(clave))
    if (i !== -1) return i
  }
  return -1
}

async function leerHoja(token: string) {
  if (!ALTA_SHEET_ID) throw new Error('Falta configurar ALTA_SHEET_ID.')

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ALTA_SHEET_ID)}` +
    `/values/${encodeURIComponent(ALTA_SHEET_RANGO)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`No se pudo leer la hoja: ${res.status} ${await res.text()}`)

  const filas: string[][] = (await res.json()).values || []
  if (!filas.length) return []

  const encabezados = filas[0]
  // "agente" es el nombre real de la persona; "nombre" (si existe aparte)
  // suele ser el nombre comercial, así que "agente" tiene prioridad.
  const iAgente = indiceDe(encabezados, ['agente'])
  const iNombre = indiceDe(encabezados, ['nombre completo', 'nombre'])
  const iApellido = indiceDe(encabezados, ['apellido'])
  const iCorreo = indiceDe(encabezados, ['correo', 'email', 'e-mail', 'mail'])
  const iTelefono = indiceDe(encabezados, ['telefono', 'celular', 'movil', 'whatsapp'])
  const iKwid = indiceDe(encabezados, ['idkw', 'id kw', 'kwid', 'kw id', 'kwuid'])
  const iFechaIngreso = indiceDe(encabezados, ['fecha de ingreso', 'fecha ingreso'])
  const iCumpleanos = indiceDe(encabezados, ['cumpleanos', 'fecha de nacimiento', 'nacimiento', 'birthday'])

  if (iCorreo === -1) {
    throw new Error('La hoja no tiene una columna de correo. Se busca un encabezado que diga "correo", "email" o "mail".')
  }

  return filas.slice(1).map((fila, n) => {
    const nombre = iAgente !== -1 ? String(fila[iAgente] || '').trim() : [
      iNombre !== -1 ? fila[iNombre] : '',
      iApellido !== -1 ? fila[iApellido] : '',
    ].filter(Boolean).join(' ').trim()
    return {
      fila: n + 2, // +2: se salta el encabezado y las filas de Sheets empiezan en 1
      nombre,
      correo: limpiarCorreo(fila[iCorreo]),
      telefono: iTelefono !== -1 ? String(fila[iTelefono] || '').trim() : '',
      kwid: iKwid !== -1 ? String(fila[iKwid] || '').trim() : '',
      fechaIngreso: iFechaIngreso !== -1 ? String(fila[iFechaIngreso] || '').trim() : '',
      cumpleanos: iCumpleanos !== -1 ? String(fila[iCumpleanos] || '').trim() : '',
    }
  }).filter((p) => p.correo)
}

// ── Los pasos del alta ──────────────────────────────────────
// Cada uno devuelve { ok, detalle } y nunca tira: quien los llama junta
// los resultados para poder decir exactamente qué salió y qué no.

async function agregarContacto(
  token: string,
  persona: { nombre: string; correo: string; telefono: string; cumpleanos?: string },
) {
  const partes = persona.nombre.trim().split(/\s+/)
  const cuerpo: Record<string, unknown> = {
    names: [{
      givenName: partes[0] || persona.correo,
      familyName: partes.slice(1).join(' ') || undefined,
    }],
    emailAddresses: [{ value: persona.correo }],
    // Así se identifica de un vistazo en Contacts a quién pertenece
    // cada tarjeta, sin tener que abrir cada una.
    organizations: [{ name: 'KW PREMIER', title: 'Profesional Inmobiliario' }],
  }
  if (persona.telefono) cuerpo.phoneNumbers = [{ value: persona.telefono }]

  const fecha = parseFecha(persona.cumpleanos || '')
  if (fecha) cuerpo.birthdays = [{ date: fecha }]

  const res = await fetch('https://people.googleapis.com/v1/people:createContact', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return 'Contacto creado'
}

async function compartirCarpeta(token: string, correo: string) {
  if (!ALTA_DRIVE_FOLDER_ID) throw new Error('Falta configurar ALTA_DRIVE_FOLDER_ID.')

  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ALTA_DRIVE_FOLDER_ID)}/permissions` +
    `?sendNotificationEmail=true&supportsAllDrives=true`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'user', emailAddress: correo }),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return 'Carpeta compartida como lector'
}

async function darAccesoCalendario(token: string, correo: string) {
  if (!GOOGLE_CALENDAR_ID) throw new Error('Falta configurar GOOGLE_CALENDAR_ID.')

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/acl` +
    `?sendNotifications=true`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', scope: { type: 'user', value: correo } }),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return 'Acceso de lectura al calendario'
}

async function intentar(nombre: string, fn: () => Promise<string>) {
  try {
    return { paso: nombre, ok: true, detalle: await fn() }
  } catch (err) {
    return { paso: nombre, ok: false, detalle: (err as Error).message || 'Error inesperado' }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return respond({ error: 'Método no permitido' }, 405)

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return respond({ error: 'Faltan variables de entorno del proyecto.' }, 500)
    }

    // ── Quién llama ──
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return respond({ error: 'No autenticado' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: quien, error: errQuien } = await admin.auth.getUser(token)
    if (errQuien || !quien?.user) return respond({ error: 'Sesión inválida' }, 401)

    // El candado de verdad va aquí, no en la pantalla: esconder un botón
    // no impide que alguien llame a la función por su cuenta.
    const permitidos = ALTA_EMAILS.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
    const miCorreo = String(quien.user.email || '').toLowerCase()
    if (!permitidos.length) {
      return respond({ error: 'Falta configurar ALTA_EMAILS en los secretos de la función.' }, 500)
    }
    if (!permitidos.includes(miCorreo)) {
      // Aviso temporal para diagnosticar por qué no coincide (se quita
      // en cuanto quede resuelto): enseña qué correo detectó la función
      // y contra qué lista lo comparó.
      return respond({
        error: 'Esta sección es solo para el equipo de altas.',
        diagnostico: { tu_correo: miCorreo, lista_permitidos: permitidos },
      }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const accion = String(body.accion || 'listar')

    const tokenPrincipal = await getAccessToken(GOOGLE_REFRESH_TOKEN)

    // ── Listar: lo que hay en la hoja + lo que ya se procesó ──
    if (accion === 'listar') {
      const personas = await leerHoja(tokenPrincipal)

      const { data: yaHechas } = await admin
        .from('altas_procesadas')
        .select('correo, completo, pasos, created_at')
        .order('created_at', { ascending: false })

      const porCorreo = new Map<string, unknown>()
      for (const a of yaHechas || []) {
        const k = String(a.correo).toLowerCase()
        if (!porCorreo.has(k)) porCorreo.set(k, a) // la más reciente
      }

      return respond({
        personas: personas.map((p) => ({ ...p, alta: porCorreo.get(p.correo.toLowerCase()) || null })),
      })
    }

    // ── Procesar: dar de alta a una persona ──
    if (accion === 'procesar') {
      const correo = limpiarCorreo(body.correo)
      const nombre = String(body.nombre || '').trim()
      const telefono = String(body.telefono || '').trim()
      const cumpleanos = String(body.cumpleanos || '').trim()
      if (!correo) return respond({ error: 'Falta el correo de la persona.' }, 400)

      const persona = { nombre, correo, telefono, cumpleanos }
      const resultados = []

      resultados.push(await intentar('contactos_dani', () =>
        agregarContacto(tokenPrincipal, persona)))

      resultados.push(await intentar('drive', () => compartirCarpeta(tokenPrincipal, correo)))
      resultados.push(await intentar('calendario', () => darAccesoCalendario(tokenPrincipal, correo)))

      const completo = resultados.every((r) => r.ok)
      const pasos: Record<string, unknown> = {}
      for (const r of resultados) pasos[r.paso] = { ok: r.ok, detalle: r.detalle }

      const { error: errGuardar } = await admin.from('altas_procesadas').insert({
        correo, nombre: nombre || null, telefono: telefono || null,
        pasos, completo, procesado_por: quien.user.id,
      })
      if (errGuardar) {
        // Los pasos de Google ya se hicieron; que no se pueda guardar la
        // constancia no debe leerse como que el alta falló.
        return respond({ ok: completo, resultados, aviso: 'No se pudo guardar el registro: ' + errGuardar.message })
      }

      return respond({ ok: completo, resultados })
    }

    return respond({ error: 'Acción no reconocida.' }, 400)
  } catch (err) {
    return respond({ error: (err as Error).message || 'Error inesperado' }, 500)
  }
})
