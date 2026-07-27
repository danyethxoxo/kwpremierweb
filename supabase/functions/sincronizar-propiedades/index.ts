// Edge Function: sincronizar-propiedades
//
// Lee el feed de inventario que Command manda a los portales (XML o JSON)
// y lo deja en la tabla `propiedades` (ver supabase/sql/023_propiedades.sql).
//
// Es el mismo mecanismo que usan Inmuebles24, Lamudi y demás portales:
// el CRM publica un feed con el inventario y el portal lo interpreta. No
// hace falta darse de alta como developer ni autenticar con OAuth; lo
// único que se necesita es que quien administra Command agregue nuestro
// sitio como destino y nos dé la URL del feed.
//
// Soporta las dos formas en que suele llegar:
//
//   1) NOSOTROS LO BAJAMOS (lo más común).
//      Se configura FEED_URL y se corre por cron:
//        POST /sincronizar-propiedades
//        Header: x-sync-secret: <SYNC_SECRET>
//        Body:   {}
//
//   2) COMMAND NOS LO MANDA (push).
//      Se manda el feed tal cual en el cuerpo:
//        POST /sincronizar-propiedades
//        Header: x-sync-secret: <SYNC_SECRET>
//        Header: Content-Type: application/xml  (o application/json)
//        Body:   <el XML/JSON completo>
//
// En ambos casos el resto es igual: se normaliza, se guarda y se
// deduplica por (fuente, fuente_id).
//
// ─────────────────────────────────────────────────────────────
// SOBRE EL MAPEO DE CAMPOS
// ─────────────────────────────────────────────────────────────
// Todavía no tenemos un feed real de Command a la mano, y cada CRM nombra
// los campos distinto (title/titulo/nombre, price/precio/amount…). Por eso
// el mapeo NO está amarrado a un solo nombre: para cada dato se prueban
// varios nombres posibles, en español y en inglés, planos o anidados.
// Así el feed real debería entrar sin cambios, o con muy pocos. Cuando
// llegue, conviene correr una sincronización y revisar `datos_origen`
// (guarda el registro crudo) para confirmar que no se quedó nada fuera.
//
// ─────────────────────────────────────────────────────────────
// VARIABLES DE ENTORNO (Project Settings > Edge Functions > Secrets)
// ─────────────────────────────────────────────────────────────
//   SERVICE_ROLE_KEY  — ya la usan las otras funciones del proyecto
//   SYNC_SECRET       — clave propia para dispararla desde el cron
//   FEED_URL          — URL del feed (solo para el modo 1)
//   FEED_USER/FEED_PASS — opcionales, si el feed pide autenticación básica
//
// Se crea vía Supabase Dashboard > Edge Functions > Create function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4.3.6'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const SYNC_SECRET = Deno.env.get('SYNC_SECRET')
const FEED_URL = Deno.env.get('FEED_URL')
const FEED_USER = Deno.env.get('FEED_USER')
const FEED_PASS = Deno.env.get('FEED_PASS')

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

// ─────────────────────────────────────────────────────────────
// Lectura tolerante de campos
// ─────────────────────────────────────────────────────────────

// Aplana el registro: { address: { city: 'CDMX' } } queda también como
// 'address.city' y como 'city'. Así da igual que el feed venga anidado o
// plano, y da igual el uso de mayúsculas o guiones.
function aplanar(obj: unknown, prefijo = '', salida: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj === null || typeof obj !== 'object') return salida
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const clave = k.toLowerCase().replace(/[\s_-]/g, '')
    const ruta = prefijo ? prefijo + '.' + clave : clave
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      aplanar(v, ruta, salida)
      // el nombre corto también, si no lo ocupa nadie más
      if (!(clave in salida)) salida[clave] = v
    } else {
      if (!(ruta in salida)) salida[ruta] = v
      if (!(clave in salida)) salida[clave] = v
    }
  }
  return salida
}

