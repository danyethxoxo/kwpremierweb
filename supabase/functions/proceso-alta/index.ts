// Edge Function: proceso-alta
//
// Da de alta a un asesor nuevo en las plataformas de Google, desde el
// Panel, sin tener que entrar a cada una a mano:
//
//   1. Lo agrega a Google Contacts de dani.guerrero@kwmexico.mx
//   2. Le comparte la carpeta de Drive como lector
//   3. Le da acceso de lectura al calendario de KW Premier
//
// La gente se lee de un Google Sheet que se llena a mano. El libro trae
// una hoja por grupo (asesores activos, bajas, back office, células) y
// esta función las devuelve por separado, para que en la pantalla cada
// grupo sea su propio apartado y se elija a quién procesar. Las hojas se
// reconocen por su NOMBRE, no por su posición dentro del libro.
//
// Cada paso va por separado a propósito: si uno falla, los demás sí se
// hacen y se reporta cuál falló. Así nunca se queda a medias sin saber
// en qué.
//
// Además atiende la pantalla de Documentos del Market Center
// (hub/drive.html): devuelve el árbol de la carpeta de Drive para que
// los asesores la consulten desde el sitio. Eso vive aquí, y no en una
// función aparte, porque ya tiene el token de Google con permiso de
// Drive y la variable de la carpeta - una función nueva sería otro slug
// que configurar sin ganar nada. Ojo: esa acción (`drive_arbol`) la
// puede llamar cualquiera con sesión, no solo el equipo de altas.
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
//      ALTA_SHEET_RANGO       opcional, por defecto 'A1:Z500'. Es el
//                             pedazo de celdas que se lee de CADA hoja;
//                             el nombre de la hoja no va aquí.
//      ALTA_DRIVE_FOLDER_ID   el id de la carpeta de Drive (va en su
//                             URL, después de /folders/)
//      ALTA_EMAILS            opcional. Master y Admin ya pasan por su
//                             rol; esto es para abrirle a alguien que no
//                             sea ninguno de los dos. Correos separados
//                             por coma. Ej:
//                             dani.guerrero@kwmexico.mx,otro@correo.com
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
// que no se ven pero rompen el correo para las APIs de Google - por
// ejemplo "nombre@‌dominio.mx" truena con "invalidSharingRequest"
// aunque en la hoja se vea perfecto. trim() no los quita porque no
// están en los extremos, así que se limpian de todo el texto.
function limpiarCorreo(s: unknown): string {
  return String(s || '').replace(/[\u200B\u200C\u200D\uFEFF\s]/g, '')
}

// Sin acentos y en minúsculas, para poder comparar nombres de hoja y de
// columna sin importar cómo los haya escrito quien llena el libro.
function normalizar(s: unknown): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036F]/g, '').trim()
}

// Convierte "DD/MM/AAAA" (o con guiones, o "AAAA-MM-DD") al formato de
// fecha de la People API. El año es opcional: si la celda solo trae día
// y mes, el cumpleaños igual se guarda (sin año) en vez de descartarse.
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

// Igual que parseFecha pero para una columna `date` de Postgres: regresa
// "AAAA-MM-DD" o null. Sin año no sirve (una fecha de ingreso a medias no
// se puede guardar), así que en ese caso se descarta.
function aFecha(s: string): string | null {
  const f = parseFecha(s)
  if (!f || !f.year) return null
  if (f.month < 1 || f.month > 12 || f.day < 1 || f.day > 31) return null
  return `${String(f.year).padStart(4, '0')}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`
}

function indiceDe(encabezados: string[], claves: string[]): number {
  const limpio = encabezados.map(normalizar)
  for (const clave of claves) {
    const i = limpio.findIndex((h) => h.includes(clave))
    if (i !== -1) return i
  }
  return -1
}

