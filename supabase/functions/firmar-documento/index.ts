// Edge Function: firmar-documento
//
// Manda documentos a firma electrónica con weetrust y consulta cómo van.
//
// Todo el trato con weetrust pasa por aquí, nunca por el navegador. La
// razón es simple: la api-key da control total de la cuenta de firma del
// Market Center, y este sitio es estático y público (GitHub Pages), así
// que cualquier cosa que el navegador necesite saber, se puede leer.
// Aquí la llave vive en los secrets del proyecto y nunca sale.
//
// Por lo mismo la tabla firmas_documentos está cerrada a escritura desde
// el cliente: esta función, con la llave de servicio, es la única que la
// mueve. Si el navegador pudiera escribirla, cualquiera marcaría un
// contrato como "completado" sin que nadie lo hubiera firmado.
//
// ─────────────────────────────────────────────────────────────
// CÓMO SE PONE A FUNCIONAR (una sola vez)
// ─────────────────────────────────────────────────────────────
// A) Correr la migración supabase/sql/051_firmas_weetrust.sql
//
// B) Sacar credenciales de weetrust. Son DISTINTAS por ambiente y no se
//    cruzan: un documento creado en sandbox no existe en producción.
//      sandbox:    https://sandbox.weetrust.com.mx/home/register
//      producción: https://app.weetrust.mx/home/register
//    Están en Configuración > Perfil, ya dentro de la cuenta.
//
// C) Project Settings > Edge Functions > Secrets:
//      WEETRUST_USER_ID    el user-id de la cuenta
//      WEETRUST_API_KEY    la api-key (se puede regenerar cuando quieras;
//                          si se regenera, hay que actualizarla aquí)
//      WEETRUST_AMBIENTE   'sandbox' o 'produccion'. Por defecto sandbox,
//                          a propósito: equivocarse hacia el lado que no
//                          manda correos a clientes reales ni cobra.
//
// Ya existen y se reusan: SUPABASE_URL, SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!

const WEETRUST_USER_ID = Deno.env.get('WEETRUST_USER_ID')
const WEETRUST_API_KEY = Deno.env.get('WEETRUST_API_KEY')
const WEETRUST_AMBIENTE = Deno.env.get('WEETRUST_AMBIENTE') || 'sandbox'

const WEETRUST_URL = WEETRUST_AMBIENTE === 'produccion'
  ? 'https://api.weetrust.mx'
  : 'https://api-sandbox.weetrust.com.mx'

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

// ── Hablar con weetrust ─────────────────────────────────────

// Su token dura 5 minutos, así que no vale la pena guardarlo: para
// cuando llegue la siguiente petición probablemente ya venció, y el
// manejo del vencimiento costaría más que volver a pedirlo. Se pide uno
// nuevo en cada invocación, igual que hace proceso-alta con Google.
async function obtenerToken(): Promise<string> {
  const res = await fetch(`${WEETRUST_URL}/access/token`, {
    method: 'POST',
    headers: {
      'user-id': WEETRUST_USER_ID!,
      'api-key': WEETRUST_API_KEY!,
    },
  })

  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.responseData?.accessToken) {
    // El cuerpo del error se incluye tal cual porque weetrust distingue
    // entre credenciales mal puestas y cuenta sin plan activo, y desde
    // fuera esos dos casos se ven igual.
    throw new Error(`weetrust no dio token (${res.status}): ${JSON.stringify(json)}`)
  }
  return json.responseData.accessToken as string
}

// Todo endpoint de weetrust quiere los mismos dos encabezados de
// identidad, más el token recién pedido.
function encabezados(token: string, extra: Record<string, string> = {}) {
  return {
    'user-id': WEETRUST_USER_ID!,
    token,
    ...extra,
  }
}

// weetrust contesta 200 con success:false en algunos casos, así que no
// basta con mirar el código HTTP.
async function leerRespuesta(res: Response, queHacia: string) {
  const json = await res.json().catch(() => null)
  if (!res.ok || json?.success === false) {
    const detalle = typeof json?.message === 'string'
      ? json.message
      : JSON.stringify(json?.message ?? json)
    throw new Error(`${queHacia} falló (${res.status}): ${detalle}`)
  }
  return json?.responseData ?? {}
}

