import { secureServe } from '../_shared/security.ts'
import { extraerPerfil, sitioKW } from './profile.ts'

const cache = new Map<string, { expires: number; perfil: ReturnType<typeof extraerPerfil> }>()

secureServe({ name: 'perfil-sitio-kw', auth: 'optional', methods: ['POST'], maxBytes: 4096, ipLimit: 30 }, async (req) => {
  const body = await req.json()
  let sitio: string
  try { sitio = sitioKW(body.sitio_web) } catch {
    return Response.json({ error: 'Introduce un sitio de asesor terminado en .kw.com' }, { status: 400 })
  }
  const stored = cache.get(sitio)
  if (stored && stored.expires > Date.now()) return Response.json({ perfil: stored.perfil })
  for (const path of ['/es-419/about', '/about']) {
    try {
      const response = await fetch(sitio + path, {
        headers: { Accept: 'text/html' }, redirect: 'error', signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) continue
      const html = await response.text()
      if (html.length > 3_000_000) continue
      const perfil = extraerPerfil(html, sitio)
      if (cache.size >= 200) cache.clear()
      cache.set(sitio, { expires: Date.now() + 15 * 60 * 1000, perfil })
      return Response.json({ perfil })
    } catch { /* Try the other supported language route. */ }
  }
  return Response.json({ error: 'KW no permitio leer este perfil. Intenta nuevamente mas tarde.' }, { status: 502 })
})
