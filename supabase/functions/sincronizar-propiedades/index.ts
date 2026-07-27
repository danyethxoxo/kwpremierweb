// Edge Function: sincronizar-propiedades
//
// Trae propiedades desde un sistema externo y las deja en la tabla
// `propiedades` (ver supabase/sql/023_propiedades.sql).
//
// Está armada con un patrón de "adaptadores": la lógica de guardar,
// deduplicar y llevar el cursor incremental es común, y cada origen solo
// aporta una función que sabe pedirle datos a SU API y traducirlos al
// formato de nuestra tabla. Así, cuando KW apruebe la integración, se
// completa el adaptador `command` sin tocar nada más — ni la base, ni el
// sitio, ni esta función.
//
// ─────────────────────────────────────────────────────────────
// ESTADO ACTUAL
// ─────────────────────────────────────────────────────────────
// El adaptador `command` está armado pero NO verificado contra la API
// real: developer.kw.com exige cuenta de developer aprobada y no es
// pública, así que los nombres exactos de los campos que devuelve KW
// (marcados abajo con "AJUSTAR") hay que confirmarlos con la
// documentación real una vez que tengas acceso. La forma de autenticar
// (OAuth + headers Authorization y API-Key contra partners.api.kw.com/v2)
// sí es la documentada públicamente por KW.
//
// Mientras tanto la función corre sin romper nada: si faltan las
// variables de entorno, responde que el origen no está configurado y no
// toca la tabla.
//
// ─────────────────────────────────────────────────────────────
// VARIABLES DE ENTORNO (Project Settings > Edge Functions > Secrets)
// ─────────────────────────────────────────────────────────────
//   SERVICE_ROLE_KEY     — ya la usan las otras funciones del proyecto
//   SYNC_SECRET          — clave propia para poder dispararla desde un
//                          cron sin sesión de usuario
//   KW_CLIENT_ID         — de tu app en el KW MarketPlace
//   KW_CLIENT_SECRET     — idem
//   KW_API_KEY           — idem (va en el header API-Key)
//   KW_TOKEN_URL         — endpoint OAuth de KW
//   KW_LISTINGS_URL      — endpoint de listings (KW Listings Search)
//
// Se crea vía Supabase Dashboard > Edge Functions > Create function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const SYNC_SECRET = Deno.env.get('SYNC_SECRET')

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
// Formato normalizado: lo que todo adaptador debe devolver.
// Coincide 1 a 1 con las columnas de la tabla `propiedades`.
// ─────────────────────────────────────────────────────────────
type Propiedad = {
  fuente: string
  fuente_id: string
  asesor_nombre?: string | null
  market_center?: string | null
  titulo: string
  descripcion?: string | null
  operacion?: 'venta' | 'renta' | null
  estatus: 'publicada' | 'no_publicada' | 'reservada' | 'vendida' | 'rentada' | 'suspendida'
  tipo?: string | null
  precio?: number | null
  moneda?: string
  recamaras?: number | null
  banos?: number | null
  estacionamientos?: number | null
  m2_construccion?: number | null
  m2_terreno?: number | null
  calle?: string | null
  colonia?: string | null
  municipio?: string | null
  estado?: string | null
  cp?: string | null
  pais?: string
  lat?: number | null
  lng?: number | null
  imagenes: unknown[]
  caracteristicas: unknown[]
  datos_origen: unknown
  // Correo del asesor en el origen; se usa para amarrar la propiedad al
  // perfil de KW Premier correspondiente (ver enlazarAsesores()).
  asesor_email?: string | null
}

type Adaptador = {
  configurado: () => boolean
  // `cursor` es la fecha de la última corrida: el adaptador debe pedir
  // solo lo modificado después de esa fecha. En la primera corrida llega
  // null y hay que traer todo.
  obtener: (cursor: string | null) => Promise<Propiedad[]>
}

// ─────────────────────────────────────────────────────────────
// Adaptador: KW Command
// ─────────────────────────────────────────────────────────────
const KW_CLIENT_ID = Deno.env.get('KW_CLIENT_ID')
const KW_CLIENT_SECRET = Deno.env.get('KW_CLIENT_SECRET')
const KW_API_KEY = Deno.env.get('KW_API_KEY')
const KW_TOKEN_URL = Deno.env.get('KW_TOKEN_URL')
const KW_LISTINGS_URL = Deno.env.get('KW_LISTINGS_URL')

