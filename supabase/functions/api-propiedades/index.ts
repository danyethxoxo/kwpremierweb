// Edge Function: api-propiedades
//
// API pública de KW Premier para recibir inventario desde sistemas
// externos (Command / KW México), con la misma forma que la API de
// Neojaus para que a quien la integre le resulte familiar: la llave va
// en el header `x-api-key` y los endpoints son REST sobre /properties.
//
// La documentación para terceros está en /kwpremierweb/api.html y la
// colección de Postman en docs/kwpremier-api.postman_collection.json.
//
// ─────────────────────────────────────────────────────────────
// ENDPOINTS
// ─────────────────────────────────────────────────────────────
//   GET  /me                    Verifica la llave y devuelve a quién pertenece
//   GET  /property_types        Valores aceptados en cada campo
//   POST /properties            Manda propiedades (crea o actualiza)
//   GET  /properties            Lista lo que tenemos guardado
//   GET  /properties/:id        Detalle de una propiedad
//   DELETE /properties/:id      Da de baja una propiedad
//
//   Administración (requiere sesión de Master/Admin, no llave de API):
//   POST /llaves                Genera una llave nueva
//   GET  /llaves                Lista las llaves emitidas
//   POST /llaves/:id/revocar    Desactiva una llave
//
// ─────────────────────────────────────────────────────────────
// VARIABLES DE ENTORNO
// ─────────────────────────────────────────────────────────────
//   SERVICE_ROLE_KEY  - ya la usan las otras funciones del proyecto
//
// Se crea vía Supabase Dashboard > Edge Functions > Create function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function error(mensaje: string, status: number, detalle?: unknown) {
  return respond({ error: mensaje, ...(detalle ? { detalle } : {}) }, status)
}

// ─────────────────────────────────────────────────────────────
// Valores aceptados (los mismos que valida la tabla `propiedades`)
// ─────────────────────────────────────────────────────────────
const OPERACIONES = ['venta', 'renta']
const ESTATUS = ['publicada', 'no_publicada', 'reservada', 'vendida', 'rentada', 'suspendida']
const TIPOS = [
  'Casa', 'Departamento', 'Terreno', 'Local Comercial', 'Oficina',
  'Bodega', 'Edificio', 'Rancho', 'Otro',
]

async function sha256(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto)
  const buffer = await crypto.subtle.digest('SHA-256', datos)
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ─────────────────────────────────────────────────────────────
// Normalización y validación de una propiedad que llega por la API.
// A diferencia del lector de feeds (que tiene que adivinar formatos
// ajenos), aquí el esquema lo publicamos nosotros, así que se valida y
// se devuelve un error claro por registro en vez de tratar de adivinar.
// Aun así se aceptan algunos alias comunes en inglés.
// ─────────────────────────────────────────────────────────────
type Resultado = { fila: Record<string, unknown> } | { error: string }

function tomar(o: Record<string, unknown>, ...claves: string[]): unknown {
  for (const c of claves) {
    if (o[c] !== undefined && o[c] !== null && o[c] !== '') return o[c]
  }
  return undefined
}

