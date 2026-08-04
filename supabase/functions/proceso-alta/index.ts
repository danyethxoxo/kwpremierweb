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
// Google a veces contesta 500 "internal_failure" sin más, y a los pocos
// segundos funciona igual: por eso se reintenta en vez de tumbar toda la
// pantalla. Un 400/401 sí es configuración mal puesta (token revocado,
// client_secret cambiado) y ahí reintentar no arregla nada.
async function getAccessToken(refreshToken: string): Promise<string> {
  let ultimoError = ''
  for (let intento = 0; intento < 3; intento++) {
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
    if (res.ok) return (await res.json()).access_token as string

    ultimoError = `${res.status} ${await res.text()}`
    if (res.status < 500) break
    await new Promise((r) => setTimeout(r, 500 * (intento + 1)))
  }
  throw new Error(`No se pudo renovar el token de Google: ${ultimoError}`)
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
// fecha de la People API. El a\u00F1o es opcional: si la celda solo trae d\u00EDa
// y mes, el cumplea\u00F1os igual se guarda (sin a\u00F1o) en vez de descartarse.
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

// Los tres "quién ya está" se piden completos una sola vez (no por
// persona) y se comparan en memoria: así "verificar" cuesta 3 llamadas
// a Google sin importar cuánta gente haya en la hoja, y agregarContacto
// reusa el mismo listado para no crear un contacto duplicado.

async function listarContactos(token: string): Promise<Set<string>> {
  const correos = new Set<string>()
  let pageToken: string | undefined
  do {
    const url = new URL('https://people.googleapis.com/v1/people/me/connections')
    url.searchParams.set('personFields', 'emailAddresses')
    url.searchParams.set('pageSize', '1000')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`No se pudo revisar los contactos existentes: ${res.status} ${await res.text()}`)
    const data = await res.json()

    for (const p of (data.connections || []) as { emailAddresses?: { value?: string }[] }[]) {
      for (const e of p.emailAddresses || []) {
        if (e.value) correos.add(String(e.value).toLowerCase())
      }
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return correos
}

async function listarPermisosDrive(token: string): Promise<Set<string>> {
  const correos = new Set<string>()
  if (!ALTA_DRIVE_FOLDER_ID) return correos
  let pageToken: string | undefined
  do {
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ALTA_DRIVE_FOLDER_ID)}/permissions`)
    url.searchParams.set('fields', 'nextPageToken, permissions(emailAddress)')
    url.searchParams.set('supportsAllDrives', 'true')
    url.searchParams.set('pageSize', '100')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`No se pudo revisar los permisos de Drive: ${res.status} ${await res.text()}`)
    const data = await res.json()

    for (const p of (data.permissions || []) as { emailAddress?: string }[]) {
      if (p.emailAddress) correos.add(String(p.emailAddress).toLowerCase())
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return correos
}

async function listarAclCalendario(token: string): Promise<Set<string>> {
  const correos = new Set<string>()
  if (!GOOGLE_CALENDAR_ID) return correos
  let pageToken: string | undefined
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/acl`)
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`No se pudo revisar el calendario: ${res.status} ${await res.text()}`)
    const data = await res.json()

    for (const r of (data.items || []) as { scope?: { type?: string; value?: string } }[]) {
      if (r.scope?.type === 'user' && r.scope.value) correos.add(String(r.scope.value).toLowerCase())
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return correos
}