async function kwToken(): Promise<string> {
  const resp = await fetch(KW_TOKEN_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: KW_CLIENT_ID!,
      client_secret: KW_CLIENT_SECRET!,
    }),
  })
  if (!resp.ok) {
    throw new Error('KW rechazó la autenticación (' + resp.status + '): ' + (await resp.text()).slice(0, 300))
  }
  const data = await resp.json()
  const token = data.access_token
  if (!token) throw new Error('La respuesta de KW no traía access_token.')
  return token
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// AJUSTAR: el mapeo de estatus depende de los valores reales de KW.
function mapEstatus(v: unknown): Propiedad['estatus'] {
  const s = String(v ?? '').toLowerCase()
  if (s.includes('active') || s.includes('publish')) return 'publicada'
  if (s.includes('pending') || s.includes('reserv')) return 'reservada'
  if (s.includes('sold')) return 'vendida'
  if (s.includes('leas') || s.includes('rent')) return 'rentada'
  if (s.includes('withdraw') || s.includes('suspend') || s.includes('expired')) return 'suspendida'
  return 'no_publicada'
}

// AJUSTAR: idem para el tipo de operación.
function mapOperacion(v: unknown): 'venta' | 'renta' | null {
  const s = String(v ?? '').toLowerCase()
  if (s.includes('lease') || s.includes('rent')) return 'renta'
  if (s.includes('sale') || s.includes('sell')) return 'venta'
  return null
}

const adaptadorCommand: Adaptador = {
  configurado: () =>
    Boolean(KW_CLIENT_ID && KW_CLIENT_SECRET && KW_API_KEY && KW_TOKEN_URL && KW_LISTINGS_URL),

  obtener: async (cursor) => {
    const token = await kwToken()
    const propiedades: Propiedad[] = []

    let page = 1
    const limit = 100

    // Paginación defensiva: se corta a las 100 páginas para no dejar la
    // función corriendo indefinidamente si la API no marca el final.
    while (page <= 100) {
      const url = new URL(KW_LISTINGS_URL!)
      url.searchParams.set('page', String(page))
      url.searchParams.set('limit', String(limit))
      if (cursor) url.searchParams.set('updated_after', cursor) // AJUSTAR: nombre del parámetro

      const resp = await fetch(url.toString(), {
        headers: {
          'Authorization': 'Bearer ' + token,
          'API-Key': KW_API_KEY!,
          'Accept': 'application/json',
        },
      })

      if (!resp.ok) {
        throw new Error('KW respondió ' + resp.status + ': ' + (await resp.text()).slice(0, 300))
      }

      const data = await resp.json()
      // AJUSTAR: KW puede devolver el arreglo bajo otra llave.
      const items: Record<string, unknown>[] = data.items ?? data.data ?? data.listings ?? []
      if (!items.length) break

      for (const it of items) {
        const dir = (it.address ?? {}) as Record<string, unknown>
        propiedades.push({
          fuente: 'command',
          fuente_id: String(it.id ?? it.listing_id ?? it.mls_id ?? ''),
          asesor_nombre: (it.agent_name as string) ?? null,
          asesor_email: (it.agent_email as string) ?? null,
          market_center: (it.market_center as string) ?? null,
          titulo: String(it.title ?? it.address_line ?? dir.line1 ?? 'Propiedad'),
          descripcion: (it.description as string) ?? null,
          operacion: mapOperacion(it.transaction_type ?? it.operation),
          estatus: mapEstatus(it.status),
          tipo: (it.property_type as string) ?? null,
          precio: num(it.price ?? it.list_price),
          moneda: (it.currency as string) ?? 'MXN',
          recamaras: num(it.bedrooms),
          banos: num(it.bathrooms),
          estacionamientos: num(it.parking ?? it.garage_spaces),
          m2_construccion: num(it.building_area ?? it.construction_size),
          m2_terreno: num(it.lot_size ?? it.land_size),
          calle: (dir.line1 as string) ?? null,
          colonia: (dir.neighborhood as string) ?? null,
          municipio: (dir.city as string) ?? null,
          estado: (dir.state as string) ?? null,
          cp: (dir.postal_code as string) ?? null,
          pais: (dir.country as string) ?? 'MX',
          lat: num(it.latitude ?? dir.latitude),
          lng: num(it.longitude ?? dir.longitude),
          imagenes: (it.photos ?? it.images ?? []) as unknown[],
          caracteristicas: (it.features ?? []) as unknown[],
          datos_origen: it,
        })
      }

      if (items.length < limit) break
      page++
    }

    return propiedades.filter((p) => p.fuente_id)
  },
}

