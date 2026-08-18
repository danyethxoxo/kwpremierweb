// Edge Function: weetrust-webhook
//
// Recibe los avisos de weetrust cuando alguien firma un documento o
// cuando se completa, y actualiza el estado en el sitio.
//
// Sin esto la pantalla nunca se enteraría de nada: habría que estar
// picándole a "actualizar" a mano, y la documentación de weetrust
// desaconseja explícitamente el long polling.
//
// ─────────────────────────────────────────────────────────────
// LAS DOS DECISIONES QUE EXPLICAN CÓMO ESTÁ ESCRITO ESTO
// ─────────────────────────────────────────────────────────────
//
// 1) EL AVISO NO SE CREE, SE VERIFICA.
//
// Esta URL es pública: tiene que serlo, porque weetrust la llama desde
// sus servidores y no tiene manera de traer una sesión de Supabase. O
// sea que cualquiera en internet puede mandarle un POST.
//
// Por eso el cuerpo del aviso NO se usa para decidir el estado. Del
// aviso solo se saca "de qué documento están hablando", y luego se le
// pregunta a weetrust directamente, con nuestras credenciales, cómo
// está ese documento. Así, aunque alguien nos mande un aviso falso
// diciendo "ya se firmó", lo único que logra es que le preguntemos a
// weetrust, que contestará la verdad.
//
// Esto tiene un efecto secundario cómodo: no dependemos de la forma
// exacta del cuerpo que mandan. Si le cambian un campo de nombre, esto
// sigue funcionando.
//
// 2) ADEMÁS, UN SECRETO EN EL ENCABEZADO.
//
// weetrust no firma sus avisos, pero al registrar el webhook deja
// definir encabezados propios (el arreglo "options"). Se aprovecha para
// mandar un secreto compartido y descartar de entrada lo que no venga
// de ellos. Es la primera barrera; la de arriba es la que de verdad
// sostiene.
//
// ─────────────────────────────────────────────────────────────
// CÓMO SE PONE A FUNCIONAR
// ─────────────────────────────────────────────────────────────
// A) Publicar esta función CON LA VERIFICACIÓN DE JWT APAGADA
//    (Dashboard > Edge Functions > weetrust-webhook > Details >
//    "Verify JWT with legacy secret" en OFF). Si se queda encendida,
//    Supabase rechaza los avisos de weetrust antes de que lleguen aquí,
//    porque ellos no mandan un token de Supabase.
//
// B) Inventar un secreto largo al azar y guardarlo en los secrets del
//    proyecto como WEETRUST_WEBHOOK_SECRET.
//
// C) Registrar la URL en weetrust. Eso lo hace la acción
//    'registrar_webhooks' de la función firmar-documento, que solo
//    puede llamar el usuario master.
//
// Nota: este archivo repite el pedir-token de firmar-documento en vez
// de importarlo de un módulo común, a propósito. Las funciones de este
// proyecto se publican pegando el archivo en el Dashboard, y un import
// compartido rompería esa forma de trabajar.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!

const WEETRUST_USER_ID = Deno.env.get('WEETRUST_USER_ID')
const WEETRUST_API_KEY = Deno.env.get('WEETRUST_API_KEY')
const WEETRUST_AMBIENTE = Deno.env.get('WEETRUST_AMBIENTE') || 'sandbox'
const WEBHOOK_SECRET = Deno.env.get('WEETRUST_WEBHOOK_SECRET')

const WEETRUST_URL = WEETRUST_AMBIENTE === 'produccion'
  ? 'https://api.weetrust.mx'
  : 'https://api-sandbox.weetrust.com.mx'

// A dónde manda la campanita cuando avisa que ya firmaron.
const RUTA_FIRMAS = '/hub/firmas.html'

