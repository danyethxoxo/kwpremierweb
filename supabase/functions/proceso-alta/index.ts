// Edge Function: proceso-alta
//
// Da de alta a un asesor nuevo en las plataformas de Google, desde el
// Panel, sin tener que entrar a cada una a mano:
//
//   1. Lo agrega a Google Contacts, en la cuenta original Y en la de
//      kwpremier@kwmexico.mx, con la etiqueta que le toque (Asesores
//      Inmobiliarios o Back Office)
//   2. Le comparte la carpeta de Drive como lector
//   3. Le da acceso de lectura al calendario de KW Premier
//
// Los tres se pueden quitar igual que se dan.
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
// B) GOOGLE_REFRESH_TOKEN es de la cuenta dueña del Sheet, la carpeta
//    de Drive y el calendario. Se autoriza entrando con esa cuenta
//    (dani.guerrero@kwmexico.mx) y pidiendo estos permisos:
//      https://www.googleapis.com/auth/spreadsheets.readonly
//      https://www.googleapis.com/auth/drive
//      https://www.googleapis.com/auth/calendar
//
//    GOOGLE_REFRESH_TOKEN ya trae permiso de Contactos desde el paso de
//    arriba, así que los contactos se guardan ahí de por sí. Además se
//    guardan por PARTIDA DOBLE en la cuenta del Market Center
//    (kwpremier@kwmexico.mx, la que ve todo el equipo), con su propio
//    token: uno solo no puede ser de dos cuentas a la vez. Se autoriza
//    igual, pero entrando con kwpremier@kwmexico.mx y pidiendo:
//      https://www.googleapis.com/auth/contacts
//    Ese token va en GOOGLE_REFRESH_TOKEN_CONTACTOS.
//
//    Mientras ese secreto no exista, los contactos se siguen guardando
//    solo en la cuenta original, como se hacía antes de esto.
//
// C) Project Settings > Edge Functions > Secrets:
//      ALTA_SHEET_ID          el id del Google Sheet (va en su URL,
//                             entre /d/ y /edit)
//      ALTA_SHEET_RANGO       opcional, por defecto 'A1:Z500'. Es el
//                             pedazo de celdas que se lee de CADA hoja;
//                             el nombre de la hoja no va aquí.
//      ALTA_DRIVE_FOLDER_ID   el id de la carpeta de Drive (va en su
//                             URL, después de /folders/)
//      GOOGLE_REFRESH_TOKEN_CONTACTOS
//                             opcional. El token de kwpremier@kwmexico.mx;
//                             sin él, los contactos se guardan solo en
//                             la cuenta original (GOOGLE_REFRESH_TOKEN).
//                             Con él, se guardan en las dos.
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

// Los contactos se guardan por PARTIDA DOBLE: en la cuenta del Market
// Center (kwpremier@kwmexico.mx, que ve todo el equipo) y en la cuenta
// original (la de quien arrancó esto, que ya los tenía de antes). Un
// refresh token es de UNA sola cuenta, así que hace falta el de las dos.
//
// Sin el secreto puesto se sigue guardando solo en la cuenta original,
// como se hacía antes de esto: así la función no se detiene mientras se
// consigue el token nuevo, nada más no duplica todavía en kwpremier.
const GOOGLE_REFRESH_TOKEN_CONTACTOS = Deno.env.get('GOOGLE_REFRESH_TOKEN_CONTACTOS') || ''

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

// En cuáles cuentas se guarda cada contacto. "original" siempre está
// (es GOOGLE_REFRESH_TOKEN, que ya traía permiso de Contactos desde
// antes de este cambio); "kwpremier" se suma en cuanto el secreto exista.
type CuentaContactos = { clave: string; nombre: string; refreshToken: string }

const CUENTAS_CONTACTOS: CuentaContactos[] = [
  { clave: 'original', nombre: 'dani.guerrero@kwmexico.mx', refreshToken: GOOGLE_REFRESH_TOKEN },
  ...(GOOGLE_REFRESH_TOKEN_CONTACTOS
    ? [{ clave: 'kwpremier', nombre: 'kwpremier@kwmexico.mx', refreshToken: GOOGLE_REFRESH_TOKEN_CONTACTOS }]
    : []),
]

async function getTokensContactos(): Promise<{ clave: string; nombre: string; token: string }[]> {
  return await Promise.all(CUENTAS_CONTACTOS.map(async (c) => ({
    clave: c.clave, nombre: c.nombre, token: await getAccessToken(c.refreshToken),
  })))
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
  // Lo que trae el libro además de lo de arriba: el expediente del
  // asesor mientras esto siga viviendo en el Excel. El día que se
  // capture directo en el sitio, estos dejan de venir de aquí.
  usuarioCommand: string
  contrasena: string
  correoPersonal: string
  tipoAsociado: string
  aniversario: string
  coachAsignado: string
  emergenciaNombre: string
  emergenciaTelefono: string
  emergenciaCorreo: string
  emergenciaParentesco: string
}