function texto(plano: Record<string, unknown>, ...claves: string[]): string | null {
  for (const c of claves) {
    const v = plano[c.toLowerCase().replace(/[\s_-]/g, '')]
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    const s = String(v).trim()
    if (s) return s
  }
  return null
}

function numero(plano: Record<string, unknown>, ...claves: string[]): number | null {
  const s = texto(plano, ...claves)
  if (s === null) return null
  // "1,250,000.00 MXN" -> 1250000
  const limpio = s.replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '')
  const n = Number(limpio.replace(/,/g, '.'))
  return Number.isFinite(n) ? n : null
}

function comoArreglo(v: unknown): unknown[] {
  if (v === null || v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

// Las imágenes llegan de muchas formas: lista de strings, lista de
// objetos {url}, un solo string, o <imagenes><imagen>…</imagen></imagenes>.
function imagenesDe(registro: Record<string, unknown>, plano: Record<string, unknown>): string[] {
  const posibles = [
    (registro as Record<string, unknown>).imagenes, (registro as Record<string, unknown>).images,
    (registro as Record<string, unknown>).fotos, (registro as Record<string, unknown>).photos,
    (registro as Record<string, unknown>).pictures, (registro as Record<string, unknown>).media,
    plano['imagenes'], plano['images'], plano['fotos'], plano['photos'],
  ]
  for (const p of posibles) {
    if (p === null || p === undefined) continue
    // <imagenes><imagen>a</imagen><imagen>b</imagen></imagenes>
    let lista = comoArreglo(p)
    if (lista.length === 1 && lista[0] !== null && typeof lista[0] === 'object' && !Array.isArray(lista[0])) {
      const hijo = lista[0] as Record<string, unknown>
      const interna = hijo.imagen ?? hijo.image ?? hijo.foto ?? hijo.photo ?? hijo.url ?? hijo.item
      if (interna !== undefined) lista = comoArreglo(interna)
    }
    const urls = lista
      .map((it) => {
        if (typeof it === 'string') return it.trim()
        if (it && typeof it === 'object') {
          const o = it as Record<string, unknown>
          const u = o.url ?? o.href ?? o.src ?? o.link ?? o['#text']
          return u ? String(u).trim() : ''
        }
        return ''
      })
      .filter((u) => u.startsWith('http'))
    if (urls.length) return urls
  }
  return []
}

function mapEstatus(v: string | null): string {
  const s = (v ?? '').toLowerCase()
  if (!s) return 'publicada' // si el feed no lo dice, es porque se publica
  if (/(vendid|sold)/.test(s)) return 'vendida'
  if (/(rentad|leased|alquilad)/.test(s)) return 'rentada'
  if (/(apartad|reservad|pending|contrato)/.test(s)) return 'reservada'
  if (/(suspend|retirad|withdraw|expirad|inactiv|baja)/.test(s)) return 'suspendida'
  if (/(borrador|draft|no.?public)/.test(s)) return 'no_publicada'
  return 'publicada'
}

function mapOperacion(v: string | null): string | null {
  const s = (v ?? '').toLowerCase()
  if (/(renta|rent|lease|alquil|arrend)/.test(s)) return 'renta'
  if (/(venta|sale|sell|compra)/.test(s)) return 'venta'
  return null
}

type Fila = Record<string, unknown> & { asesor_email?: string | null }

function normalizar(registro: Record<string, unknown>): Fila | null {
  const p = aplanar(registro)

  const fuenteId = texto(p, 'id', 'listingid', 'propertyid', 'idpropiedad', 'clave',
    'codigo', 'reference', 'referencia', 'mlsid', 'mlsnumber', 'externalid')
  if (!fuenteId) return null

  const titulo = texto(p, 'titulo', 'title', 'nombre', 'name', 'headline',
    'direccion', 'address', 'addressline', 'address.line1') ?? 'Propiedad ' + fuenteId

  return {
    fuente: 'command',
    fuente_id: fuenteId,
    titulo,
    descripcion: texto(p, 'descripcion', 'description', 'detalle', 'observaciones', 'remarks'),
    operacion: mapOperacion(texto(p, 'operacion', 'operation', 'tipooperacion', 'transactiontype',
      'listingtype', 'tipodeoperacion')),
    estatus: mapEstatus(texto(p, 'estatus', 'estado', 'status', 'situacion', 'listingstatus')),
    tipo: texto(p, 'tipo', 'tipopropiedad', 'tipoinmueble', 'propertytype', 'type', 'categoria'),
    precio: numero(p, 'precio', 'price', 'listprice', 'monto', 'amount', 'valor',
      'precioventa', 'preciorenta'),
    moneda: texto(p, 'moneda', 'currency', 'divisa') ?? 'MXN',
    recamaras: numero(p, 'recamaras', 'habitaciones', 'dormitorios', 'bedrooms', 'beds', 'cuartos'),
    banos: numero(p, 'banos', 'baños', 'bathrooms', 'baths', 'sanitarios'),
    estacionamientos: numero(p, 'estacionamientos', 'cocheras', 'garages', 'parking',
      'parkingspaces', 'garagespaces'),
    m2_construccion: numero(p, 'm2construccion', 'superficieconstruida', 'construccion',
      'buildingarea', 'constructionsize', 'coveredarea', 'sqftbuilding'),
    m2_terreno: numero(p, 'm2terreno', 'superficieterreno', 'terreno', 'lotsize',
      'landsize', 'totalarea', 'sqftlot'),
    calle: texto(p, 'calle', 'street', 'address.line1', 'direccion', 'addressline1'),
    colonia: texto(p, 'colonia', 'neighborhood', 'barrio', 'zona', 'address.neighborhood'),
    municipio: texto(p, 'municipio', 'ciudad', 'city', 'delegacion', 'alcaldia', 'address.city'),
    estado: texto(p, 'estado_federativo', 'entidad', 'state', 'province', 'address.state'),
    cp: texto(p, 'cp', 'codigopostal', 'postalcode', 'zip', 'zipcode', 'address.postalcode'),
    pais: texto(p, 'pais', 'country', 'address.country') ?? 'MX',
    lat: numero(p, 'lat', 'latitud', 'latitude', 'address.latitude'),
    lng: numero(p, 'lng', 'lon', 'long', 'longitud', 'longitude', 'address.longitude'),
    imagenes: imagenesDe(registro, p),
    caracteristicas: comoArreglo(
      (registro as Record<string, unknown>).caracteristicas ??
      (registro as Record<string, unknown>).features ??
      (registro as Record<string, unknown>).amenidades ??
      (registro as Record<string, unknown>).amenities ?? [],
    ),
    market_center: texto(p, 'marketcenter', 'oficina', 'office', 'officename', 'sucursal', 'broker'),
    asesor_nombre: texto(p, 'asesor', 'agente', 'agent', 'agentname', 'nombreasesor',
      'contactname', 'listingagent'),
    asesor_email: texto(p, 'asesoremail', 'agentemail', 'emailasesor', 'correoasesor',
      'agent.email', 'contactemail', 'email'),
    datos_origen: registro,
  }
}

// ─────────────────────────────────────────────────────────────
// Localizar la lista de propiedades dentro del feed
// ─────────────────────────────────────────────────────────────
// Un feed puede venir como arreglo directo, o envuelto en {propiedades:[…]},
// o en XML como <listings><property>…</property></listings>. En vez de
// asumir una forma, se busca el primer arreglo de objetos que tenga pinta
// de ser el listado.
function extraerRegistros(raiz: unknown, profundidad = 0): Record<string, unknown>[] {
  if (profundidad > 6 || raiz === null || typeof raiz !== 'object') return []

  if (Array.isArray(raiz)) {
    const objetos = raiz.filter((x) => x && typeof x === 'object' && !Array.isArray(x))
    return objetos.length ? (objetos as Record<string, unknown>[]) : []
  }

  const obj = raiz as Record<string, unknown>
  const preferidas = ['propiedades', 'properties', 'property', 'listings', 'listing',
    'inmuebles', 'inmueble', 'items', 'item', 'data', 'results', 'anuncios']

  // primero las llaves con nombre conocido
  for (const k of Object.keys(obj)) {
    if (preferidas.includes(k.toLowerCase())) {
      const encontrado = extraerRegistros(obj[k], profundidad + 1)
      if (encontrado.length) return encontrado
    }
  }
  // luego cualquier otra rama
  for (const k of Object.keys(obj)) {
    const encontrado = extraerRegistros(obj[k], profundidad + 1)
    if (encontrado.length) return encontrado
  }
  return []
}

function parsearFeed(cuerpo: string, contentType: string): Record<string, unknown>[] {
  const limpio = cuerpo.trim()
  const esXml = contentType.includes('xml') || limpio.startsWith('<')

  let raiz: unknown
  if (esXml) {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseTagValue: true,
      trimValues: true,
    })
    raiz = parser.parse(limpio)
  } else {
    raiz = JSON.parse(limpio)
  }

  return extraerRegistros(raiz)
}