async function obtenerToken(): Promise<string> {
  const res = await fetch(`${WEETRUST_URL}/access/token`, {
    method: 'POST',
    headers: { 'user-id': WEETRUST_USER_ID!, 'api-key': WEETRUST_API_KEY! },
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.responseData?.accessToken) {
    throw new Error(`weetrust no dio token (${res.status})`)
  }
  return json.responseData.accessToken as string
}

// Comparación que tarda lo mismo acierte o no. Con un `===` normal, el
// tiempo de respuesta delata cuántos caracteres del secreto se
// adivinaron, y con suficientes intentos se reconstruye entero.
function igualSinFiltrarTiempo(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let dif = 0
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return dif === 0
}

// Del aviso solo se necesita el identificador del documento. Como no
// dependemos de la forma exacta del cuerpo (ver nota 1 arriba), se
// buscan todas las cadenas que tengan pinta de identificador de
// weetrust (24 caracteres hexadecimales, el formato de Mongo) y después
// se ve cuál de ellas corresponde a un envío nuestro. Si mandan basura,
// simplemente no habrá coincidencia.
function posiblesIdentificadores(crudo: string): string[] {
  const hallados = crudo.match(/[0-9a-f]{24}/gi) || []
  return [...new Set(hallados)]
}

// Le pregunta a weetrust cómo está un documento. Devuelve null si no lo
// reconoce, que es lo normal cuando el identificador salió del aviso por
// casualidad y no corresponde a nada.
async function consultarDocumento(token: string, documentID: string) {
  const res = await fetch(
    `${WEETRUST_URL}/documents?documentID=${encodeURIComponent(documentID)}`,
    { headers: { 'user-id': WEETRUST_USER_ID!, token } },
  )
  const json = await res.json().catch(() => null)
  if (!res.ok || json?.success === false) return null

  const datos = json?.responseData
  const doc = Array.isArray(datos) ? datos[0] : datos
  return doc?.documentID ? doc : null
}

const ESTADOS: Record<string, string> = {
  DRAFT: 'borrador',
  PENDING: 'pendiente',
  COMPLETED: 'completado',
}

function firmantesDe(doc: Record<string, any>) {
  return (Array.isArray(doc?.signatory) ? doc.signatory : []).map((s: Record<string, any>) => ({
    nombre: String(s?.name || s?.emailID || ''),
    correo: String(s?.emailID || '').toLowerCase(),
    // isSigned viene a veces como número y a veces como texto, según el
    // endpoint; se normaliza aquí.
    firmado: Number(s?.isSigned) === 1,
    signatoryID: s?.signatoryID ?? null,
    url_firma: s?.signing?.url ?? null,
    url_expira: s?.signing?.expiry ?? null,
  }))
}

// Crea el renglón de un documento que se mandó desde el panel de
// weetrust y que el sitio todavía no conocía.
async function crearDesdeWeetrust(
  admin: ReturnType<typeof createClient>,
  documentID: string,
  doc: Record<string, any>,
) {
  const archivo = (doc?.documentFileObj ?? {}) as Record<string, unknown>
  const nombre = String(
    doc?.documentName || doc?.name || doc?.title
    || archivo.name || `Documento ${documentID.slice(-6)}`,
  )

  // Quién lo mandó, si weetrust lo dice. Se intenta casar con una cuenta
  // del sitio por el correo: así el documento le aparece a esa persona
  // en su historial y no solo al liderazgo. Si no hay con quién casarlo,
  // se queda sin dueño, que es honesto: lo mandó alguien de fuera.
  const correoCreador = String(doc?.createdBy || doc?.owner || '').toLowerCase() || null
  let dueño: string | null = null
  if (correoCreador) {
    const { data: perfil } = await admin
      .from('profiles').select('id').eq('email', correoCreador).maybeSingle()
    dueño = perfil?.id ?? null
  }

  const estado = ESTADOS[String(doc?.status)] || 'pendiente'
  const cuando = doc?.addedOn
    ? new Date(Number(doc.addedOn)).toISOString()
    : new Date().toISOString()

  const { data, error } = await admin
    .from('firmas_documentos')
    .insert({
      origen: 'importado',
      weetrust_document_id: documentID,
      titulo: nombre,
      nombre_archivo: nombre,
      archivo_ruta: null,
      user_id: dueño,
      creado_por: correoCreador,
      estado,
      firmantes: firmantesDe(doc),
      ambiente: WEETRUST_AMBIENTE,
      pdf_firmado_url: (archivo.url ?? null) as string | null,
      created_at: cuando,
      enviado_at: cuando,
    })
    .select('id, user_id, titulo, estado, firmantes, weetrust_document_id')
    .single()

  if (error) {
    // Puede ser una carrera: dos avisos del mismo documento casi al
    // mismo tiempo, y el segundo choca con el índice único. No es un
    // problema, el renglón ya quedó.
    console.warn(`No se pudo crear ${documentID}: ${error.message}`)
    return null
  }
  return data
}

Deno.serve(async (req: Request) => {
  // Sin CORS a propósito: esto no lo llama un navegador, lo llama el
  // servidor de weetrust. Un navegador no tiene nada que hacer aquí.
  if (req.method !== 'POST') {
    return new Response('Método no permitido', { status: 405 })
  }

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !WEETRUST_USER_ID || !WEETRUST_API_KEY) {
      console.error('Faltan variables de entorno.')
      return new Response('Mal configurado', { status: 500 })
    }

    // ── Primera barrera: el secreto del encabezado ──
    if (!WEBHOOK_SECRET) {
      console.error('Falta WEETRUST_WEBHOOK_SECRET; se rechaza todo hasta configurarlo.')
      return new Response('Mal configurado', { status: 500 })
    }
    const recibido = req.headers.get('x-kw-secreto') || ''
    if (!igualSinFiltrarTiempo(recibido, WEBHOOK_SECRET)) {
      // Se contesta 401 seco, sin explicar qué faltó: a quien esté
      // tanteando no hay por qué darle pistas.
      return new Response('No autorizado', { status: 401 })
    }

    const crudo = await req.text()
    const candidatos = posiblesIdentificadores(crudo)
    if (!candidatos.length) {
      // 200 a propósito: el aviso llegó bien, simplemente no traía nada
      // que reconociéramos. Contestar error haría que weetrust lo
      // reintentara para siempre sin que eso arreglara nada.
      console.warn('Aviso sin identificador reconocible:', crudo.slice(0, 500))
      return new Response('ok', { status: 200 })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: filas } = await admin
      .from('firmas_documentos')
      .select('id, user_id, titulo, estado, firmantes, weetrust_document_id')
      .in('weetrust_document_id', candidatos)

    const token = await obtenerToken()

    // ── Los que todavía no existen aquí ──
    // Un documento mandado desde el panel de weetrust no tiene renglón
    // en el sitio. Antes el aviso se descartaba y ese documento solo
    // aparecía si alguien corría la importación a mano; ahora se crea al
    // vuelo, que es lo que hace que el historial se mantenga solo.
    //
    // Se crea a partir de lo que conteste weetrust, no de lo que traiga
    // el aviso: es la misma regla que para los cambios de estado, y por
    // la misma razón, que esta URL es pública.
    const conocidos = new Set(
      (filas || []).map((f: { weetrust_document_id: string }) => f.weetrust_document_id))
    const nuevos = candidatos.filter((id) => !conocidos.has(id))

    for (const documentID of nuevos) {
      const doc = await consultarDocumento(token, documentID)
      // Si weetrust no lo reconoce, el identificador venía en el aviso
      // por casualidad (cualquier cadena de 24 caracteres hexadecimales
      // entra en el filtro) y no hay nada que crear.
      if (!doc) continue

      const creada = await crearDesdeWeetrust(admin, documentID, doc)
      if (creada) filas!.push(creada)
    }

    if (!filas?.length) return new Response('ok', { status: 200 })

    for (const fila of filas) {
      // ── Segunda barrera, la de verdad: preguntarle a weetrust ──
      const res = await fetch(
        `${WEETRUST_URL}/documents?documentID=${encodeURIComponent(fila.weetrust_document_id!)}`,
        { headers: { 'user-id': WEETRUST_USER_ID, token } },
      )
      const json = await res.json().catch(() => null)
      if (!res.ok || json?.success === false) {
        console.error(`No se pudo consultar ${fila.weetrust_document_id}: ${res.status}`)
        continue
      }

      const datos = json?.responseData
      const doc = Array.isArray(datos) ? datos[0] : datos
      if (!doc) continue

      const suyos = Array.isArray(doc.signatory) ? doc.signatory : []
      const previos = (fila.firmantes || []) as Array<Record<string, unknown>>

      const firmantes = previos.map((f) => {
        const par = suyos.find((s: Record<string, unknown>) =>
          String(s?.emailID || '').toLowerCase() === String(f.correo).toLowerCase())
        if (!par) return f
        // isSigned viene a veces como número y a veces como texto,
        // según el endpoint; se normaliza aquí.
        const firmado = Number(par.isSigned) === 1
        return {
          ...f,
          firmado,
          // La fecha se pone la primera vez que se ve firmado y ya no se
          // toca: si llegan dos avisos del mismo documento, el segundo
          // no debe recorrer la fecha del primero.
          firmado_at: firmado ? (f.firmado_at ?? new Date().toISOString()) : null,
        }
      })

      const estado = ESTADOS[String(doc.status)] || fila.estado

      await admin.from('firmas_documentos')
        .update({
          estado,
          firmantes,
          ...(estado === 'completado'
            ? {
              completado_at: new Date().toISOString(),
              pdf_firmado_url: doc.documentFileObj?.url ?? null,
            }
            : {}),
        })
        .eq('id', fila.id)

      // ── Avisarle a quien lo mandó ──
      // Solo al completarse, y solo si venía de otro estado: weetrust
      // puede mandar varios avisos del mismo hecho, y no hay por qué
      // repetirle la campanita a la persona.
      if (estado === 'completado' && fila.estado !== 'completado') {
        await admin.from('notificaciones').insert({
          user_id: fila.user_id,
          tipo: 'firma',
          titulo: 'Documento firmado',
          mensaje: `Ya se firmó "${fila.titulo}" por todas las partes.`,
          url: RUTA_FIRMAS,
        })
      } else if (estado === 'pendiente') {
        const yaFirmaron = firmantes.filter((f) => f.firmado).length
        const antes = previos.filter((f) => f.firmado).length
        if (yaFirmaron > antes) {
          await admin.from('notificaciones').insert({
            user_id: fila.user_id,
            tipo: 'firma',
            titulo: 'Avance de firma',
            mensaje: `${yaFirmaron} de ${firmantes.length} ya firmaron "${fila.titulo}".`,
            url: RUTA_FIRMAS,
          })
        }
      }
    }

    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error('Error atendiendo el aviso:', (e as Error).message)
    // 500 para que weetrust lo reintente: aquí sí puede ser un problema
    // pasajero nuestro (la base tardó, su API no contestó), a diferencia
    // de los casos de arriba donde reintentar no arreglaría nada.
    return new Response('Error', { status: 500 })
  }
})