// Con qué encabezado se reconoce cada dato. Se compara sin acentos ni
// mayúsculas y por "contiene", que es lo único que aguanta que la misma
// columna se llame "Correo", "CORREO KW" o "e-mail" según la hoja.
//
// `no` son las palabras que DESCALIFICAN una columna aunque coincida.
// Hace falta porque "celular" contiene "celula": sin este freno, en una
// hoja con columna CELULAR el teléfono salía como si fuera la célula del
// asesor ("Célula: 5534347566" en la tarjeta).
const COLUMNAS: Record<string, { si: string[]; no?: string[] }> = {
  // "agente" es el nombre real de la persona; "nombre" (si existe
  // aparte) suele ser el nombre comercial, así que va después.
  agente: { si: ['agente'] },
  nombre: { si: ['nombre completo', 'nombre'], no: ['comercial', 'celula', 'sponsor', 'coach', 'personal'] },
  apellido: { si: ['apellido'] },
  // "personal" descalifica: sin eso, una columna "Correo personal" se
  // podía colar como SI fuera el correo de KW (el que de verdad se usa
  // para el alta), nada más por venir antes en la hoja.
  correo: { si: ['correo', 'email', 'e-mail', 'mail'], no: ['personal', 'particular'] },
  telefono: { si: ['telefono', 'celular', 'movil', 'whatsapp'], no: ['emergencia'] },
  kwid: { si: ['idkw', 'id kw', 'kwid', 'kw id', 'kwuid'] },
  ingreso: { si: ['fecha de ingreso', 'fecha ingreso'] },
  cumple: { si: ['cumpleanos', 'cumple', 'fecha de nacimiento', 'nacimiento', 'birthday'] },
  puesto: { si: ['puesto', 'cargo'] },
  celula: { si: ['celula', 'equipo'], no: ['celular'] },
  baja: { si: ['fecha de baja', 'baja'] },
  // El expediente del asesor. Vive en el mismo Excel mientras no haya
  // otra fuente; el día que se capture desde el sitio, esto se conecta
  // ahí en vez de leerlo de la hoja.
  usuarioCommand: { si: ['usuario command', 'usuario de command', 'usuario kw'] },
  contrasena: { si: ['contrasena'] },
  correoPersonal: { si: ['correo personal', 'correo particular', 'email personal'] },
  tipoAsociado: { si: ['tipo de asociado', 'tipo asociado'] },
  aniversario: { si: ['aniversario'] },
  coachAsignado: { si: ['coach asignado', 'coach'] },
  emergenciaNombre: { si: ['contacto de emergencia', 'nombre emergencia', 'emergencia'], no: ['cel', 'tel', 'correo', 'email', 'parentesco'] },
  emergenciaTelefono: { si: ['cel emergencia', 'celular emergencia', 'tel emergencia', 'telefono emergencia'] },
  emergenciaCorreo: { si: ['correo emergencia', 'email emergencia'] },
  emergenciaParentesco: { si: ['parentesco'] },
}

function indiceDeColumna(encabezados: string[], clave: string): number {
  const def = COLUMNAS[clave]
  const limpio = encabezados.map(normalizar)
  for (const palabra of def.si) {
    const i = limpio.findIndex((h) =>
      h.includes(palabra) && !(def.no || []).some((mal) => h.includes(mal)))
    if (i !== -1) return i
  }
  return -1
}

// Cuál de las primeras filas es la de los encabezados. No siempre es la
// primera: una hoja puede traer un título, un logo o un par de renglones
// en blanco antes de la tabla, y dando por hecho que era la fila 1 la
// hoja se leía entera como si no tuviera ni una columna reconocible y
// salía vacía sin decir por qué (justo lo que pasaba con "2. BAJAS").
// Gana la fila de las primeras 15 que reconozca más columnas.
const FILAS_A_MIRAR = 15

function filaDeEncabezados(filas: string[][]): number {
  let mejor = -1
  let mejorCuenta = 0
  for (let i = 0; i < Math.min(filas.length, FILAS_A_MIRAR); i++) {
    const cuenta = Object.keys(COLUMNAS)
      .filter((c) => indiceDeColumna(filas[i], c) !== -1).length
    if (cuenta > mejorCuenta) { mejor = i; mejorCuenta = cuenta }
  }
  // Con una sola columna reconocida no hay tabla que valga: puede ser
  // cualquier renglón suelto que traiga la palabra "nombre".
  return mejorCuenta >= 2 ? mejor : -1
}