// ── Las hojas del libro ─────────────────────────────────────
// El libro del alta trae una hoja por grupo de gente: los asesores
// activos, los que ya causaron baja, back office y las células.
//
// Antes aquí se leía SIEMPRE la primera hoja del libro, sin mirar cómo
// se llamaba. Eso era una bomba de tiempo: el día que alguien
// reacomodara las pestañas del libro, el padrón del ABC se habría
// llenado con la hoja de bajas y habría dado por baja a medio Market
// Center sin que nada se viera raro. Ahora la hoja se busca por su
// nombre, y el orden dentro del libro deja de importar.
//
// El nombre se compara sin acentos ni mayúsculas y por "contiene", que
// es lo único que aguanta que la misma hoja se llame "ACTIVOS",
// "Asesores activos" o "Activos 2026" según quién la haya nombrado.
type Grupo = { clave: string; titulo: string; palabras: string[] }

const GRUPOS: Grupo[] = [
  { clave: 'activos', titulo: 'Asesores Activos', palabras: ['activo'] },
  { clave: 'bajas', titulo: 'Asesores de Baja', palabras: ['baja'] },
  { clave: 'back_office', titulo: 'Back Office', palabras: ['back office', 'backoffice', 'back'] },
  { clave: 'celulas', titulo: 'Células', palabras: ['celula'] },
]

// Una hoja que cae en dos grupos a la vez (una llamada "Células y Back
// Office", por ejemplo) no se puede repartir sola, y mandarla entera al
// primero que coincida sería etiquetar mal a la mitad de la gente. Esas
// se quedan como su propio apartado, con el nombre que traigan.
function clasificarHoja(titulo: string): Grupo | null {
  const t = normalizar(titulo)
  const posibles = GRUPOS.filter((g) => g.palabras.some((p) => t.includes(p)))
  return posibles.length === 1 ? posibles[0] : null
}

type HojaDelLibro = { hoja: string; clave: string; titulo: string }

async function detectarHojas(token: string): Promise<HojaDelLibro[]> {
  if (!ALTA_SHEET_ID) throw new Error('Falta configurar ALTA_SHEET_ID.')

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ALTA_SHEET_ID)}` +
    `?fields=sheets.properties(title,hidden)`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`No se pudieron leer las hojas del libro: ${res.status} ${await res.text()}`)

  const hojas: HojaDelLibro[] = []
  for (const s of ((await res.json()).sheets || []) as { properties?: { title?: string; hidden?: boolean } }[]) {
    const titulo = String(s.properties?.title || '').trim()
    // Las hojas escondidas son cuentas y borradores de quien llena el
    // libro, no gente a la que haya que dar de alta.
    if (!titulo || s.properties?.hidden) continue
    const grupo = clasificarHoja(titulo)
    hojas.push({
      hoja: titulo,
      clave: grupo ? grupo.clave : 'hoja_' + (normalizar(titulo).replace(/[^a-z0-9]+/g, '_') || String(hojas.length)),
      titulo: grupo ? grupo.titulo : titulo,
    })
  }

  // En el orden en que se enseñan en la pantalla (activos primero); lo
  // que no cayó en ningún grupo va al final, como venga en el libro.
  const orden = (h: HojaDelLibro) => {
    const i = GRUPOS.findIndex((g) => g.clave === h.clave)
    return i === -1 ? GRUPOS.length : i
  }
  return hojas.sort((a, b) => orden(a) - orden(b))
}

// ALTA_SHEET_RANGO puede traer todavía el nombre de una hoja pegado
// ("Hoja1!A1:Z500"), de cuando esto leía una sola: de ahí se usa nada
// más el pedazo de celdas, y la hoja la pone quien llama.
const RANGO_CELDAS = ALTA_SHEET_RANGO.includes('!')
  ? ALTA_SHEET_RANGO.slice(ALTA_SHEET_RANGO.lastIndexOf('!') + 1)
  : ALTA_SHEET_RANGO

// Sin hoja se lee la primera del libro, que es lo que esto hacía antes.
// Las comillas simples son lo que permite nombres con espacios; una
// comilla dentro del nombre se escribe doble.
function rangoDeHoja(hoja: string | null): string {
  return hoja ? `'${hoja.replace(/'/g, "''")}'!${RANGO_CELDAS}` : RANGO_CELDAS
}