const ADAPTADORES: Record<string, Adaptador> = {
  command: adaptadorCommand,
}

// ─────────────────────────────────────────────────────────────
// Amarra cada propiedad al perfil de KW Premier de su asesor, para que
// aparezca en su micrositio. Se hace por correo porque es el dato que
// comparten Command y `profiles`. Las de asesores de otras oficinas se
// quedan con asesor_id en null y solo con el nombre.
// ─────────────────────────────────────────────────────────────
async function enlazarAsesores(
  admin: ReturnType<typeof createClient>,
  propiedades: Propiedad[],
): Promise<Record<string, unknown>[]> {
  const correos = [...new Set(
    propiedades.map((p) => p.asesor_email?.toLowerCase()).filter(Boolean) as string[],
  )]

  const porCorreo = new Map<string, string>()
  if (correos.length) {
    const { data } = await admin.from('profiles').select('id, email').in('email', correos)
    for (const p of data ?? []) {
      if (p.email) porCorreo.set(String(p.email).toLowerCase(), p.id)
    }
  }

  return propiedades.map((p) => {
    const { asesor_email, ...resto } = p
    return {
      ...resto,
      asesor_id: asesor_email ? porCorreo.get(asesor_email.toLowerCase()) ?? null : null,
      sincronizado_at: new Date().toISOString(),
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
    //  1) desde un cron, mandando el header x-sync-secret
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

    const body = await req.json().catch(() => ({}))
    const fuente = String(body.fuente || 'command')
    const completa = body.completa === true // ignora el cursor y baja todo

    const adaptador = ADAPTADORES[fuente]
    if (!adaptador) return respond({ error: 'Origen desconocido: ' + fuente }, 400)

    if (!adaptador.configurado()) {
      return respond({
        ok: false,
        aviso: 'El origen "' + fuente + '" todavía no está configurado. ' +
          'Faltan las variables de entorno con las credenciales de KW.',
      })
    }

    // Cursor incremental
    const { data: estado } = await admin
      .from('propiedades_sync').select('ultimo_cursor').eq('fuente', fuente).maybeSingle()
    const cursor = completa ? null : (estado?.ultimo_cursor ?? null)

    const corrida = new Date().toISOString()

    try {
      const crudas = await adaptador.obtener(cursor)

      let afectadas = 0
      if (crudas.length) {
        const filas = await enlazarAsesores(admin, crudas)
        // El índice único (fuente, fuente_id) hace que resincronizar
        // actualice en vez de duplicar.
        const { error, count } = await admin
          .from('propiedades')
          .upsert(filas, { onConflict: 'fuente,fuente_id', count: 'exact' })
        if (error) throw error
        afectadas = count ?? filas.length
      }

      await admin.from('propiedades_sync').upsert({
        fuente,
        ultimo_cursor: corrida,
        ultima_corrida: corrida,
        ultimo_error: null,
        propiedades_afectadas: afectadas,
      }, { onConflict: 'fuente' })

      return respond({ ok: true, fuente, propiedades: afectadas, incremental: !completa })
    } catch (err) {
      const mensaje = (err as Error).message || 'Error desconocido al sincronizar.'
      // Se guarda el error pero NO se mueve el cursor, para que la
      // siguiente corrida vuelva a intentar el mismo rango.
      await admin.from('propiedades_sync').upsert({
        fuente,
        ultimo_cursor: estado?.ultimo_cursor ?? null,
        ultima_corrida: corrida,
        ultimo_error: mensaje.slice(0, 500),
      }, { onConflict: 'fuente' })
      return respond({ error: mensaje }, 502)
    }
  } catch (err) {
    return respond({ error: (err as Error).message || 'Error inesperado' }, 500)
  }
})