// Qué columnas se le reconocieron a una hoja. Sirve para poder decir en
// pantalla POR QUÉ una hoja salió vacía: no es lo mismo "no hay nadie
// capturado" que "la tabla está ahí pero sus columnas se llaman de otra
// forma y no se reconoció ninguna".
function columnasDe(filas: string[][]): string[] {
  const iEnc = filaDeEncabezados(filas)
  if (iEnc === -1) return []
  return Object.keys(COLUMNAS).filter((c) => indiceDeColumna(filas[iEnc], c) !== -1)
}

function parsearPersonas(filas: string[][]): Persona[] {
  const iEnc = filaDeEncabezados(filas)
  if (iEnc === -1) return []

  const enc = filas[iEnc]
  const col: Record<string, number> = {}
  for (const clave of Object.keys(COLUMNAS)) col[clave] = indiceDeColumna(enc, clave)

  const dato = (fila: string[], clave: string) => {
    const i = col[clave]
    return i === -1 ? '' : String(fila[i] || '').trim()
  }

  const personas = filas.slice(iEnc + 1).map((fila, n) => ({
    // +1 por el encabezado y +1 porque las filas de Sheets empiezan en 1
    fila: iEnc + n + 2,
    nombre: col.agente !== -1
      ? dato(fila, 'agente')
      : [dato(fila, 'nombre'), dato(fila, 'apellido')].filter(Boolean).join(' '),
    correo: limpiarCorreo(col.correo === -1 ? '' : fila[col.correo]),
    telefono: dato(fila, 'telefono'),
    kwid: dato(fila, 'kwid'),
    fechaIngreso: dato(fila, 'ingreso'),
    cumpleanos: dato(fila, 'cumple'),
    puesto: dato(fila, 'puesto'),
    celula: dato(fila, 'celula'),
    fechaBaja: dato(fila, 'baja'),
    usuarioCommand: dato(fila, 'usuarioCommand'),
    contrasena: dato(fila, 'contrasena'),
    correoPersonal: dato(fila, 'correoPersonal'),
    tipoAsociado: dato(fila, 'tipoAsociado'),
    aniversario: dato(fila, 'aniversario'),
    coachAsignado: dato(fila, 'coachAsignado'),
    emergenciaNombre: dato(fila, 'emergenciaNombre'),
    emergenciaTelefono: dato(fila, 'emergenciaTelefono'),
    emergenciaCorreo: dato(fila, 'emergenciaCorreo'),
    emergenciaParentesco: dato(fila, 'emergenciaParentesco'),
  }))

  // Una hoja no trae solo personas: trae subtítulos que parten la tabla
  // en secciones ("BAJAS" a media hoja de BACKOFFICE), renglones de
  // totales y filas a medio llenar. Todos esos caen en la misma forma:
  // un texto suelto en la columna del nombre y NADA más en el renglón.
  // Alguien de verdad trae por lo menos otro dato además de su nombre.
  return personas.filter((p) => {
    if (p.correo) return true
    if (!p.nombre) return false
    return Boolean(p.telefono || p.kwid || p.fechaIngreso || p.cumpleanos || p.puesto || p.celula || p.fechaBaja
      || p.usuarioCommand || p.correoPersonal || p.tipoAsociado || p.aniversario || p.coachAsignado)
  })
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
  const todas = parsearPersonas(await leerHojaActivos(token))
  if (!todas.length) return []

  // Ni un solo KW ID en toda la hoja no es "nadie lo tiene capturado":
  // es que la columna se llama de otra forma y no se reconoció. Aplicar
  // una sincronización con eso daría de baja a todo el padrón.
  if (!todas.some((p) => p.kwid)) {
    throw new Error('La hoja de activos no tiene una columna de KW ID. Se busca un encabezado que diga "kwid", "kw id" o similar.')
  }

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
  const todas = parsearPersonas(await leerHojaActivos(token))
  if (!todas.length) return []

  if (!todas.some((p) => p.correo)) {
    throw new Error('La hoja de activos no tiene una columna de correo. Se busca un encabezado que diga "correo", "email" o "mail".')
  }

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
// persona) y se comparan en memoria: así revisar los accesos cuesta 3
// llamadas a Google sin importar cuánta gente haya en el libro.
//
// Y no se guarda un simple "sí lo tiene", sino el ID con el que Google
// identifica ese acceso: para QUITARLO hace falta ese id (el permiso de
// Drive, la regla del calendario, la ficha del contacto), y pedirlo
// aparte por cada persona sería una llamada más por cada quitar.
type PorCorreo = Map<string, string>

// Contactos vive en varias cuentas a la vez: correo -> (cuenta -> id del
// contacto en ESA cuenta). Drive y Calendario no lo necesitan porque son
// una sola cuenta cada uno.
type ContactosPorCuenta = Map<string, PorCorreo>

async function listarContactos(token: string): Promise<PorCorreo> {
  const contactos: PorCorreo = new Map()
  let pageToken: string | undefined
  do {
    const url = new URL('https://people.googleapis.com/v1/people/me/connections')
    url.searchParams.set('personFields', 'emailAddresses')
    url.searchParams.set('pageSize', '1000')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`No se pudo revisar los contactos existentes: ${res.status} ${await res.text()}`)
    const data = await res.json()

    for (const p of (data.connections || []) as { resourceName?: string; emailAddresses?: { value?: string }[] }[]) {
      for (const e of p.emailAddresses || []) {
        if (e.value && p.resourceName) contactos.set(String(e.value).toLowerCase(), p.resourceName)
      }
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return contactos
}

async function listarContactosTodasCuentas(
  cuentas: { clave: string; token: string }[],
): Promise<ContactosPorCuenta> {
  const resultado: ContactosPorCuenta = new Map()
  await Promise.all(cuentas.map(async (c) => {
    resultado.set(c.clave, await listarContactos(c.token))
  }))
  return resultado
}

// True solo si el contacto está en TODAS las cuentas configuradas: es lo
// que se enseña en la pantalla como "tiene acceso" a Contactos. Si falta
// en una sola, no cuenta como completo - eso es justo lo que "Dar" vuelve
// a intentar sin tocar la que ya está bien.
function contactoCompleto(mapa: ContactosPorCuenta, correo: string): boolean {
  const c = correo.toLowerCase()
  return CUENTAS_CONTACTOS.every((cuenta) => mapa.get(cuenta.clave)?.has(c))
}

function algunContacto(mapa: ContactosPorCuenta, correo: string): boolean {
  const c = correo.toLowerCase()
  return CUENTAS_CONTACTOS.some((cuenta) => mapa.get(cuenta.clave)?.has(c))
}

// En qué cuenta de Contactos está cada quien. Es lo que ve Master (y
// Admin no) para no confundirlo con un dato que no necesita: para Admin
// "tiene Contactos" es una sola cosa, sí o no.
function desglosePorCuenta(mapa: ContactosPorCuenta, correo: string): Record<string, boolean> {
  const c = correo.toLowerCase()
  const salida: Record<string, boolean> = {}
  for (const cuenta of CUENTAS_CONTACTOS) salida[cuenta.clave] = Boolean(mapa.get(cuenta.clave)?.has(c))
  return salida
}

// ── Las etiquetas de Contactos ──────────────────────────────
// En Google Contacts una etiqueta es un "grupo de contactos". Se busca
// por nombre y, si no existe, se crea: así la primera alta de cada tipo
// deja la etiqueta lista sin que nadie tenga que ir a crearla a mano.
// Los nombres tienen que ser EXACTOS a los que ya existen en Google
// Contacts (se comparan sin acentos ni mayúsculas, así que el caso no
// importa para encontrarlos, pero sí conviene que el texto sea el mismo
// para no dejar una etiqueta nueva y duplicada al lado de la de siempre).
const ETIQUETAS_CONTACTO: Record<string, string> = {
  asesores: 'ASOCIADOS VIGENTES',
  back_office: 'BACKOFFICE',
}

// Qué etiqueta le toca a cada hoja del libro. Las bajas no llevan: a esa
// gente ya no se le da de alta.
function etiquetaDeGrupo(clave: string): string | null {
  if (clave === 'back_office') return ETIQUETAS_CONTACTO.back_office
  if (clave === 'activos' || clave === 'celulas') return ETIQUETAS_CONTACTO.asesores
  return null
}

async function grupoDeContactos(token: string, nombre: string): Promise<string | null> {
  const url = new URL('https://people.googleapis.com/v1/contactGroups')
  url.searchParams.set('pageSize', '1000')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`No se pudieron leer las etiquetas de Contactos: ${res.status} ${await res.text()}`)

  const grupos = ((await res.json()).contactGroups || []) as { name?: string; resourceName?: string }[]
  const buscado = normalizar(nombre)
  const existente = grupos.find((g) => normalizar(g.name) === buscado)
  if (existente?.resourceName) return existente.resourceName

  const creado = await fetch('https://people.googleapis.com/v1/contactGroups', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactGroup: { name: nombre } }),
  })
  if (!creado.ok) throw new Error(`No se pudo crear la etiqueta "${nombre}": ${creado.status} ${await creado.text()}`)
  return (await creado.json()).resourceName || null
}

