import { secureServe } from '../_shared/security.ts'

const KWMEXICO_API_BASE = 'https://www.kwmexico.mx/api/properties'

function texto(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function numero(value: unknown): number {
  const result = Number(value)
  return Number.isFinite(result) ? result : 9999
}

function fotosDe(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  const data = (payload as Record<string, unknown>).data
  if (!data || typeof data !== 'object') return []
  const contenido = data as Record<string, unknown>
  const fotos = Array.isArray(contenido.Property_Photos) ? contenido.Property_Photos : []
  const resultado: string[] = []

  const principal = Array.isArray(contenido.Property_Data) ? contenido.Property_Data[0] : null
  const fotoPrincipal = principal && typeof principal === 'object'
    ? texto((principal as Record<string, unknown>).Photo_URL)
    : ''
  if (/^https:\/\//i.test(fotoPrincipal)) resultado.push(fotoPrincipal)

  fotos
    .filter((foto): foto is Record<string, unknown> => !!foto && typeof foto === 'object')
    .sort((a, b) => numero(a.Photo_Order) - numero(b.Photo_Order))
    .forEach((foto) => {
      const url = texto(foto.Photo_URL)
      if (/^https:\/\//i.test(url) && !resultado.includes(url)) resultado.push(url)
    })

  return resultado.slice(0, 12)
}

async function handler(req: Request): Promise<Response> {
  const body = await req.json() as Record<string, unknown>
  const fuente = texto(body.fuente).toLowerCase()
  const fuenteId = texto(body.fuente_id)
  if (fuente !== 'kwmexico' || !/^\d{1,12}$/.test(fuenteId)) {
    return new Response(JSON.stringify({ error: 'Propiedad no válida' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const upstream = await fetch(`${KWMEXICO_API_BASE}/${encodeURIComponent(fuenteId)}`, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'No se pudieron cargar las fotos' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const payload = await upstream.json()
  return new Response(JSON.stringify({ imagenes: fotosDe(payload) }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' },
  })
}

secureServe({
  name: 'fotos-propiedad',
  auth: 'user',
  methods: ['POST'],
  maxBytes: 32 * 1024,
}, handler)