async function agregarContacto(
  token: string,
  persona: { nombre: string; correo: string; telefono: string; cumpleanos?: string },
  contactosExistentes?: Set<string>,
) {
  const contactos = contactosExistentes ?? await listarContactos(token)
  if (contactos.has(persona.correo.toLowerCase())) {
    return 'Ya existía en Contactos, no se creó de nuevo'
  }

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

// Compara contra lo que ya se sabe de Google (los tres Set de
// listarContactos/Drive/Calendario, pedidos una sola vez desde afuera)
// y solo llama a la API del paso que de verdad falta. Lo usan tanto
// "corregir" (una persona) como "corregir_todos" (todas las pendientes).
async function corregirPersona(
  token: string,
  persona: { nombre: string; correo: string; telefono: string; cumpleanos?: string },
  contactos: Set<string>,
  drive: Set<string>,
  calendario: Set<string>,
) {
  const c = persona.correo.toLowerCase()
  const resultados = []

  resultados.push(contactos.has(c)
    ? { paso: 'contactos_dani', ok: true, detalle: 'Ya estaba en Contactos' }
    : await intentar('contactos_dani', () => agregarContacto(token, persona, contactos)))

  resultados.push(drive.has(c)
    ? { paso: 'drive', ok: true, detalle: 'Ya tenía acceso a Drive' }
    : await intentar('drive', () => compartirCarpeta(token, persona.correo)))

  resultados.push(calendario.has(c)
    ? { paso: 'calendario', ok: true, detalle: 'Ya tenía acceso al calendario' }
    : await intentar('calendario', () => darAccesoCalendario(token, persona.correo)))

  return resultados
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

    // ── Marcar manual: para quienes ya se dieron de alta antes de este
    // proceso (o por fuera de él). No toca las APIs de Google — solo
    // asienta que ya están, para no duplicar el contacto ni reenviarle a
    // alguien que ya tiene acceso los avisos de "se compartió contigo".
    if (accion === 'marcar_manual') {
      const personas = await leerHoja(tokenPrincipal)

      const { data: yaHechas } = await admin
        .from('altas_procesadas')
        .select('correo, completo')

      const completos = new Set<string>()
      for (const a of yaHechas || []) {
        if (a.completo) completos.add(String(a.correo).toLowerCase())
      }

      const pendientes = personas.filter((p) => !completos.has(p.correo.toLowerCase()))
      if (!pendientes.length) return respond({ ok: true, marcados: 0 })

      const pasosManual = {
        contactos_dani: { ok: true, detalle: 'Marcado manualmente (ya estaba dado de alta antes de este proceso)' },
        drive: { ok: true, detalle: 'Marcado manualmente' },
        calendario: { ok: true, detalle: 'Marcado manualmente' },
      }

      const { error: errGuardar } = await admin.from('altas_procesadas').insert(
        pendientes.map((p) => ({
          correo: p.correo, nombre: p.nombre || null, telefono: p.telefono || null,
          pasos: pasosManual, completo: true, procesado_por: quien.user.id,
        }))
      )
      if (errGuardar) return respond({ error: 'No se pudo guardar: ' + errGuardar.message }, 500)

      return respond({ ok: true, marcados: pendientes.length })
    }

    // ── Verificar: revisa en Google (no en la base de datos) quién ya
    // está en cada una de las tres plataformas, para poder comparar
    // contra lo que dice el sistema. No cambia nada, solo informa.
    if (accion === 'verificar') {
      const personas = await leerHoja(tokenPrincipal)

      const [contactos, drive, calendario] = await Promise.all([
        listarContactos(tokenPrincipal),
        listarPermisosDrive(tokenPrincipal),
        listarAclCalendario(tokenPrincipal),
      ])

      const { data: yaHechas } = await admin
        .from('altas_procesadas')
        .select('correo, completo')

      const completosBD = new Set<string>()
      for (const a of yaHechas || []) {
        if (a.completo) completosBD.add(String(a.correo).toLowerCase())
      }

      return respond({
        personas: personas.map((p) => {
          const correo = p.correo.toLowerCase()
          return {
            correo: p.correo,
            nombre: p.nombre,
            contactos: contactos.has(correo),
            drive: drive.has(correo),
            calendario: calendario.has(correo),
            enSistema: completosBD.has(correo),
          }
        }),
      })
    }

    // ── Corregir: a una sola persona le completa nada más el acceso que
    // le falta (según lo que hay de verdad en Google), sin repetir lo
    // que ya tiene.
    if (accion === 'corregir') {
      const correo = limpiarCorreo(body.correo)
      if (!correo) return respond({ error: 'Falta el correo de la persona.' }, 400)

      const personas = await leerHoja(tokenPrincipal)
      const persona = personas.find((p) => p.correo.toLowerCase() === correo.toLowerCase())
      if (!persona) return respond({ error: 'No se encontró a esa persona en la hoja.' }, 404)

      const [contactos, drive, calendario] = await Promise.all([
        listarContactos(tokenPrincipal),
        listarPermisosDrive(tokenPrincipal),
        listarAclCalendario(tokenPrincipal),
      ])

      const resultados = await corregirPersona(tokenPrincipal, persona, contactos, drive, calendario)
      const completo = resultados.every((r) => r.ok)
      const pasos: Record<string, unknown> = {}
      for (const r of resultados) pasos[r.paso] = { ok: r.ok, detalle: r.detalle }

      const { error: errGuardar } = await admin.from('altas_procesadas').insert({
        correo: persona.correo, nombre: persona.nombre || null, telefono: persona.telefono || null,
        pasos, completo, procesado_por: quien.user.id,
      })
      if (errGuardar) {
        return respond({ ok: completo, resultados, aviso: 'No se pudo guardar el registro: ' + errGuardar.message })
      }

      return respond({ ok: completo, resultados })
    }

    // ── Corregir todos: igual que "corregir" pero para cada persona de
    // la hoja a la que le falte algo. Los tres listados de Google se
    // piden una sola vez y se reusan para todos, no uno por persona.
    if (accion === 'corregir_todos') {
      const personas = await leerHoja(tokenPrincipal)

      const [contactos, drive, calendario] = await Promise.all([
        listarContactos(tokenPrincipal),
        listarPermisosDrive(tokenPrincipal),
        listarAclCalendario(tokenPrincipal),
      ])

      const faltantes = personas.filter((p) => {
        const c = p.correo.toLowerCase()
        return !contactos.has(c) || !drive.has(c) || !calendario.has(c)
      })

      const fallas: { correo: string; paso: string; detalle: string }[] = []

      for (const persona of faltantes) {
        const resultados = await corregirPersona(tokenPrincipal, persona, contactos, drive, calendario)
        const completo = resultados.every((r) => r.ok)
        const pasos: Record<string, unknown> = {}
        for (const r of resultados) {
          pasos[r.paso] = { ok: r.ok, detalle: r.detalle }
          if (!r.ok) fallas.push({ correo: persona.correo, paso: r.paso, detalle: r.detalle })
        }

        // Si se acaba de crear el contacto, se anota aquí mismo para que
        // a la siguiente persona de esta misma corrida no la vuelva a
        // revisar contra un listado ya desactualizado.
        if (resultados[0]?.ok) contactos.add(persona.correo.toLowerCase())

        await admin.from('altas_procesadas').insert({
          correo: persona.correo, nombre: persona.nombre || null, telefono: persona.telefono || null,
          pasos, completo, procesado_por: quien.user.id,
        })
      }

      return respond({ ok: fallas.length === 0, corregidos: faltantes.length, fallas })
    }

    return respond({ error: 'Acción no reconocida.' }, 400)
  } catch (err) {
    return respond({ error: (err as Error).message || 'Error inesperado' }, 500)
  }
})