async function etiquetarContacto(token: string, grupo: string, contacto: string) {
  const res = await fetch(
    `https://people.googleapis.com/v1/${grupo}/members:modify`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ resourceNamesToAdd: [contacto] }),
    },
  )
  if (!res.ok) throw new Error(`No se pudo etiquetar el contacto: ${res.status} ${await res.text()}`)
}

async function listarPermisosDrive(token: string): Promise<PorCorreo> {
  const permisos: PorCorreo = new Map()
  if (!ALTA_DRIVE_FOLDER_ID) return permisos
  let pageToken: string | undefined
  do {
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ALTA_DRIVE_FOLDER_ID)}/permissions`)
    url.searchParams.set('fields', 'nextPageToken, permissions(id, emailAddress)')
    url.searchParams.set('supportsAllDrives', 'true')
    url.searchParams.set('pageSize', '100')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`No se pudo revisar los permisos de Drive: ${res.status} ${await res.text()}`)
    const data = await res.json()

    for (const p of (data.permissions || []) as { id?: string; emailAddress?: string }[]) {
      if (p.emailAddress && p.id) permisos.set(String(p.emailAddress).toLowerCase(), p.id)
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return permisos
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

async function listarAclCalendario(token: string): Promise<PorCorreo> {
  const reglas: PorCorreo = new Map()
  if (!GOOGLE_CALENDAR_ID) return reglas
  let pageToken: string | undefined
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/acl`)
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`No se pudo revisar el calendario: ${res.status} ${await res.text()}`)
    const data = await res.json()

    for (const r of (data.items || []) as { id?: string; scope?: { type?: string; value?: string } }[]) {
      if (r.scope?.type === 'user' && r.scope.value && r.id) {
        reglas.set(String(r.scope.value).toLowerCase(), r.id)
      }
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return reglas
}