// Varias hojas en una sola llamada. La respuesta viene en el mismo orden
// en que se pidieron los rangos, así que se empareja por posición.
async function leerValores(token: string, rangos: string[]): Promise<string[][][]> {
  if (!ALTA_SHEET_ID) throw new Error('Falta configurar ALTA_SHEET_ID.')
  if (!rangos.length) return []

  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ALTA_SHEET_ID)}/values:batchGet`
  )
  for (const r of rangos) url.searchParams.append('ranges', r)

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`No se pudo leer la hoja: ${res.status} ${await res.text()}`)

  const leidos = ((await res.json()).valueRanges || []) as { values?: string[][] }[]
  return rangos.map((_, i) => leidos[i]?.values || [])
}

// ── Una fila de cualquiera de las hojas ─────────────────────
// Las columnas se buscan por su encabezado, no por posición: el libro se
// llena a mano y mover una columna de lugar no debe romper esto. Las
// hojas tampoco traen todas las mismas columnas (la de bajas trae fecha
// de baja, la de células trae célula), así que lo que no esté se queda
// vacío en vez de tumbar la lectura.
type Persona = {
  fila: number
  nombre: string
  correo: string
  telefono: string
  kwid: string
  fechaIngreso: string
  cumpleanos: string
  puesto: string
  celula: string
  fechaBaja: string
}

function parsearPersonas(filas: string[][]): Persona[] {
  if (!filas.length) return []

  const enc = filas[0]
  // "agente" es el nombre real de la persona; "nombre" (si existe aparte)
  // suele ser el nombre comercial, así que "agente" tiene prioridad.
  const iAgente = indiceDe(enc, ['agente'])
  const iNombre = indiceDe(enc, ['nombre completo', 'nombre'])
  const iApellido = indiceDe(enc, ['apellido'])
  const iCorreo = indiceDe(enc, ['correo', 'email', 'e-mail', 'mail'])
  const iTelefono = indiceDe(enc, ['telefono', 'celular', 'movil', 'whatsapp'])
  const iKwid = indiceDe(enc, ['idkw', 'id kw', 'kwid', 'kw id', 'kwuid'])
  const iIngreso = indiceDe(enc, ['fecha de ingreso', 'fecha ingreso'])
  const iCumple = indiceDe(enc, ['cumpleanos', 'fecha de nacimiento', 'nacimiento', 'birthday'])
  const iPuesto = indiceDe(enc, ['puesto', 'cargo'])
  const iCelula = indiceDe(enc, ['celula', 'equipo'])
  const iBaja = indiceDe(enc, ['fecha de baja', 'baja'])

  const dato = (fila: string[], i: number) => (i === -1 ? '' : String(fila[i] || '').trim())

  return filas.slice(1).map((fila, n) => ({
    fila: n + 2, // +2: se salta el encabezado y las filas de Sheets empiezan en 1
    nombre: iAgente !== -1
      ? dato(fila, iAgente)
      : [dato(fila, iNombre), dato(fila, iApellido)].filter(Boolean).join(' '),
    correo: limpiarCorreo(iCorreo === -1 ? '' : fila[iCorreo]),
    telefono: dato(fila, iTelefono),
    kwid: dato(fila, iKwid),
    fechaIngreso: dato(fila, iIngreso),
    cumpleanos: dato(fila, iCumple),
    puesto: dato(fila, iPuesto),
    celula: dato(fila, iCelula),
    fechaBaja: dato(fila, iBaja),
  }))
}

// La hoja de los asesores activos es la que manda para todo lo demás: el
// alta, el padrón del ABC y el catálogo de Dictámenes se arman de ahí.
async function hojaDeActivos(token: string): Promise<string | null> {
  const activos = (await detectarHojas(token)).find((h) => h.clave === 'activos')
  return activos ? activos.hoja : null
}

async function leerHojaActivos(token: string): Promise<string[][]> {
  return (await leerValores(token, [rangoDeHoja(await hojaDeActivos(token))]))[0] || []
}

// Lectura de la hoja de activos para el ABC: solo nombre, KW ID y fecha
// de ingreso - el DT asignado y el avance se administran a mano desde el
// sitio, no vienen de aquí. Lo que se exige aquí es el KW ID y no el
// correo (que es lo que pide leerHoja), y es a propósito: un asesor
// viejo sin correo capturado no debe desaparecer de la sincronización,
// porque desaparecer aquí significa que lo marque como baja por error.
//
// `omitidos`, si se manda, se llena con quien tenía nombre pero le faltó
// el KW ID - así, en vez de desaparecer sin dejar rastro (que es justo
// lo que pasaba antes: alguien nuevo en la hoja, sin KW ID asignado
// todavía, simplemente no aparecía en ningún lado y nadie se enteraba de
// por qué), se puede avisar por nombre.
async function leerHojaABC(token: string, omitidos?: { fila: number; nombre: string; motivo: string }[]) {
  const filas = await leerHojaActivos(token)
  if (!filas.length) return []

  if (indiceDe(filas[0], ['idkw', 'id kw', 'kwid', 'kw id', 'kwuid']) === -1) {
    throw new Error('La hoja no tiene una columna de KW ID. Se busca un encabezado que diga "kwid", "kw id" o similar.')
  }

  const todas = parsearPersonas(filas)
  if (omitidos) {
    for (const p of todas) {
      // Fila realmente vacía (nadie capturó nada todavía): no cuenta
      // como omisión, es solo una fila sin usar.
      if (!p.kwid && p.nombre) omitidos.push({ fila: p.fila, nombre: p.nombre, motivo: 'sin KW ID' })
    }
  }

  return todas.filter((p) => p.kwid)
}

// `omitidos`, si se manda, se llena con quien tenía nombre pero le faltó
// el correo - mismo motivo que en leerHojaABC: alguien recién agregado a
// la hoja sin correo capturado todavía desaparecía de la lista de altas
// sin que nadie se enterara de por qué.
async function leerHoja(token: string, omitidos?: { fila: number; nombre: string; motivo: string }[]) {
  const filas = await leerHojaActivos(token)
  if (!filas.length) return []

  if (indiceDe(filas[0], ['correo', 'email', 'e-mail', 'mail']) === -1) {
    throw new Error('La hoja no tiene una columna de correo. Se busca un encabezado que diga "correo", "email" o "mail".')
  }

  const todas = parsearPersonas(filas)
  if (omitidos) {
    for (const p of todas) {
      if (!p.correo && p.nombre) omitidos.push({ fila: p.fila, nombre: p.nombre, motivo: 'sin correo' })
    }
  }

  return todas.filter((p) => p.correo)
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

// ── Árbol de la carpeta de Drive ────────────────────────────
// Para la pantalla donde los asesores consultan los documentos del
// Market Center. Se devuelve el árbol completo de una vez y la pantalla
// se encarga de navegar y buscar sin volver a preguntar: son pocos
// archivos y así el buscador responde al instante.
//
// Devolver el árbol completo (en vez de recibir "dame esta carpeta")
// también es lo que hace esto seguro: la pantalla nunca puede pedir una
// carpeta arbitraria, porque aquí solo se camina hacia abajo desde
// ALTA_DRIVE_FOLDER_ID. Si se aceptara un id desde afuera, cualquiera
// podría pedir carpetas ajenas - el token de la función ve todo el Drive
// de la cuenta, no solo esta carpeta.
type ElementoDrive = {
  id: string
  nombre: string
  tipo: 'carpeta' | 'archivo'
  padre: string
  mime: string
  link: string
  modificado: string | null
}

// Tope de carpetas a recorrer: una carpeta con miles de subcarpetas
// dejaría la petición colgada. Con este límite la respuesta siempre
// llega; si algún día la carpeta crece de más, se avisa en pantalla.
const MAX_CARPETAS = 600

// Cuántas carpetas se leen al mismo tiempo. Leerlas una por una (esperar
// la respuesta antes de pedir la siguiente) es lo que hacía que una
// carpeta con muchas subcarpetas se quedara corta con el límite de
// arriba: cada carpeta son 200-400ms de ida y vuelta a Google, y en
// serie eso se acumula rápido. En paralelo, un lote de 100 tarda lo
// mismo que una sola. El número es un punto medio a ojo entre "aprovechar
// el paralelismo" y "no verse como un ataque" ante el límite de la API
// de Drive (que es por minuto, no por golpe, así que esto no lo topa).
const LOTE_CONCURRENTE = 10

async function mapConcurrente<T, R>(items: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(items.length)
  let siguiente = 0
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente++
      resultados[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador))
  return resultados
}

async function listarHijos(token: string, carpetaId: string) {
  const items: Record<string, unknown>[] = []
  let pageToken: string | undefined
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files')
    url.searchParams.set('q', `'${carpetaId}' in parents and trashed = false`)
    url.searchParams.set('fields', 'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime)')
    url.searchParams.set('orderBy', 'folder,name')
    url.searchParams.set('pageSize', '1000')
    // Sin estos dos, una carpeta que viva en una unidad compartida
    // devuelve vacío en vez de su contenido.
    url.searchParams.set('supportsAllDrives', 'true')
    url.searchParams.set('includeItemsFromAllDrives', 'true')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`No se pudo leer la carpeta de Drive: ${res.status} ${await res.text()}`)
    const data = await res.json()
    items.push(...(data.files || []))
    pageToken = data.nextPageToken
  } while (pageToken)
  return items
}

async function leerArbolDrive(token: string) {
  if (!ALTA_DRIVE_FOLDER_ID) throw new Error('Falta configurar ALTA_DRIVE_FOLDER_ID.')

  const elementos: ElementoDrive[] = []
  const visitadas = new Set<string>([ALTA_DRIVE_FOLDER_ID])
  let nivel = [ALTA_DRIVE_FOLDER_ID]
  let truncado = false

  // Se lee nivel por nivel (todas las carpetas de la raíz a la vez,
  // luego todas sus subcarpetas a la vez, etc.) en vez de una por una:
  // así el tiempo total depende de qué tan profunda está la carpeta más
  // honda, no de cuántas carpetas hay en total.
  while (nivel.length) {
    const listas = await mapConcurrente(nivel, LOTE_CONCURRENTE, (id) => listarHijos(token, id))
    const siguienteNivel: string[] = []

    nivel.forEach((padreId, i) => {
      for (const f of listas[i]) {
        const esCarpeta = f.mimeType === 'application/vnd.google-apps.folder'
        elementos.push({
          id: String(f.id),
          nombre: String(f.name || 'Sin nombre'),
          tipo: esCarpeta ? 'carpeta' : 'archivo',
          padre: padreId,
          mime: String(f.mimeType || ''),
          link: String(f.webViewLink || ''),
          modificado: f.modifiedTime ? String(f.modifiedTime) : null,
        })
        if (esCarpeta && !visitadas.has(String(f.id))) {
          visitadas.add(String(f.id))
          siguienteNivel.push(String(f.id))
        }
      }
    })

    if (visitadas.size >= MAX_CARPETAS) { truncado = true; break }
    nivel = siguienteNivel
  }

  return { raiz: ALTA_DRIVE_FOLDER_ID, elementos, truncado }
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

    const body = await req.json().catch(() => ({}))
    const accion = String(body.accion || 'listar')

    // Consultar la carpeta de Drive lo hace cualquiera con sesión: esa
    // carpeta ya se le comparte a todo el mundo en el alta, así que ver
    // los nombres de los archivos no enseña nada que no tuvieran. Abrir
    // uno sigue dependiendo de su propio permiso en Drive. Las acciones
    // del alta sí se quedan restringidas.
    const ACCIONES_ABIERTAS = ['drive_arbol']

    // El ABC lo sincroniza el equipo de liderazgo (Master/Admin/Staff),
    // que es quien da las sesiones - no solo los correos del alta.
    const ACCIONES_STAFF = ['abc_sync', 'dictamen_asesores_sync']

    // Las altas las hacen Master y Admin, más quien esté puesto a mano en
    // ALTA_EMAILS. El rol es lo que manda: así, dar de alta a un Admin
    // nuevo en el Panel ya le da acceso, sin que alguien tenga que
    // acordarse de ir a agregarle el correo al secreto de la función. La
    // lista se queda para poder abrirle a alguien que no sea ni una cosa
    // ni la otra.
    const ROLES_ALTA = ['master', 'admin']

    // El candado de verdad va aquí, no en la pantalla: esconder una
    // pestaña no impide que alguien llame a la función por su cuenta.
    if (!ACCIONES_ABIERTAS.includes(accion)) {
      const { data: perfil } = await admin
        .from('profiles').select('role').eq('id', quien.user.id).single()
      const miRol = String(perfil?.role || '')
      const miCorreo = String(quien.user.email || '').toLowerCase()

      if (ACCIONES_STAFF.includes(accion)) {
        if (!['master', 'admin', 'staff'].includes(miRol)) {
          return respond({ error: 'Esta acción es solo para el equipo de liderazgo.' }, 403)
        }
      } else {
        const permitidos = ALTA_EMAILS.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
        if (!ROLES_ALTA.includes(miRol) && !permitidos.includes(miCorreo)) {
          // Aviso temporal para diagnosticar por qué no pasó (se quita en
          // cuanto quede resuelto): enseña con qué rol y qué correo llegó,
          // y contra qué se comparó.
          return respond({
            error: 'Esta sección es solo para Master, Admin y el equipo de altas.',
            diagnostico: { tu_correo: miCorreo, tu_rol: miRol || '(sin perfil)', lista_permitidos: permitidos },
          }, 403)
        }
      }
    }

    const tokenPrincipal = await getAccessToken(GOOGLE_REFRESH_TOKEN)

    // ── Árbol de la carpeta de Drive (pantalla de Documentos) ──
    if (accion === 'drive_arbol') {
      return respond(await leerArbolDrive(tokenPrincipal))
    }

    // ── Sincronizar el padrón del ABC con la hoja de asesores ──
    //
    // Va en dos tiempos a propósito. Con `aplicar: false` (el default)
    // solo REPORTA qué cambiaría; hasta que se manda `aplicar: true` se
    // escribe. La razón es la baja: se deduce de "ya no aparece en la
    // hoja", así que si algún día la hoja se lee a medias (un rango mal
    // puesto, un permiso caído) aplicar a ciegas daría de baja a medio
    // Market Center. Enseñándolo antes, eso se ve y se cancela.
    //
    // Nunca se borra a nadie: una baja es activo = false, y el avance
    // que ya tenía registrado se queda intacto.
    if (accion === 'abc_sync') {
      const aplicar = body.aplicar === true
      const omitidos: { fila: number; nombre: string; motivo: string }[] = []
      const enHoja = await leerHojaABC(tokenPrincipal, omitidos)

      if (!enHoja.length) {
        return respond({ error: 'La hoja no devolvió ningún asesor con KW ID. No se cambió nada.' }, 400)
      }

      type FilaPadron = { kwid: string; nombre: string; activo: boolean }
      const { data: actuales, error: errLeer } = await admin
        .from('abc_asesores').select('kwid, nombre, activo')
      if (errLeer) return respond({ error: `No se pudo leer el padrón: ${errLeer.message}` }, 500)

      const padron: FilaPadron[] = (actuales || []).map((a: Record<string, unknown>) => ({
        kwid: String(a.kwid),
        nombre: String(a.nombre || ''),
        activo: a.activo !== false,
      }))

      const mapaHoja = new Map(enHoja.map((p) => [p.kwid, p] as const))
      const mapaDb = new Map(padron.map((a) => [a.kwid, a] as const))

      const nuevos = enHoja.filter((p) => !mapaDb.has(p.kwid))
      const reactivados = enHoja.filter((p) => mapaDb.get(p.kwid)?.activo === false)
      const bajas = padron
        .filter((a) => a.activo && !mapaHoja.has(a.kwid))
        .map((a) => ({ kwid: a.kwid, nombre: a.nombre }))

      const resumen = {
        total_hoja: enHoja.length,
        total_padron: padron.length,
        nuevos: nuevos.map((p) => ({ kwid: p.kwid, nombre: p.nombre })),
        reactivados: reactivados.map((p) => ({ kwid: p.kwid, nombre: p.nombre })),
        bajas,
        // Gente con nombre en la hoja pero sin KW ID capturado: antes
        // desaparecía de la sincronización sin dejar rastro. Ahora se
        // reporta por nombre y fila para poder ir a corregirlo.
        omitidos,
      }

      if (!aplicar) return respond({ aplicado: false, ...resumen })

      const ahora = new Date().toISOString()
      const filas = enHoja.map((p) => ({
        kwid: p.kwid,
        nombre: p.nombre || `KW ${p.kwid}`,
        fecha_ingreso: aFecha(p.fechaIngreso),
        activo: true,
        sincronizado_en: ahora,
      }))

      // El upsert no manda dt_asignado: ese dato se administra desde el
      // sitio y la hoja no lo trae, así que pisarlo borraría el trabajo
      // de asignación cada vez que alguien sincroniza.
      const { error: errUp } = await admin
        .from('abc_asesores').upsert(filas, { onConflict: 'kwid' })
      if (errUp) return respond({ error: `No se pudo guardar el padrón: ${errUp.message}` }, 500)

      if (bajas.length) {
        const { error: errBaja } = await admin
          .from('abc_asesores')
          .update({ activo: false, sincronizado_en: ahora })
          .in('kwid', bajas.map((b) => b.kwid))
        if (errBaja) return respond({ error: `No se pudieron marcar las bajas: ${errBaja.message}` }, 500)
      }

      return respond({ aplicado: true, ...resumen })
    }

    // ── Sincronizar el catálogo de asesores de Dictámenes ──
    //
    // El nombre y el correo salen de la misma hoja del alta (leerHoja ya
    // los trae), y de ahí se toma solo a quien esté activo en el padrón
    // del ABC: ese padrón es la fuente de quién sigue en el Market Center
    // hoy, y este catálogo debe reflejar lo mismo, no un universo propio
    // que se desalinee con el tiempo.
    //
    // Mismo patrón que abc_sync: en dos tiempos. Sin `aplicar: true` solo
    // reporta qué cambiaría, para poder revisarlo antes de que una lectura
    // a medias de la hoja o del padrón dé de baja a medio equipo por
    // error.
    if (accion === 'dictamen_asesores_sync') {
      const aplicar = body.aplicar === true

      const { data: activosAbc, error: errAbc } = await admin
        .from('abc_asesores').select('kwid').eq('activo', true)
      if (errAbc) return respond({ error: `No se pudo leer el padrón del ABC: ${errAbc.message}` }, 500)
      const kwidsActivos = new Set((activosAbc || []).map((a: { kwid: string }) => a.kwid))
      if (!kwidsActivos.size) {
        return respond({ error: 'El padrón del ABC está vacío. Sincronízalo primero desde esa pantalla.' }, 400)
      }

      const enHoja = (await leerHoja(tokenPrincipal))
        .filter((p) => p.kwid && kwidsActivos.has(p.kwid))
      if (!enHoja.length) {
        return respond({ error: 'Ningún renglón de la hoja coincidió con el padrón activo del ABC. No se cambió nada.' }, 400)
      }

      const { data: actuales, error: errLeer } = await admin
        .from('dictamen_asesores').select('id, nombre, correo, activo')
      if (errLeer) return respond({ error: `No se pudo leer el catálogo: ${errLeer.message}` }, 500)

      // Un registro sin correo no puede venir de este sincronizador (solo
      // escribe filas que sí lo traen), pero se guarda por si algún día
      // alguien mete uno a mano por otro camino: sin esto, ese renglón
      // tronaría la sincronización entera en vez de simplemente
      // ignorarse.
      const mapaDb = new Map(
        (actuales || [])
          .filter((a: { correo: string | null }) => a.correo)
          .map((a: { correo: string }) => [a.correo.toLowerCase(), a] as const))
      const mapaHoja = new Map(enHoja.map((p) => [p.correo.toLowerCase(), p] as const))

      const nuevos = enHoja.filter((p) => !mapaDb.has(p.correo.toLowerCase()))
      const reactivados = enHoja.filter((p) => {
        const db = mapaDb.get(p.correo.toLowerCase())
        return db && db.activo === false
      })
      const bajas = (actuales || []).filter((a: { correo: string | null; activo: boolean }) =>
        a.activo && a.correo && !mapaHoja.has(a.correo.toLowerCase()))

      const resumen = {
        total_hoja: enHoja.length,
        total_catalogo: (actuales || []).length,
        nuevos: nuevos.map((p) => ({ nombre: p.nombre, correo: p.correo })),
        reactivados: reactivados.map((p) => ({ nombre: p.nombre, correo: p.correo })),
        bajas: bajas.map((a) => ({ nombre: a.nombre, correo: a.correo })),
      }

      if (!aplicar) return respond({ aplicado: false, ...resumen })

      const filas = enHoja.map((p) => ({ nombre: p.nombre, correo: p.correo.toLowerCase(), activo: true }))
      const { error: errUp } = await admin
        .from('dictamen_asesores').upsert(filas, { onConflict: 'correo' })
      if (errUp) return respond({ error: `No se pudo guardar el catálogo: ${errUp.message}` }, 500)

      if (bajas.length) {
        const { error: errBaja } = await admin
          .from('dictamen_asesores')
          .update({ activo: false })
          .in('correo', bajas.map((b) => String(b.correo).toLowerCase()))
        if (errBaja) return respond({ error: `No se pudieron marcar las bajas: ${errBaja.message}` }, 500)
      }

      return respond({ aplicado: true, ...resumen })
    }

    // ── Listar: el libro completo + lo que ya se procesó ──
    //
    // Se devuelve una lista por hoja del libro (activos, bajas, back
    // office, células), no una sola lista revuelta: en la pantalla cada
    // grupo es su propio apartado y quién está en cuál es justo el dato
    // que se quiere ver.
    if (accion === 'listar') {
      const hojas = await detectarHojas(tokenPrincipal)
      const valores = await leerValores(tokenPrincipal, hojas.map((h) => rangoDeHoja(h.hoja)))

      const { data: yaHechas } = await admin
        .from('altas_procesadas')
        .select('correo, completo, pasos, created_at')
        .order('created_at', { ascending: false })

      const porCorreo = new Map<string, unknown>()
      for (const a of yaHechas || []) {
        const k = String(a.correo).toLowerCase()
        if (!porCorreo.has(k)) porCorreo.set(k, a) // la más reciente
      }

      const grupos = hojas.map((h, i) => {
        // Una fila sin nombre NI correo es una fila que nadie ha llenado
        // todavía, no una persona a medias: esa no se enseña ni se
        // reporta como omitida.
        const personas = parsearPersonas(valores[i]).filter((p) => p.nombre || p.correo)
        return {
          clave: h.clave,
          titulo: h.titulo,
          hoja: h.hoja,
          personas: personas.map((p) => ({
            ...p,
            alta: p.correo ? (porCorreo.get(p.correo.toLowerCase()) || null) : null,
          })),
          // Gente con nombre en la hoja pero sin correo capturado: sin
          // correo no se le puede dar de alta en nada, así que en vez de
          // enseñarla como si estuviera pendiente se avisa aparte con su
          // fila para ir a corregirla.
          omitidos: personas
            .filter((p) => p.nombre && !p.correo)
            .map((p) => ({ fila: p.fila, nombre: p.nombre, motivo: 'sin correo' })),
        }
      })

      // Los activos son el grupo de siempre: lo que esta acción devolvía
      // cuando el libro se leía como una sola hoja.
      const activos = grupos.find((g) => g.clave === 'activos') || grupos[0]
      return respond({
        grupos,
        personas: activos ? activos.personas : [],
        omitidos: activos ? activos.omitidos : [],
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
    // proceso (o por fuera de él). No toca las APIs de Google - solo
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