// Sube el PDF. Va como multipart, que es lo único que aceptan: no hay
// forma de mandarles una URL ni base64.
async function subirDocumento(token: string, archivo: Blob, nombre: string) {
  const form = new FormData()
  form.append('document', archivo, nombre)

  const res = await fetch(`${WEETRUST_URL}/documents`, {
    method: 'POST',
    // Sin Content-Type a propósito: fetch lo pone solo, con el "boundary"
    // que multipart necesita. Ponerlo a mano rompe la petición.
    headers: encabezados(token),
    body: form,
  })
  return await leerRespuesta(res, 'Subir el documento')
}

// Manda las invitaciones. weetrust se encarga de los correos y devuelve
// una liga personal de firma por persona.
async function enviarAFirma(
  token: string,
  documentID: string,
  titulo: string,
  mensaje: string,
  firmantes: Array<{ nombre: string; correo: string; identificacion?: string; check?: boolean; orden?: number }>,
  enOrden: boolean,
) {
  const res = await fetch(`${WEETRUST_URL}/documents/signatory`, {
    method: 'PUT',
    headers: encabezados(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      documentID,
      title: titulo,
      message: mensaje,
      hasOrder: enOrden,
      signatory: firmantes.map((f, i) => ({
        emailID: f.correo,
        name: f.nombre,
        // Solo se manda si se pidió: mandarlo vacío no es lo mismo que
        // no mandarlo, y esto se cobra por firmante.
        ...(f.identificacion ? { identification: f.identificacion } : {}),
        ...(f.check ? { check: true } : {}),
        ...(enOrden ? { order: f.orden ?? i + 1 } : {}),
      })),
    }),
  })
  return await leerRespuesta(res, 'Enviar a firma')
}

// Borra un documento en weetrust. Solo funciona mientras esté en
// borrador o pendiente: los completados quedan sellados en su blockchain
// y ya no se pueden quitar, ni por ellos ni por nosotros.
async function borrarDocumento(token: string, documentID: string) {
  const res = await fetch(
    `${WEETRUST_URL}/documents?documentID=${encodeURIComponent(documentID)}`,
    { method: 'DELETE', headers: encabezados(token) },
  )
  return await leerRespuesta(res, 'Borrar el documento')
}

// Un PDF mínimo, armado a mano, para la prueba de conexión. Se genera
// aquí en vez de traer una librería porque lo único que tiene que hacer
// es ser un PDF válido que weetrust acepte; nadie lo va a leer.
//
// Los desplazamientos de la tabla xref se calculan sobre la marcha: un
// PDF con offsets mal puestos lo abren algunos lectores por indulgencia,
// pero un validador estricto lo rechaza, y entonces la prueba fallaría
// por culpa del archivo y no por lo que queremos medir.
function pdfDePrueba(): Blob {
  const objetos = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]'
      + '/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ]
  // Sin acentos a propósito: todo el archivo se mide en caracteres, y
  // eso solo coincide con los bytes reales mientras sea ASCII.
  const texto = 'BT /F1 12 Tf 72 720 Td (Prueba de conexion KW Premier) Tj ET'
  objetos.push(`<</Length ${texto.length}>>stream\n${texto}\nendstream`)

  let cuerpo = '%PDF-1.4\n'
  const offsets: number[] = []
  objetos.forEach((o, i) => {
    offsets.push(cuerpo.length)
    cuerpo += `${i + 1} 0 obj${o}endobj\n`
  })

  const inicioXref = cuerpo.length
  cuerpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) cuerpo += `${String(off).padStart(10, '0')} 00000 n \n`
  cuerpo += `trailer<</Size ${objetos.length + 1}/Root 1 0 R>>\n`
    + `startxref\n${inicioXref}\n%%EOF\n`

  return new Blob([cuerpo], { type: 'application/pdf' })
}

// ── Validación de lo que manda el navegador ─────────────────

// Nunca se confía en lo que llega: el correo se usa para que weetrust
// mande una invitación a firmar un contrato, así que uno mal formado no
// es un detalle cosmético.
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Las verificaciones de identidad que acepta weetrust. Se cobran aparte
// y bastante más caro que el documento mismo, así que la lista se
// valida contra estos valores en vez de reenviar lo que llegue: un
// valor inventado no se rechazaría, se cobraría.
const VERIFICACIONES = ['id', 'face', 'ocr', 'face_login']

type Firmante = { nombre: string; correo: string; identificacion?: string; check?: boolean }