// ── Dar cada acceso ─────────────────────────────────────────

type DatosPersona = {
  nombre: string
  correo: string
  telefono: string
  cumpleanos?: string
  grupo?: string
}

async function crearContacto(token: string, persona: DatosPersona): Promise<string> {
  const partes = persona.nombre.trim().split(/\s+/)
  const cuerpo: Record<string, unknown> = {
    names: [{
      givenName: partes[0] || persona.correo,
      familyName: partes.slice(1).join(' ') || undefined,
    }],
    emailAddresses: [{ value: persona.correo }],
    // Así se identifica de un vistazo en Contacts a quién pertenece
    // cada tarjeta, sin tener que abrir cada una.
    organizations: [{ name: 'KW PREMIER', title: 'Asesor Inmobiliario' }],
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
  return (await res.json()).resourceName as string
}

// Crea (o encuentra) el contacto en CADA cuenta configurada y lo
// etiqueta ahí. Cada cuenta es independiente: si en una ya existía y en
// la otra no, esta solo crea la que falta - no duplica la que ya está
// bien.
//
// La etiqueta se pone aunque el contacto ya existiera: es lo que permite
// acomodar en su grupo a los que se dieron de alta antes de que hubiera
// etiquetas, sin tener que borrarlos y rehacerlos.
async function agregarContacto(
  cuentas: { clave: string; nombre: string; token: string }[],
  persona: DatosPersona,
  contactosExistentes: ContactosPorCuenta,
  detallado: boolean,
) {
  const etiqueta = etiquetaDeGrupo(persona.grupo || 'activos')
  const c = persona.correo.toLowerCase()
  const detalles: string[] = []
  let algunaEraNueva = false
  let ultimaEtiqueta = ''

  for (const cuenta of cuentas) {
    const mapa = contactosExistentes.get(cuenta.clave) ?? new Map<string, string>()
    contactosExistentes.set(cuenta.clave, mapa)

    const yaEstaba = mapa.get(c)
    let recurso = yaEstaba
    if (!recurso) {
      recurso = await crearContacto(cuenta.token, persona)
      mapa.set(c, recurso)
      algunaEraNueva = true
    }

    let puesta = ''
    if (etiqueta && recurso) {
      const grupo = await grupoDeContactos(cuenta.token, etiqueta)
      if (grupo) { await etiquetarContacto(cuenta.token, grupo, recurso); puesta = `, "${etiqueta}"` }
    }
    ultimaEtiqueta = puesta

    // El desglose por cuenta es solo para quien sabe que hay más de una
    // (Master, ver "detallado" en quien llama a esto). A Admin, y a
    // cualquiera con una sola cuenta configurada, le llega el mismo
    // mensaje sencillo de siempre.
    if (detallado && cuentas.length > 1) {
      detalles.push(`${cuenta.nombre}: ${yaEstaba ? 'ya existía' : 'creado'}${puesta}`)
    }
  }

  if (detalles.length) return detalles.join(' · ')
  return `${algunaEraNueva ? 'Contacto creado' : 'Ya existía en Contactos'}${ultimaEtiqueta}`
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

// ── Quitar cada acceso ──────────────────────────────────────
// Para quitar hace falta el id que Google le puso a ese acceso, no el
// correo: por eso los tres listados guardan el id y no un simple "sí".
// Quitar algo que ya no está no es un error: se contesta que ya no lo
// tenía y ya, porque el resultado que se pedía (que no lo tenga) es el
// que hay.

async function borrarContacto(
  cuentas: { clave: string; nombre: string; token: string }[],
  correo: string,
  contactosExistentes: ContactosPorCuenta,
  detallado: boolean,
) {
  const c = correo.toLowerCase()
  const detalles: string[] = []
  let algunoSeBorro = false

  for (const cuenta of cuentas) {
    const mapa = contactosExistentes.get(cuenta.clave) ?? new Map<string, string>()
    const recurso = mapa.get(c)
    if (!recurso) {
      if (detallado && cuentas.length > 1) detalles.push(`${cuenta.nombre}: no estaba`)
      continue
    }

    const res = await fetch(`https://people.googleapis.com/v1/${recurso}:deleteContact`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${cuenta.token}` },
    })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    mapa.delete(c)
    algunoSeBorro = true
    if (detallado && cuentas.length > 1) detalles.push(`${cuenta.nombre}: borrado`)
  }

  if (detalles.length) return detalles.join(' · ')
  return algunoSeBorro ? 'Contacto borrado' : 'No estaba en Contactos'
}

async function quitarCarpeta(token: string, correo: string, permisos?: PorCorreo) {
  if (!ALTA_DRIVE_FOLDER_ID) throw new Error('Falta configurar ALTA_DRIVE_FOLDER_ID.')
  const mapa = permisos ?? await listarPermisosDrive(token)
  const permiso = mapa.get(correo.toLowerCase())
  if (!permiso) return 'No tenía acceso a Drive'

  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ALTA_DRIVE_FOLDER_ID)}` +
    `/permissions/${encodeURIComponent(permiso)}?supportsAllDrives=true`
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  mapa.delete(correo.toLowerCase())
  return 'Acceso a la carpeta retirado'
}

async function quitarAccesoCalendario(token: string, correo: string, reglas?: PorCorreo) {
  if (!GOOGLE_CALENDAR_ID) throw new Error('Falta configurar GOOGLE_CALENDAR_ID.')
  const mapa = reglas ?? await listarAclCalendario(token)
  const regla = mapa.get(correo.toLowerCase())
  if (!regla) return 'No tenía acceso al calendario'

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}` +
    `/acl/${encodeURIComponent(regla)}`
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  mapa.delete(correo.toLowerCase())
  return 'Acceso al calendario retirado'
}

async function intentar(nombre: string, fn: () => Promise<string>) {
  try {
    return { paso: nombre, ok: true, detalle: await fn() }
  } catch (err) {
    return { paso: nombre, ok: false, detalle: (err as Error).message || 'Error inesperado' }
  }
}

// Los tres accesos, en el orden en que se enseñan en la pantalla.
const PASOS = ['contactos', 'drive', 'calendario'] as const
type Paso = typeof PASOS[number]

// Todo lo que se sabe de Google de una sola pasada. Se pide una vez y se
// reusa para toda la corrida, sin importar cuánta gente se esté
// revisando o corrigiendo.
type EstadoGoogle = {
  contactos: ContactosPorCuenta
  drive: PorCorreo
  calendario: PorCorreo
}

async function leerEstadoGoogle(
  tokenGoogle: string,
  cuentasContactos: { clave: string; nombre: string; token: string }[],
): Promise<EstadoGoogle> {
  const [contactos, drive, calendario] = await Promise.all([
    listarContactosTodasCuentas(cuentasContactos),
    listarPermisosDrive(tokenGoogle),
    listarAclCalendario(tokenGoogle),
  ])
  return { contactos, drive, calendario }
}

// Da UN acceso, o lo quita. Sabiendo ya lo que hay en Google (el estado
// de arriba), un acceso que ya está no se vuelve a pedir: repetirlo no
// cambia nada y sí le reenvía a la persona el correo de "se compartió
// contigo".
async function moverAcceso(
  paso: Paso,
  quitar: boolean,
  tokenGoogle: string,
  cuentasContactos: { clave: string; nombre: string; token: string }[],
  persona: DatosPersona,
  estado: EstadoGoogle,
  detalladoContactos: boolean,
) {
  const c = persona.correo.toLowerCase()

  if (paso === 'contactos') {
    if (quitar) {
      if (!algunContacto(estado.contactos, c)) return { paso, ok: true, detalle: 'No lo tenía' }
      return await intentar(paso, () => borrarContacto(cuentasContactos, persona.correo, estado.contactos, detalladoContactos))
    }
    // Contactos es la excepción a "si ya está, no lo toco": la etiqueta
    // se vuelve a poner aunque el contacto ya existiera en alguna cuenta,
    // que es lo que permite acomodar en su grupo a los que se dieron de
    // alta antes de que hubiera etiquetas, y completar la cuenta que le
    // falte a quien ya estaba en una sola.
    return await intentar(paso, () => agregarContacto(cuentasContactos, persona, estado.contactos, detalladoContactos))
  }

  const tiene = estado[paso].has(c)
  if (quitar) {
    if (!tiene) return { paso, ok: true, detalle: 'No lo tenía' }
    if (paso === 'drive') return await intentar(paso, () => quitarCarpeta(tokenGoogle, persona.correo, estado.drive))
    return await intentar(paso, () => quitarAccesoCalendario(tokenGoogle, persona.correo, estado.calendario))
  }
  if (tiene) return { paso, ok: true, detalle: paso === 'drive' ? 'Ya tenía acceso a Drive' : 'Ya tenía acceso al calendario' }
  if (paso === 'drive') return await intentar(paso, () => compartirCarpeta(tokenGoogle, persona.correo))
  return await intentar(paso, () => darAccesoCalendario(tokenGoogle, persona.correo))
}

// Los pasos que se pidan (uno, dos o los tres) para una persona.
async function moverAccesos(
  pasos: Paso[],
  quitar: boolean,
  tokenGoogle: string,
  cuentasContactos: { clave: string; nombre: string; token: string }[],
  persona: DatosPersona,
  estado: EstadoGoogle,
  detalladoContactos: boolean,
) {
  const resultados = []
  for (const paso of pasos) {
    resultados.push(await moverAcceso(paso, quitar, tokenGoogle, cuentasContactos, persona, estado, detalladoContactos))
  }
  return resultados
}

// Qué pasos vienen en la petición. Sin nada, los tres.
function pasosPedidos(valor: unknown): Paso[] {
  if (!Array.isArray(valor) || !valor.length) return [...PASOS]
  const pedidos = valor.map((p) => String(p)) as Paso[]
  return PASOS.filter((p) => pedidos.includes(p))
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
    //
    // miRol se queda declarado aquí afuera (no dentro del if) porque las
    // acciones de más abajo también lo usan: Master ve el desglose de en
    // qué cuenta de Contactos quedó cada quien, Admin no - así no se
    // confunde con un dato que no necesita para su trabajo del día a
    // día.
    let miRol = ''
    if (!ACCIONES_ABIERTAS.includes(accion)) {
      const { data: perfil } = await admin
        .from('profiles').select('role').eq('id', quien.user.id).single()
      miRol = String(perfil?.role || '')
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
          // Para poder explicar una hoja vacía en vez de solo enseñarla
          // vacía: cuántos renglones trae y qué columnas se le
          // reconocieron.
          filasHoja: valores[i].length,
          columnas: columnasDe(valores[i]),
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

    // ── Dar o quitar accesos ────────────────────────────────
    //
    // Una sola acción para todo lo que toca Google, en vez de una por
    // combinación: se le dice a QUIÉN (una persona o varias), QUÉ pasos
    // (uno, dos o los tres) y si es dar o quitar. Con eso se cubren el
    // botón de un acceso suelto, el de los tres de golpe, el de quitar
    // todo, y la selección de varias personas a la vez.
    //
    // Lo que hay en Google se lee UNA vez para toda la corrida, aunque
    // sean 80 personas: son 3 llamadas, no 3 por persona.
    if (accion === 'acceso') {
      const quitar = body.quitar === true
      const pasos = pasosPedidos(body.pasos)
      const gente = (Array.isArray(body.personas) ? body.personas : [body])
        .map((p: Record<string, unknown>) => ({
          nombre: String(p.nombre || '').trim(),
          correo: limpiarCorreo(p.correo),
          telefono: String(p.telefono || '').trim(),
          cumpleanos: String(p.cumpleanos || '').trim(),
          grupo: String(p.grupo || 'activos'),
        }))
        .filter((p: DatosPersona) => p.correo)

      if (!gente.length) return respond({ error: 'No se recibió a nadie con correo.' }, 400)

      const soyMaster = miRol === 'master'
      const cuentasContactos = await getTokensContactos()
      const estado = await leerEstadoGoogle(tokenPrincipal, cuentasContactos)

      const hechas = []
      for (const persona of gente) {
        const resultados = await moverAccesos(pasos, quitar, tokenPrincipal, cuentasContactos, persona, estado, soyMaster)
        const completo = resultados.every((r) => r.ok)
        const detalle: Record<string, unknown> = {}
        for (const r of resultados) detalle[r.paso] = { ok: r.ok, detalle: r.detalle }

        // La constancia solo se guarda al DAR los tres: es lo que la
        // pantalla lee como "esta persona ya quedó". Quitar uno suelto no
        // debe contar como un alta nueva.
        if (!quitar && pasos.length === PASOS.length) {
          await admin.from('altas_procesadas').insert({
            correo: persona.correo,
            nombre: persona.nombre || null,
            telefono: persona.telefono || null,
            pasos: detalle,
            completo,
            procesado_por: quien.user.id,
          })
        }

        hechas.push({ correo: persona.correo, nombre: persona.nombre, ok: completo, resultados })
      }

      // El estado de después, para que la pantalla se repinte con lo que
      // de verdad quedó en Google en vez de suponerlo.
      const estadoFinal = gente.map((p: DatosPersona) => {
        const c = p.correo.toLowerCase()
        return {
          correo: p.correo,
          contactos: contactoCompleto(estado.contactos, c),
          contactosPorCuenta: soyMaster ? desglosePorCuenta(estado.contactos, c) : undefined,
          drive: estado.drive.has(c),
          calendario: estado.calendario.has(c),
        }
      })

      return respond({
        ok: hechas.every((h) => h.ok),
        hechas,
        estado: estadoFinal,
        // Con qué cuentas se está trabajando: solo Master la recibe, es
        // lo que la pantalla usa para ponerle nombre a cada columna del
        // desglose.
        cuentasContactos: soyMaster ? CUENTAS_CONTACTOS.map((c) => ({ clave: c.clave, nombre: c.nombre })) : undefined,
      })
    }

    // ── Revisar accesos: quién tiene qué, en Google ──────────
    //
    // Revisa TODO el libro, no solo la hoja de activos: los correos de
    // back office y células también son gente a la que se le dan estos
    // accesos, y antes no había forma de verlos aquí.
    if (accion === 'verificar') {
      const hojas = await detectarHojas(tokenPrincipal)
      const valores = await leerValores(tokenPrincipal, hojas.map((h) => rangoDeHoja(h.hoja)))

      const soyMaster = miRol === 'master'
      const cuentasContactos = await getTokensContactos()
      const estado = await leerEstadoGoogle(tokenPrincipal, cuentasContactos)

      const { data: yaHechas } = await admin
        .from('altas_procesadas').select('correo, completo')

      const completosBD = new Set<string>()
      for (const a of yaHechas || []) {
        if (a.completo) completosBD.add(String(a.correo).toLowerCase())
      }

      // Un correo puede estar en dos hojas (alguien de células que
      // también sale en activos); se queda con el primero, y las bajas
      // van al final para que no le ganen el lugar a la hoja buena.
      const vistos = new Set<string>()
      const personas = []
      for (const [i, h] of hojas.entries()) {
        for (const p of parsearPersonas(valores[i])) {
          const c = p.correo.toLowerCase()
          if (!c || vistos.has(c)) continue
          vistos.add(c)
          personas.push({
            correo: p.correo,
            nombre: p.nombre,
            grupo: h.clave,
            grupoTitulo: h.titulo,
            telefono: p.telefono,
            cumpleanos: p.cumpleanos,
            contactos: contactoCompleto(estado.contactos, c),
            contactosPorCuenta: soyMaster ? desglosePorCuenta(estado.contactos, c) : undefined,
            drive: estado.drive.has(c),
            calendario: estado.calendario.has(c),
            enSistema: completosBD.has(c),
          })
        }
      }

      return respond({
        personas,
        cuentasContactos: soyMaster ? CUENTAS_CONTACTOS.map((c) => ({ clave: c.clave, nombre: c.nombre })) : undefined,
      })
    }

    return respond({ error: 'Acción no reconocida.' }, 400)
  } catch (err) {
    return respond({ error: (err as Error).message || 'Error inesperado' }, 500)
  }
})