// ─────────────────────────────────────────────────────────────
// Amarra cada propiedad al perfil de KW Premier de su asesor, para que
// aparezca en su micrositio. Se hace por correo, que es el dato que
// comparten el feed y `profiles`. Las de asesores de otras oficinas se
// quedan con asesor_id en null y solo con el nombre.
// ─────────────────────────────────────────────────────────────
async function enlazarAsesores(
  admin: ReturnType<typeof createClient>,
  filas: Fila[],
): Promise<Record<string, unknown>[]> {
  const correos = [...new Set(
    filas.map((f) => f.asesor_email?.toLowerCase()).filter(Boolean) as string[],
  )]

  const porCorreo = new Map<string, string>()
  if (correos.length) {
    const { data } = await admin.from('profiles').select('id, email').in('email', correos)
    for (const p of data ?? []) {
      if (p.email) porCorreo.set(String(p.email).toLowerCase(), p.id)
    }
  }

  const ahora = new Date().toISOString()
  return filas.map((f) => {
    const { asesor_email, ...resto } = f
    return {
      ...resto,
      asesor_id: asesor_email ? porCorreo.get(asesor_email.toLowerCase()) ?? null : null,
      sincronizado_at: ahora,
    }
  })
}

// ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respond({ error: 'Método no permitido' }, 405)

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return respond({ error: 'Configuración del servidor incompleta (faltan variables de entorno).' }, 500)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Se puede disparar de dos maneras:
    //  1) desde el cron o desde Command, mandando el header x-sync-secret
    //  2) a mano desde el panel, con la sesión de un Master/Admin
    const secreto = req.headers.get('x-sync-secret')
    let autorizado = Boolean(SYNC_SECRET && secreto && secreto === SYNC_SECRET)

    if (!autorizado) {
      const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
      if (!token) return respond({ error: 'No autenticado' }, 401)

      const { data: userData, error: userError } = await admin.auth.getUser(token)
      if (userError || !userData?.user) return respond({ error: 'Sesión inválida' }, 401)

      const { data: perfil } = await admin
        .from('profiles').select('role').eq('id', userData.user.id).single()

      if (!perfil || !['master', 'admin'].includes(perfil.role)) {
        return respond({ error: 'No tienes permiso para sincronizar propiedades' }, 403)
      }
      autorizado = true
    }

    const contentType = (req.headers.get('Content-Type') || '').toLowerCase()
    const crudo = await req.text()
    const corrida = new Date().toISOString()

    // ── Conseguir el feed ──
    let cuerpo: string
    let tipo: string
    let modo: 'push' | 'pull'

    const pareceFeed = crudo.trim().startsWith('<') ||
      (contentType.includes('json') && crudo.trim().length > 2 && !crudo.trim().startsWith('{"fuente"'))

    if (pareceFeed && crudo.trim().length > 2) {
      // Command nos lo mandó en el cuerpo
      cuerpo = crudo
      tipo = contentType
      modo = 'push'
    } else {
      // Lo bajamos nosotros
      if (!FEED_URL) {
        return respond({
          ok: false,
          aviso: 'Todavía no hay feed configurado. Falta la variable FEED_URL con la ' +
            'dirección del feed que Command manda a los portales (o mandar el feed ' +
            'en el cuerpo de la petición).',
        })
      }
      const cabeceras: Record<string, string> = { 'Accept': 'application/xml, application/json' }
      if (FEED_USER && FEED_PASS) {
        cabeceras['Authorization'] = 'Basic ' + btoa(FEED_USER + ':' + FEED_PASS)
      }
      const resp = await fetch(FEED_URL, { headers: cabeceras })
      if (!resp.ok) {
        const mensaje = 'El feed respondió ' + resp.status + ': ' + (await resp.text()).slice(0, 300)
        await admin.from('propiedades_sync').upsert({
          fuente: 'command', ultima_corrida: corrida, ultimo_error: mensaje.slice(0, 500),
        }, { onConflict: 'fuente' })
        return respond({ error: mensaje }, 502)
      }
      cuerpo = await resp.text()
      tipo = (resp.headers.get('Content-Type') || '').toLowerCase()
      modo = 'pull'
    }

    // ── Interpretar y guardar ──
    try {
      const registros = parsearFeed(cuerpo, tipo)
      if (!registros.length) {
        throw new Error('El feed se leyó pero no se encontró ninguna propiedad dentro. ' +
          'Puede que use una estructura distinta a las contempladas.')
      }

      const filas = registros
        .map(normalizar)
        .filter((f): f is Fila => f !== null)

      if (!filas.length) {
        throw new Error('Se encontraron ' + registros.length + ' registros pero ninguno traía ' +
          'un identificador reconocible (id, clave, referencia…).')
      }

      // Si el feed repite el mismo id, nos quedamos con la última: mandar
      // duplicados en un mismo upsert hace que Postgres falle.
      const porId = new Map<string, Fila>()
      for (const f of filas) porId.set(String(f.fuente_id), f)
      const unicas = [...porId.values()]

      const listas = await enlazarAsesores(admin, unicas)

      // El índice único (fuente, fuente_id) hace que resincronizar
      // actualice en vez de duplicar.
      const { error, count } = await admin
        .from('propiedades')
        .upsert(listas, { onConflict: 'fuente,fuente_id', count: 'exact' })
      if (error) throw error

      await admin.from('propiedades_sync').upsert({
        fuente: 'command',
        ultimo_cursor: corrida,
        ultima_corrida: corrida,
        ultimo_error: null,
        propiedades_afectadas: count ?? listas.length,
      }, { onConflict: 'fuente' })

      return respond({
        ok: true,
        modo,
        registros_en_feed: registros.length,
        propiedades_guardadas: count ?? listas.length,
        omitidas_sin_id: registros.length - filas.length,
        duplicadas_en_feed: filas.length - unicas.length,
      })
    } catch (err) {
      const mensaje = (err as Error).message || 'Error desconocido al interpretar el feed.'
      await admin.from('propiedades_sync').upsert({
        fuente: 'command', ultima_corrida: corrida, ultimo_error: mensaje.slice(0, 500),
      }, { onConflict: 'fuente' })
      return respond({ error: mensaje }, 502)
    }
  } catch (err) {
    return respond({ error: (err as Error).message || 'Error inesperado' }, 500)
  }
})