function limpiarFirmantes(crudo: unknown): Firmante[] {
  if (!Array.isArray(crudo)) throw new Error('Falta la lista de firmantes.')

  const firmantes = crudo.map((f, i) => {
    const nombre = String(f?.nombre || '').trim()
    // Se quitan espacios y caracteres invisibles de todo el texto, no
    // solo de las orillas: al pegar un correo desde Word o WhatsApp se
    // cuelan espacios de ancho cero que no se ven pero lo invalidan.
    const correo = String(f?.correo || '').replace(/[\u200B\u200C\u200D\uFEFF\s]/g, '').toLowerCase()

    if (!nombre) throw new Error(`Al firmante ${i + 1} le falta el nombre.`)
    if (!RE_CORREO.test(correo)) throw new Error(`El correo de ${nombre} no es válido: "${correo}"`)

    const identificacion = String(f?.identificacion || '').trim()
    if (identificacion && !VERIFICACIONES.includes(identificacion)) {
      throw new Error(`Verificación de identidad desconocida para ${nombre}: "${identificacion}"`)
    }

    // weetrust solo hace el Background Check junto con la verificación
    // facial. Pedirlo suelto no falla de forma visible: se acepta el
    // envío y el check simplemente no ocurre, así que se cobraría algo
    // que no se hizo. Mejor rechazarlo aquí.
    const check = f?.check === true
    if (check && identificacion !== 'face') {
      throw new Error(`El Background Check de ${nombre} necesita también la verificación facial.`)
    }

    if (!identificacion) return { nombre, correo }
    return check ? { nombre, correo, identificacion, check } : { nombre, correo, identificacion }
  })

  if (!firmantes.length) throw new Error('Hay que indicar al menos un firmante.')
  if (firmantes.length > 20) throw new Error('Son demasiados firmantes para un solo documento.')

  // Un correo repetido hace que weetrust mande dos invitaciones a la
  // misma persona y que el documento nunca se complete, porque espera
  // dos firmas que la pantalla muestra como una.
  const vistos = new Set<string>()
  for (const f of firmantes) {
    if (vistos.has(f.correo)) throw new Error(`El correo ${f.correo} está repetido.`)
    vistos.add(f.correo)
  }

  return firmantes
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return respond({ error: 'Método no permitido' }, 405)

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return respond({ error: 'Faltan variables de entorno del proyecto.' }, 500)
    }
    if (!WEETRUST_USER_ID || !WEETRUST_API_KEY) {
      return respond({
        error: 'Falta configurar las credenciales de weetrust en los secrets del proyecto.',
      }, 500)
    }

    // ── Quién llama ──
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!jwt) return respond({ error: 'No autenticado' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: quien, error: errQuien } = await admin.auth.getUser(jwt)
    if (errQuien || !quien?.user) return respond({ error: 'Sesión inválida' }, 401)
    const userId = quien.user.id

    const body = await req.json().catch(() => ({}))
    const accion = String(body.accion || 'enviar')

    // ── Mandar un documento a firma ──
    if (accion === 'enviar') {
      const origen = String(body.origen || 'subido')
      if (!['subido', 'guardado', 'plantilla'].includes(origen)) {
        return respond({ error: 'Origen de documento no reconocido.' }, 400)
      }

      const rutaArchivo = String(body.archivoRuta || '').trim()
      if (!rutaArchivo) return respond({ error: 'Falta el archivo.' }, 400)

      // La ruta la manda el navegador, así que hay que comprobar que sea
      // suya y no la de otro. Sin esto, cualquiera con sesión podría
      // mandar a firmar el contrato de un compañero con sus propios
      // firmantes, nada más adivinando la ruta.
      if (!rutaArchivo.startsWith(`${userId}/`)) {
        return respond({ error: 'Ese archivo no es tuyo.' }, 403)
      }

      const titulo = String(body.titulo || '').trim()
      if (!titulo) return respond({ error: 'Falta el título del documento.' }, 400)

      let firmantes: Array<{ nombre: string; correo: string }>
      try {
        firmantes = limpiarFirmantes(body.firmantes)
      } catch (e) {
        return respond({ error: (e as Error).message }, 400)
      }

      const enOrden = body.enOrden === true
      const mensaje = String(body.mensaje || '').trim()
        || 'Se le solicita la firma del siguiente documento.'

      // ── El tope del mes ──
      // El candado va aquí y no en la pantalla: esconder el botón no
      // impide que alguien llame a la función por su cuenta. Se consulta
      // con la llave de servicio pasando el usuario explícito, porque
      // auth.uid() no existe en esta conexión.
      const { data: cupo, error: errCupo } = await admin
        .rpc('firmas_disponibles', { p_user: userId })
      if (errCupo) {
        return respond({ error: `No se pudo revisar tu tope: ${errCupo.message}` }, 500)
      }
      if (cupo && !cupo.sin_tope && Number(cupo.restantes) <= 0) {
        return respond({
          error: `Ya usaste tus ${cupo.limite} documentos de este mes.`
            + ' Pídele al equipo de liderazgo que te suba el tope si necesitas más.',
          cupo,
        }, 429)
      }

      // El renglón se crea ANTES de hablar con weetrust, en 'preparando'.
      // Así, si la subida falla a medias, queda rastro de que se intentó
      // y por qué no se pudo, en vez de que el envío desaparezca sin
      // dejar nada que consultar.
      const { data: fila, error: errAlta } = await admin
        .from('firmas_documentos')
        .insert({
          origen,
          documento_guardado_id: origen === 'guardado' ? body.documentoId : null,
          documento_plantilla_id: origen === 'plantilla' ? body.documentoId : null,
          archivo_ruta: rutaArchivo,
          nombre_archivo: String(body.nombreArchivo || 'documento.pdf'),
          user_id: userId,
          titulo,
          ambiente: WEETRUST_AMBIENTE,
          firmantes: firmantes.map((f) => ({ ...f, firmado: false })),
        })
        .select('id')
        .single()

      if (errAlta) return respond({ error: `No se pudo registrar el envío: ${errAlta.message}` }, 500)

      try {
        // El PDF se baja del bucket con la llave de servicio. El bucket
        // es privado, así que esta es la única manera de leerlo sin
        // exponer una URL pública de un contrato.
        const { data: archivo, error: errBaja } = await admin
          .storage.from('firmas').download(rutaArchivo)
        if (errBaja || !archivo) throw new Error(`No se pudo leer el archivo: ${errBaja?.message}`)

        const token = await obtenerToken()

        const subido = await subirDocumento(token, archivo, String(body.nombreArchivo || 'documento.pdf'))
        const documentID = subido?.documentID
        if (!documentID) throw new Error('weetrust no devolvió un documentID.')

        // El documentID se guarda de inmediato, antes de invitar. Si el
        // envío de invitaciones truena, el expediente YA existe allá y
        // sin esto quedaría huérfano: nadie podría reintentar ni
        // borrarlo, y seguiría contando contra el plan.
        await admin.from('firmas_documentos')
          .update({ weetrust_document_id: documentID, estado: 'borrador' })
          .eq('id', fila.id)

        const enviado = await enviarAFirma(token, documentID, titulo, mensaje, firmantes, enOrden)

        // weetrust regresa la lista de firmantes con su signatoryID y su
        // liga personal. Se casa por correo con lo que capturó el
        // usuario, porque el orden de vuelta no tiene por qué ser el
        // mismo que el de ida.
        const suyos = Array.isArray(enviado?.signatory) ? enviado.signatory : []
        const conDatos = firmantes.map((f) => {
          const par = suyos.find((s: Record<string, unknown>) =>
            String(s?.emailID || '').toLowerCase() === f.correo)
          return {
            ...f,
            firmado: false,
            signatoryID: par?.signatoryID ?? null,
            url_firma: par?.signing?.url ?? null,
            // weetrust manda cuándo deja de servir la liga. Se guarda
            // para poder avisar que caducó, en vez de que alguien se la
            // pase a un cliente y el cliente se tope con un error.
            url_expira: par?.signing?.expiry ?? null,
          }
        })

        await admin.from('firmas_documentos')
          .update({
            estado: 'pendiente',
            firmantes: conDatos,
            enviado_at: new Date().toISOString(),
          })
          .eq('id', fila.id)

        return respond({ ok: true, id: fila.id, documentID, firmantes: conDatos })
      } catch (e) {
        const mensajeError = (e as Error).message || String(e)
        await admin.from('firmas_documentos')
          .update({ estado: 'error', error_mensaje: mensajeError })
          .eq('id', fila.id)
        return respond({ error: mensajeError, id: fila.id }, 502)
      }
    }

    // ── Consultar cómo va ──
    // Normalmente el estado lo actualiza el webhook solo. Esto es el
    // respaldo para cuando un aviso se perdió: lo dispara el botón de
    // "actualizar" de la pantalla, no un temporizador. La documentación
    // de weetrust desaconseja explícitamente el long polling.
    if (accion === 'consultar') {
      const id = String(body.id || '')
      if (!id) return respond({ error: 'Falta el identificador del envío.' }, 400)

      const { data: fila } = await admin
        .from('firmas_documentos')
        .select('id, user_id, weetrust_document_id, firmantes')
        .eq('id', id)
        .single()

      if (!fila) return respond({ error: 'Ese envío no existe.' }, 404)
      if (fila.user_id !== userId) {
        const { data: perfil } = await admin
          .from('profiles').select('role').eq('id', userId).single()
        if (!['master', 'admin', 'staff'].includes(String(perfil?.role))) {
          return respond({ error: 'Ese envío no es tuyo.' }, 403)
        }
      }
      if (!fila.weetrust_document_id) return respond({ error: 'Ese envío nunca llegó a weetrust.' }, 409)

      const token = await obtenerToken()
      const res = await fetch(
        `${WEETRUST_URL}/documents?documentID=${encodeURIComponent(fila.weetrust_document_id)}`,
        { headers: encabezados(token) },
      )
      const datos = await leerRespuesta(res, 'Consultar el documento')
      const doc = Array.isArray(datos) ? datos[0] : datos

      // Su "isSigned" viene a veces como número y a veces como texto,
      // según el endpoint; se normaliza aquí para que la pantalla no
      // tenga que adivinar.
      const suyos = Array.isArray(doc?.signatory) ? doc.signatory : []
      const firmantes = (fila.firmantes as Array<Record<string, unknown>>).map((f) => {
        const par = suyos.find((s: Record<string, unknown>) =>
          String(s?.emailID || '').toLowerCase() === String(f.correo).toLowerCase())
        return par ? { ...f, firmado: Number(par.isSigned) === 1 } : f
      })

      const estados: Record<string, string> = {
        DRAFT: 'borrador',
        PENDING: 'pendiente',
        COMPLETED: 'completado',
      }
      const estado = estados[String(doc?.status)] || 'pendiente'

      await admin.from('firmas_documentos')
        .update({
          estado,
          firmantes,
          ...(estado === 'completado'
            ? {
              completado_at: new Date().toISOString(),
              pdf_firmado_url: doc?.documentFileObj?.url ?? null,
            }
            : {}),
        })
        .eq('id', id)

      return respond({ ok: true, estado, firmantes })
    }

    // ── Prueba de conexión, sin mandar nada a firma ──
    // Comprueba credenciales, token, subida y borrado, que es toda la
    // plomería salvo la invitación. Se para justo antes de invitar a
    // nadie a propósito: ese es el paso que manda correos y, con toda
    // probabilidad, el que consume del plan. Lo que sube lo borra en
    // seguida, así que no deja basura en la cuenta.
    if (accion === 'prueba') {
      const { data: perfil } = await admin
        .from('profiles').select('role').eq('id', userId).single()
      if (String(perfil?.role) !== 'master') {
        return respond({ error: 'Esto solo lo puede hacer el usuario master.' }, 403)
      }

      const pasos: Array<{ paso: string; ok: boolean; detalle?: string }> = []
      let token = ''
      let documentID = ''

      try {
        token = await obtenerToken()
        pasos.push({ paso: 'Pedir el token de acceso', ok: true })
      } catch (e) {
        pasos.push({ paso: 'Pedir el token de acceso', ok: false, detalle: (e as Error).message })
        return respond({ ok: false, ambiente: WEETRUST_AMBIENTE, pasos })
      }

      try {
        const subido = await subirDocumento(token, pdfDePrueba(), 'prueba-kw.pdf')
        documentID = String(subido?.documentID || '')
        if (!documentID) throw new Error('No devolvieron documentID.')
        pasos.push({ paso: 'Subir un PDF', ok: true, detalle: documentID })
      } catch (e) {
        pasos.push({ paso: 'Subir un PDF', ok: false, detalle: (e as Error).message })
        return respond({ ok: false, ambiente: WEETRUST_AMBIENTE, pasos })
      }

      try {
        await borrarDocumento(token, documentID)
        pasos.push({ paso: 'Borrar el PDF de prueba', ok: true })
      } catch (e) {
        // Que no se pueda borrar no invalida la prueba, pero hay que
        // decirlo con el identificador para poder quitarlo a mano desde
        // el panel de weetrust y que no quede colgado.
        pasos.push({
          paso: 'Borrar el PDF de prueba',
          ok: false,
          detalle: `${(e as Error).message}. Bórralo a mano: ${documentID}`,
        })
      }

      return respond({
        ok: pasos.every((p) => p.ok),
        ambiente: WEETRUST_AMBIENTE,
        aviso: 'No se envió nada a firma, así que no se invitó a nadie.',
        pasos,
      })
    }

    // ── Cancelar un envío ──
    // weetrust solo deja borrar documentos en borrador o pendiente. Los
    // completados quedan sellados en su blockchain y ya no se tocan, ni
    // desde aquí ni desde su panel.
    if (accion === 'cancelar') {
      const id = String(body.id || '')
      if (!id) return respond({ error: 'Falta el identificador del envío.' }, 400)

      const { data: fila } = await admin
        .from('firmas_documentos')
        .select('id, user_id, estado, weetrust_document_id')
        .eq('id', id)
        .single()

      if (!fila) return respond({ error: 'Ese envío no existe.' }, 404)

      if (fila.user_id !== userId) {
        const { data: perfil } = await admin
          .from('profiles').select('role').eq('id', userId).single()
        if (!['master', 'admin'].includes(String(perfil?.role))) {
          return respond({ error: 'Ese envío no es tuyo.' }, 403)
        }
      }

      if (fila.estado === 'completado') {
        return respond({
          error: 'Ese documento ya se firmó por completo y no se puede cancelar.',
        }, 409)
      }

      if (fila.weetrust_document_id) {
        const token = await obtenerToken()
        try {
          await borrarDocumento(token, fila.weetrust_document_id)
        } catch (e) {
          return respond({ error: `weetrust no lo dejó borrar: ${(e as Error).message}` }, 502)
        }
      }

      await admin.from('firmas_documentos')
        .update({ estado: 'cancelado' })
        .eq('id', id)

      return respond({ ok: true })
    }

    // ── Registrar los webhooks en weetrust ──
    // Se hace una sola vez por ambiente, y de nuevo si cambia la URL de
    // la función o el secreto. Vive aquí y no en un curl a mano porque
    // registrar exige un token que dura 5 minutos, y porque el secreto
    // no debe andar dando vueltas en la terminal de nadie.
    if (accion === 'registrar_webhooks') {
      const { data: perfil } = await admin
        .from('profiles').select('role').eq('id', userId).single()
      if (String(perfil?.role) !== 'master') {
        return respond({ error: 'Esto solo lo puede hacer el usuario master.' }, 403)
      }

      const secreto = Deno.env.get('WEETRUST_WEBHOOK_SECRET')
      if (!secreto) {
        return respond({
          error: 'Falta WEETRUST_WEBHOOK_SECRET en los secrets del proyecto.',
        }, 500)
      }

      const urlWebhook = `${SUPABASE_URL}/functions/v1/weetrust-webhook`
      const token = await obtenerToken()

      // Un registro por evento: weetrust no permite suscribirse a varios
      // de una vez. 'sendDocument' se incluye para confirmar que las
      // invitaciones salieron; sin él, un envío que weetrust acepta pero
      // nunca despacha se vería igual que uno que sí salió.
      const eventos = ['sendDocument', 'signDocument', 'completedDocument']
      const resultados: Record<string, string> = {}

      for (const tipo of eventos) {
        try {
          const url = `${WEETRUST_URL}/webhooks`
            + `?url=${encodeURIComponent(urlWebhook)}&type=${tipo}`
          const res = await fetch(url, {
            method: 'POST',
            headers: encabezados(token, { 'Content-Type': 'application/json' }),
            // Así es como el aviso se vuelve verificable: weetrust manda
            // estos encabezados en cada llamada, y la función del webhook
            // rechaza lo que no traiga el secreto.
            body: JSON.stringify({ options: [{ key: 'x-kw-secreto', value: secreto }] }),
          })
          const datos = await leerRespuesta(res, `Registrar el webhook de ${tipo}`)
          resultados[tipo] = datos?.webhookID ? `ok (${datos.webhookID})` : 'ok'
        } catch (e) {
          // Se sigue con los demás en vez de abortar: que falle uno no
          // es razón para quedarse sin los otros dos, y así el reporte
          // dice exactamente cuál se atoró.
          resultados[tipo] = `falló: ${(e as Error).message}`
        }
      }

      return respond({ ok: true, url: urlWebhook, ambiente: WEETRUST_AMBIENTE, resultados })
    }

    return respond({ error: `Acción no reconocida: ${accion}` }, 400)
  } catch (e) {
    return respond({ error: (e as Error).message || 'Error inesperado' }, 500)
  }
})