function comoNumero(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function validar(p: Record<string, unknown>): Resultado {
  const id = tomar(p, 'id', 'external_id', 'listing_id')
  if (!id) return { error: 'Falta "id" (el identificador de la propiedad en tu sistema).' }

  const titulo = tomar(p, 'titulo', 'title')
  if (!titulo) return { error: 'Falta "titulo".' }

  const operacion = tomar(p, 'operacion', 'operation')
  if (operacion && !OPERACIONES.includes(String(operacion))) {
    return { error: '"operacion" debe ser uno de: ' + OPERACIONES.join(', ') + '. Recibido: ' + operacion }
  }

  const estatusCrudo = tomar(p, 'estatus', 'status')
  const estatus = estatusCrudo ? String(estatusCrudo) : 'publicada'
  if (!ESTATUS.includes(estatus)) {
    return { error: '"estatus" debe ser uno de: ' + ESTATUS.join(', ') + '. Recibido: ' + estatusCrudo }
  }

  const imagenesCrudas = tomar(p, 'imagenes', 'images')
  let imagenes: string[] = []
  if (imagenesCrudas !== undefined) {
    if (!Array.isArray(imagenesCrudas)) {
      return { error: '"imagenes" debe ser una lista de URLs.' }
    }
    imagenes = imagenesCrudas
      .map((i) => (typeof i === 'string' ? i : (i as Record<string, unknown>)?.url))
      .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
  }

  const dir = (tomar(p, 'direccion', 'address') ?? {}) as Record<string, unknown>

  return {
    fila: {
      fuente: 'command',
      fuente_id: String(id),
      titulo: String(titulo),
      descripcion: tomar(p, 'descripcion', 'description') ?? null,
      operacion: operacion ? String(operacion) : null,
      estatus,
      tipo: tomar(p, 'tipo', 'property_type') ?? null,
      precio: comoNumero(tomar(p, 'precio', 'price')),
      moneda: String(tomar(p, 'moneda', 'currency') ?? 'MXN'),
      recamaras: comoNumero(tomar(p, 'recamaras', 'bedrooms')),
      banos: comoNumero(tomar(p, 'banos', 'bathrooms')),
      estacionamientos: comoNumero(tomar(p, 'estacionamientos', 'parking')),
      m2_construccion: comoNumero(tomar(p, 'm2_construccion', 'building_area')),
      m2_terreno: comoNumero(tomar(p, 'm2_terreno', 'lot_size')),
      calle: tomar(dir, 'calle', 'street') ?? tomar(p, 'calle') ?? null,
      colonia: tomar(dir, 'colonia', 'neighborhood') ?? tomar(p, 'colonia') ?? null,
      municipio: tomar(dir, 'municipio', 'ciudad', 'city') ?? tomar(p, 'municipio') ?? null,
      estado: tomar(dir, 'estado', 'state') ?? tomar(p, 'estado') ?? null,
      cp: tomar(dir, 'cp', 'postal_code') ?? tomar(p, 'cp') ?? null,
      pais: String(tomar(dir, 'pais', 'country') ?? tomar(p, 'pais') ?? 'MX'),
      lat: comoNumero(tomar(dir, 'lat', 'latitud', 'latitude') ?? tomar(p, 'lat')),
      lng: comoNumero(tomar(dir, 'lng', 'longitud', 'longitude') ?? tomar(p, 'lng')),
      imagenes,
      caracteristicas: Array.isArray(tomar(p, 'caracteristicas', 'features'))
        ? tomar(p, 'caracteristicas', 'features')
        : [],
      market_center: tomar(p, 'market_center', 'oficina') ?? null,
      asesor_nombre: tomar(p, 'asesor_nombre', 'agent_name') ?? null,
      datos_origen: p,
      sincronizado_at: new Date().toISOString(),
      // se resuelve más abajo contra `profiles`
      _asesor_email: tomar(p, 'asesor_email', 'agent_email') ?? null,
    },
  }
}

// ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return error('Configuración del servidor incompleta.', 500)
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // La ruta llega como /api-propiedades/<lo que sigue>
    const url = new URL(req.url)
    const partes = url.pathname.split('/').filter(Boolean)
    const i = partes.indexOf('api-propiedades')
    const ruta = (i >= 0 ? partes.slice(i + 1) : partes)

    const recurso = ruta[0] ?? ''
    const idRuta = ruta[1] ?? null

    // ══════════════════════════════════════════════════
    // Administración de llaves - con sesión, no con llave
    // ══════════════════════════════════════════════════
    if (recurso === 'llaves') {
      const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
      if (!token) return error('No autenticado', 401)

      const { data: userData, error: userErr } = await admin.auth.getUser(token)
      if (userErr || !userData?.user) return error('Sesión inválida', 401)

      const { data: perfil } = await admin
        .from('profiles').select('role').eq('id', userData.user.id).single()
      if (!perfil || !['master', 'admin'].includes(perfil.role)) {
        return error('Solo Master o Admin pueden administrar llaves de API.', 403)
      }

      if (req.method === 'GET') {
        const { data } = await admin.from('api_llaves')
          .select('id, nombre, prefijo, permisos, activa, created_at, ultimo_uso, usos')
          .order('created_at', { ascending: false })
        return respond({ llaves: data ?? [] })
      }

      if (req.method === 'POST' && idRuta && ruta[2] === 'revocar') {
        const { error: e } = await admin.from('api_llaves')
          .update({ activa: false }).eq('id', idRuta)
        if (e) return error(e.message, 500)
        return respond({ ok: true, revocada: idRuta })
      }

      if (req.method === 'POST') {
        const body = await req.json().catch(() => ({}))
        const nombre = String(body.nombre || '').trim()
        if (!nombre) return error('Falta "nombre" (a quién se le entrega la llave).', 400)

        // kwp_live_<32 hex>
        const aleatorio = [...crypto.getRandomValues(new Uint8Array(16))]
          .map((b) => b.toString(16).padStart(2, '0')).join('')
        const llave = 'kwp_live_' + aleatorio

        const { error: e } = await admin.from('api_llaves').insert({
          nombre,
          prefijo: llave.slice(0, 17),
          llave_hash: await sha256(llave),
          creada_por: userData.user.id,
        })
        if (e) return error(e.message, 500)

        return respond({
          ok: true,
          llave,
          aviso: 'Guarda esta llave ahora: no se vuelve a mostrar. Si se pierde, revócala y genera otra.',
        })
      }

      return error('Método no permitido en /llaves', 405)
    }

    // ══════════════════════════════════════════════════
    // Resto de la API - autenticación por x-api-key
    // ══════════════════════════════════════════════════
    const llave = req.headers.get('x-api-key')
    if (!llave) {
      return error('Falta el header "x-api-key".', 401)
    }

    const { data: registro } = await admin
      .from('api_llaves')
      .select('id, nombre, permisos, activa, usos')
      .eq('llave_hash', await sha256(llave))
      .maybeSingle()

    if (!registro || !registro.activa) {
      return error('Llave de API inválida o revocada.', 401)
    }

    // Se registra el uso sin bloquear la respuesta
    admin.from('api_llaves').update({
      ultimo_uso: new Date().toISOString(),
      usos: (registro.usos ?? 0) + 1,
    }).eq('id', registro.id).then(() => {})

    const puede = (permiso: string) => (registro.permisos ?? []).includes(permiso)

    // ── GET /me ──
    if (recurso === 'me' && req.method === 'GET') {
      return respond({
        nombre: registro.nombre,
        permisos: registro.permisos,
        activa: registro.activa,
      })
    }

    // ── GET /property_types ──
    if (recurso === 'property_types' && req.method === 'GET') {
      return respond({ tipos: TIPOS, operaciones: OPERACIONES, estatus: ESTATUS })
    }

    // ── /properties ──
    if (recurso === 'properties') {
      // POST /properties - recibir inventario
      if (req.method === 'POST') {
        if (!puede('propiedades:escribir')) {
          return error('Esta llave no tiene permiso de escritura.', 403)
        }

        const body = await req.json().catch(() => null)
        if (body === null) return error('El cuerpo debe ser JSON válido.', 400)

        const entrada: unknown = Array.isArray(body) ? body : (body.propiedades ?? body.properties)
        if (!Array.isArray(entrada)) {
          return error('Manda un arreglo de propiedades, o un objeto { "propiedades": [...] }.', 400)
        }
        if (entrada.length > 500) {
          return error('Máximo 500 propiedades por petición. Manda el resto en otra llamada.', 400)
        }

        const filas: Record<string, unknown>[] = []
        const errores: { indice: number; id?: string; error: string }[] = []

        entrada.forEach((p, indice) => {
          if (!p || typeof p !== 'object') {
            errores.push({ indice, error: 'No es un objeto.' })
            return
          }
          const r = validar(p as Record<string, unknown>)
          if ('error' in r) {
            errores.push({ indice, id: String((p as Record<string, unknown>).id ?? ''), error: r.error })
          } else {
            filas.push(r.fila)
          }
        })

        // Amarrar cada propiedad al perfil de su asesor (para su micrositio)
        const correos = [...new Set(
          filas.map((f) => (f._asesor_email ? String(f._asesor_email).toLowerCase() : null))
            .filter(Boolean) as string[],
        )]
        const porCorreo = new Map<string, string>()
        if (correos.length) {
          const { data } = await admin.from('profiles').select('id, email').in('email', correos)
          for (const pr of data ?? []) {
            if (pr.email) porCorreo.set(String(pr.email).toLowerCase(), pr.id)
          }
        }

        // Si la misma petición trae el mismo id repetido, nos quedamos con
        // el último: mandar duplicados en un upsert hace fallar a Postgres.
        const porId = new Map<string, Record<string, unknown>>()
        for (const f of filas) {
          const correo = f._asesor_email ? String(f._asesor_email).toLowerCase() : null
          delete f._asesor_email
          f.asesor_id = correo ? porCorreo.get(correo) ?? null : null
          porId.set(String(f.fuente_id), f)
        }
        const unicas = [...porId.values()]

        let guardadas = 0
        if (unicas.length) {
          const { error: e, count } = await admin.from('propiedades')
            .upsert(unicas, { onConflict: 'fuente,fuente_id', count: 'exact' })
          if (e) return error('No se pudieron guardar las propiedades: ' + e.message, 500)
          guardadas = count ?? unicas.length
        }

        await admin.from('api_bitacora').insert({
          llave_id: registro.id,
          endpoint: 'POST /properties',
          recibidas: entrada.length,
          guardadas,
          errores,
        })

        return respond({
          ok: errores.length === 0,
          recibidas: entrada.length,
          guardadas,
          duplicadas_en_la_peticion: filas.length - unicas.length,
          rechazadas: errores.length,
          errores,
        }, errores.length && !guardadas ? 400 : 200)
      }

      // GET /properties/:id
      if (req.method === 'GET' && idRuta) {
        if (!puede('propiedades:leer')) return error('Esta llave no tiene permiso de lectura.', 403)
        const { data } = await admin.from('propiedades')
          .select('*').eq('fuente_id', idRuta).eq('fuente', 'command').maybeSingle()
        if (!data) return error('No encontramos esa propiedad.', 404)
        return respond(data)
      }

      // GET /properties
      if (req.method === 'GET') {
        if (!puede('propiedades:leer')) return error('Esta llave no tiene permiso de lectura.', 403)

        const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 20)))
        const desde = (page - 1) * limit

        let q = admin.from('propiedades')
          .select('id, fuente_id, titulo, operacion, estatus, tipo, precio, moneda, municipio, estado, market_center, asesor_nombre, updated_at', { count: 'exact' })
          .order('updated_at', { ascending: false })
          .range(desde, desde + limit - 1)

        const estatus = url.searchParams.get('estatus')
        if (estatus) q = q.in('estatus', estatus.split(',').map((s) => s.trim()))
        const operacion = url.searchParams.get('operacion')
        if (operacion) q = q.eq('operacion', operacion)
        const actualizadoDespues = url.searchParams.get('updated_after')
        if (actualizadoDespues) q = q.gte('updated_at', actualizadoDespues)

        const { data, count, error: e } = await q
        if (e) return error(e.message, 500)
        return respond({ page, limit, total: count ?? 0, propiedades: data ?? [] })
      }

      // DELETE /properties/:id
      if (req.method === 'DELETE' && idRuta) {
        if (!puede('propiedades:escribir')) {
          return error('Esta llave no tiene permiso de escritura.', 403)
        }
        // No se borra: se marca como suspendida, para no perder el
        // histórico ni romper enlaces que ya se hayan compartido.
        const { error: e } = await admin.from('propiedades')
          .update({ estatus: 'suspendida' })
          .eq('fuente', 'command').eq('fuente_id', idRuta)
        if (e) return error(e.message, 500)
        return respond({ ok: true, suspendida: idRuta })
      }
    }

    return error('Endpoint no encontrado: ' + req.method + ' /' + ruta.join('/'), 404)
  } catch (err) {
    return error((err as Error).message || 'Error inesperado', 500)
  }
})
