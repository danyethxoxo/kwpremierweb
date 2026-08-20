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

// Clava cada firma en su lugar del documento.
//
// El sistema de coordenadas de weetrust es el del PDF: puntos a 72 por
// pulgada, con el origen arriba a la izquierda de cada página (una hoja
// carta mide 612 x 792). La pantalla manda justo eso, ya convertido,
// para que aquí no haya que adivinar a qué escala se estaba viendo.
async function fijarFirmas(
  token: string,
  documentID: string,
  posiciones: PosicionFirma[],
) {
  const res = await fetch(`${WEETRUST_URL}/documents/fixed-signatory`, {
    method: 'PUT',
    headers: encabezados(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      documentID,
      staticSignPositions: posiciones.map((p) => ({
        user: { email: p.correo },
        coordinates: { x: Math.round(p.x), y: Math.round(p.y) },
        page: p.pagina,
        // weetrust pide la misma Y en tres campos distintos. Su ejemplo
        // los manda iguales y no documenta en qué se diferencian, así
        // que van iguales: inventar una diferencia sería peor que
        // repetir lo único que sí sabemos que funciona.
        pageY: Math.round(p.y),
        pageYv2: Math.round(p.y),
        color: p.color,
        imageSize: { width: Math.round(p.ancho), height: Math.round(p.alto) },
        parentImageSize: { width: Math.round(p.pagAncho), height: Math.round(p.pagAlto) },
        viewport: { width: Math.round(p.pagAncho), height: Math.round(p.pagAlto) },
      })),
    }),
  })
  return await leerRespuesta(res, 'Fijar las firmas en el documento')
}

// Pide UN documento y comprueba que sea ese.
//
// El endpoint de documentos sirve también de listado: si se le pasa un
// identificador que no existe, ignora el filtro y devuelve la lista
// completa. Tomar el primero y darlo por bueno es lo que llenó el
// historial de copias fantasma, así que aquí se exige que el que vuelve
// sea el que se pidió.
async function pedirDocumento(token: string, documentID: string) {
  const res = await fetch(
    `${WEETRUST_URL}/documents?documentID=${encodeURIComponent(documentID)}`,
    { headers: encabezados(token) },
  )
  const datos = await leerRespuesta(res, 'Consultar el documento')
  const lista = Array.isArray(datos) ? datos : (datos ? [datos] : [])
  return lista.find((d: Record<string, unknown>) => String(d?.documentID) === documentID) || null
}

// Cómo se llama un documento en el panel de weetrust.
//
// Su listado no trae ningún campo de nombre: ni documentName, ni name,
// ni title. El único lugar donde aparece es la URL del archivo, que
// apunta al PDF tal como quedó guardado, con el nombre original y un
// par de marcas de tiempo pegadas al final por ellos:
//
//   .../Murillo_63_T4_D402_2_1786811485570_1786811485570.pdf?X-Amz-...
//
// y en su pantalla ese documento se llama "Murillo_63_T4_D402_2.pdf".
// Así que se saca de ahí: se corta la firma de la URL, se decodifica y
// se le quitan las marcas.
//
// Se piden 13 dígitos exactos, que es lo que mide una marca de tiempo
// en milisegundos y lo seguirá midiendo por siglos. Con "diez o más" un
// archivo que de por sí terminara en un número largo perdería parte de
// su nombre.
function nombreEnWeetrust(doc: Record<string, unknown>, documentID: string): string {
  const archivo = (doc?.documentFileObj ?? {}) as Record<string, unknown>

  const directo = doc?.documentName || doc?.name || doc?.title || archivo.name
  if (directo) return String(directo)

  const url = String(archivo.url || '')
  if (url) {
    try {
      const suelto = decodeURIComponent(url.split('?')[0].split('/').pop() || '')
      const limpio = suelto.replace(/(_\d{13})+(\.[A-Za-z0-9]+)$/, '$2')
      if (limpio) return limpio
    } catch {
      // Una URL que no se puede decodificar no vale un error: se cae al
      // nombre de respaldo, que al menos identifica el documento.
    }
  }

  return `Documento ${documentID.slice(-6)}`
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

type PosicionFirma = {
  correo: string
  pagina: number
  x: number
  y: number
  ancho: number
  alto: number
  pagAncho: number
  pagAlto: number
  color: string
}

// Las coordenadas las calcula la pantalla, así que aquí se revisan antes
// de reenviarlas. Una coordenada disparatada no truena de forma visible:
// weetrust acepta el documento y la firma acaba fuera de la hoja, que se
// descubre hasta que el cliente abre el correo y no encuentra dónde
// firmar.
function limpiarPosiciones(crudo: unknown, correosValidos: string[]): PosicionFirma[] {
  if (!crudo) return []
  if (!Array.isArray(crudo)) throw new Error('Las posiciones de firma vienen mal armadas.')

  return crudo.map((p, i) => {
    const num = (v: unknown, campo: string) => {
      const n = Number(v)
      if (!Number.isFinite(n)) throw new Error(`La firma ${i + 1} trae un ${campo} que no es un número.`)
      return n
    }

    const correo = String(p?.correo || '').trim().toLowerCase()
    if (!correosValidos.includes(correo)) {
      throw new Error(`Hay una firma colocada para "${correo}", que no está entre los firmantes.`)
    }

    const pagAncho = num(p?.pagAncho, 'ancho de página')
    const pagAlto = num(p?.pagAlto, 'alto de página')
    if (pagAncho <= 0 || pagAlto <= 0) {
      throw new Error(`La firma ${i + 1} dice que su página mide cero.`)
    }

    const pagina = Math.trunc(num(p?.pagina, 'número de página'))
    if (pagina < 1) throw new Error(`La firma ${i + 1} apunta a una página que no existe.`)

    const x = num(p?.x, 'posición horizontal')
    const y = num(p?.y, 'posición vertical')
    const ancho = num(p?.ancho, 'ancho')
    const alto = num(p?.alto, 'alto')

    // Que quepa dentro de la hoja. Sin esto, arrastrar el cuadro un poco
    // de más deja la firma en un lugar donde nadie la va a encontrar.
    if (x < 0 || y < 0 || x + ancho > pagAncho + 1 || y + alto > pagAlto + 1) {
      throw new Error(`La firma ${i + 1} quedó fuera de la hoja. Muévela hacia adentro.`)
    }

    // El color solo se usa para pintar el recuadro; se filtra de todos
    // modos porque va directo a la respuesta de weetrust.
    const color = /^#[0-9a-fA-F]{6}$/.test(String(p?.color)) ? String(p.color) : '#FFD247'

    return { correo, pagina, x, y, ancho, alto, pagAncho, pagAlto, color }
  })
}

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

      let posiciones: PosicionFirma[]
      try {
        // Se validan contra los firmantes ya limpios, para que no se
        // pueda colar una firma a nombre de alguien que no está invitado.
        posiciones = limpiarPosiciones(body.posiciones, firmantes.map((f) => f.correo))
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

      const datosFila = {
        origen,
        documento_guardado_id: origen === 'guardado' ? body.documentoId : null,
        documento_plantilla_id: origen === 'plantilla' ? body.documentoId : null,
        archivo_ruta: rutaArchivo,
        nombre_archivo: String(body.nombreArchivo || 'documento.pdf'),
        user_id: userId,
        titulo,
        ambiente: WEETRUST_AMBIENTE,
        firmantes: firmantes.map((f) => ({ ...f, firmado: false })),
        posiciones,
      }

      // Si viene de un borrador se reusa su renglón en vez de crear otro:
      // si no, el borrador se quedaría ahí para siempre y el mismo
      // documento aparecería dos veces en el historial.
      const borradorId = String(body.borradorId || '')
      let fila: { id: string } | null = null

      if (borradorId) {
        const { data: previo } = await admin
          .from('firmas_documentos')
          .select('id, user_id, estado')
          .eq('id', borradorId)
          .single()

        if (!previo) return respond({ error: 'Ese borrador ya no existe.' }, 404)
        if (previo.user_id !== userId) return respond({ error: 'Ese borrador no es tuyo.' }, 403)
        if (previo.estado !== 'borrador') {
          return respond({ error: 'Ese documento ya se había mandado a firma.' }, 409)
        }

        const { error } = await admin.from('firmas_documentos')
          .update({ ...datosFila, estado: 'preparando' })
          .eq('id', borradorId)
        if (error) return respond({ error: `No se pudo retomar el borrador: ${error.message}` }, 500)
        fila = { id: borradorId }
      } else {
        // El renglón se crea ANTES de hablar con weetrust, en
        // 'preparando'. Así, si la subida falla a medias, queda rastro de
        // que se intentó y por qué no se pudo, en vez de que el envío
        // desaparezca sin dejar nada que consultar.
        const { data, error } = await admin
          .from('firmas_documentos')
          .insert(datosFila)
          .select('id')
          .single()
        if (error) return respond({ error: `No se pudo registrar el envío: ${error.message}` }, 500)
        fila = data
      }

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
          .eq('id', fila!.id)

        // Las firmas fijas van ANTES de invitar: weetrust solo las acepta
        // mientras el documento sigue en borrador. Si se manda primero la
        // invitación, las coordenadas ya no se pueden poner y cada quien
        // firmaría donde se le ocurriera.
        if (posiciones.length) {
          await fijarFirmas(token, documentID, posiciones)
        }

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
            imagen: null,
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
          .eq('id', fila!.id)

        return respond({ ok: true, id: fila!.id, documentID, firmantes: conDatos })
      } catch (e) {
        const mensajeError = (e as Error).message || String(e)
        await admin.from('firmas_documentos')
          .update({ estado: 'error', error_mensaje: mensajeError })
          .eq('id', fila!.id)
        return respond({ error: mensajeError, id: fila!.id }, 502)
      }
    }

    // ── Guardar un envío a medias ──
    // No toca weetrust: no manda correos, no crea nada de su lado y no
    // hay nada que se pueda cobrar. Solo guarda lo que se lleva armado
    // para poder retomarlo.
    //
    // Por lo mismo aquí NO se revisa el tope del mes: un borrador no
    // gasta. El tope se revisa al mandarlo, que es cuando cuenta.
    if (accion === 'guardar_borrador') {
      const rutaArchivo = String(body.archivoRuta || '').trim()
      if (!rutaArchivo) return respond({ error: 'Falta el archivo.' }, 400)

      // La ruta la manda el navegador, así que hay que comprobar que sea
      // suya y no la de otro.
      if (!rutaArchivo.startsWith(`${userId}/`)) {
        return respond({ error: 'Ese archivo no es tuyo.' }, 403)
      }

      const titulo = String(body.titulo || '').trim()
      if (!titulo) return respond({ error: 'Ponle un título antes de guardarlo.' }, 400)

      // A diferencia del envío, aquí los firmantes pueden ir a medias:
      // se está guardando justamente porque falta algo. Solo se limpia
      // lo que sí venga completo, y lo demás se guarda tal cual para que
      // al reabrirlo esté como se dejó.
      const crudos = Array.isArray(body.firmantes) ? body.firmantes : []
      const firmantes = crudos.map((f: Record<string, unknown>) => ({
        nombre: String(f?.nombre || '').trim(),
        correo: String(f?.correo || '').trim().toLowerCase(),
        identificacion: String(f?.identificacion || '') || undefined,
        check: f?.check === true ? true : undefined,
        firmado: false,
      }))

      // Las posiciones se guardan sin validar contra los firmantes: en un
      // borrador es normal tener una firma colocada para alguien cuyo
      // correo todavía no se escribe. La validación de verdad ocurre al
      // mandarlo.
      const posicionesCrudas = Array.isArray(body.posiciones) ? body.posiciones : []

      const datos = {
        origen: 'subido',
        archivo_ruta: rutaArchivo,
        nombre_archivo: String(body.nombreArchivo || 'documento.pdf'),
        user_id: userId,
        titulo,
        estado: 'borrador',
        ambiente: WEETRUST_AMBIENTE,
        firmantes,
        posiciones: posicionesCrudas,
      }

      const borradorId = String(body.borradorId || '')
      if (borradorId) {
        const { data: previo } = await admin
          .from('firmas_documentos')
          .select('id, user_id, estado, archivo_ruta')
          .eq('id', borradorId)
          .single()

        if (!previo) return respond({ error: 'Ese borrador ya no existe.' }, 404)
        if (previo.user_id !== userId) return respond({ error: 'Ese borrador no es tuyo.' }, 403)
        if (previo.estado !== 'borrador') {
          return respond({ error: 'Ese documento ya se mandó a firma.' }, 409)
        }

        // Si se cambiaron los documentos, el PDF anterior ya no le sirve
        // a nadie: sin renglón que lo apunte no lo podría abrir nadie
        // nunca más, así que se va con el cambio.
        if (previo.archivo_ruta && previo.archivo_ruta !== rutaArchivo) {
          await admin.storage.from('firmas').remove([previo.archivo_ruta])
        }

        const { error } = await admin.from('firmas_documentos')
          .update(datos).eq('id', borradorId)
        if (error) return respond({ error: `No se pudo guardar: ${error.message}` }, 500)
        return respond({ ok: true, id: borradorId })
      }

      const { data, error } = await admin
        .from('firmas_documentos').insert(datos).select('id').single()
      if (error) return respond({ error: `No se pudo guardar: ${error.message}` }, 500)
      return respond({ ok: true, id: data.id })
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
      const doc = await pedirDocumento(token, fila.weetrust_document_id)
      if (!doc) return respond({ error: 'weetrust ya no reconoce ese documento.' }, 404)

      // Su "isSigned" viene a veces como número y a veces como texto,
      // según el endpoint; se normaliza aquí para que la pantalla no
      // tenga que adivinar.
      const suyos = Array.isArray(doc?.signatory) ? doc.signatory : []
      const firmantes = (fila.firmantes as Array<Record<string, unknown>>).map((f) => {
        const par = suyos.find((s: Record<string, unknown>) =>
          String(s?.emailID || '').toLowerCase() === String(f.correo).toLowerCase())
        if (!par) return f
        return {
          ...f,
          firmado: Number(par.isSigned) === 1,
          // El trazo de la firma. El PDF que entrega weetrust no la trae
          // dibujada: su pantalla la superpone, y aquí hace falta para
          // poder hacer lo mismo en la vista previa.
          imagen: par.imageURL || f.imagen || null,
        }
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

    // ── Ver crudo lo que manda weetrust de un documento ──
    // Dos veces se dio por hecho dónde venía el trazo de la firma y dos
    // veces salió mal: primero se supuso que el PDF ya lo traía dibujado,
    // luego que estaba en 'imageURL'. En vez de una tercera suposición,
    // esto devuelve tal cual el JSON de un documento para ver qué campos
    // trae de verdad cuando alguien ya firmó.
    //
    // Solo master, y solo para leer: no toca ni guarda nada. Las llaves
    // largas (el PDF en base64, si viniera) se recortan para que la
    // respuesta se pueda leer en la consola.
    if (accion === 'espiar') {
      const { data: perfil } = await admin
        .from('profiles').select('role').eq('id', userId).single()
      if (String(perfil?.role) !== 'master') {
        return respond({ error: 'Esto solo lo puede hacer el usuario master.' }, 403)
      }

      let documentID = String(body.weetrust_document_id || '')
      if (!documentID) {
        const id = String(body.id || '')
        if (!id) return respond({ error: 'Falta el identificador del envío.' }, 400)
        const { data: fila } = await admin
          .from('firmas_documentos')
          .select('weetrust_document_id')
          .eq('id', id)
          .single()
        documentID = String(fila?.weetrust_document_id || '')
      }
      if (!documentID) return respond({ error: 'Ese envío nunca llegó a weetrust.' }, 409)

      const token = await obtenerToken()
      const doc = await pedirDocumento(token, documentID)
      if (!doc) return respond({ error: 'weetrust ya no reconoce ese documento.' }, 404)

      // Un valor de texto larguísimo casi siempre es un archivo metido
      // en el propio JSON. Se deja el principio, que es lo que dice de
      // qué se trata, y se anota cuánto medía.
      const recortar = (valor: unknown): unknown => {
        if (typeof valor === 'string' && valor.length > 300) {
          return `${valor.slice(0, 300)}… [${valor.length} caracteres]`
        }
        if (Array.isArray(valor)) return valor.map(recortar)
        if (valor && typeof valor === 'object') {
          const salida: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
            salida[k] = recortar(v)
          }
          return salida
        }
        return valor
      }

      const firmantesCrudos = Array.isArray(doc?.signatory) ? doc.signatory : []
      return respond({
        ok: true,
        documentID,
        status: doc?.status ?? null,
        // La lista de campos de cada firmante, aparte del contenido, para
        // poder comparar de un vistazo cuáles aparecen solo en los que ya
        // firmaron.
        campos_por_firmante: firmantesCrudos.map((s: Record<string, unknown>) => ({
          correo: s?.emailID ?? null,
          isSigned: s?.isSigned ?? null,
          llaves: Object.keys(s || {}).sort(),
        })),
        firmantes: recortar(firmantesCrudos),
        documento: recortar(doc),
      })
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

      // Se intenta retirar de weetrust, pero que ellos no dejen no
      // impide marcarlo como cancelado aquí.
      //
      // El caso que lo hace necesario: los documentos que se trajeron de
      // su panel los creó otra cuenta de weetrust, y su API no siempre
      // deja borrar lo que creó alguien más. Antes eso abortaba todo y
      // el documento se quedaba igual, sin que se pudiera hacer nada
      // desde el sitio. Ahora al menos se saca del camino aquí, y el
      // aviso dice con todas sus letras que allá sigue vivo.
      let avisoWeetrust: string | null = null
      if (fila.weetrust_document_id) {
        try {
          const token = await obtenerToken()
          await borrarDocumento(token, fila.weetrust_document_id)
        } catch (e) {
          avisoWeetrust = (e as Error).message
        }
      }

      await admin.from('firmas_documentos')
        .update({ estado: 'cancelado' })
        .eq('id', id)

      return respond({ ok: true, aviso: avisoWeetrust })
    }

    // ── Volver a mandarles el correo ──
    // weetrust se lo manda solo a quienes falten de firmar, así que a
    // quien ya firmó no le llega nada.
    if (accion === 'reenviar') {
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
        if (!['master', 'admin', 'staff'].includes(String(perfil?.role))) {
          return respond({ error: 'Ese envío no es tuyo.' }, 403)
        }
      }

      if (!fila.weetrust_document_id) {
        return respond({ error: 'Ese envío nunca llegó a weetrust.' }, 409)
      }
      if (fila.estado !== 'pendiente') {
        return respond({
          error: 'Solo se le puede insistir a un documento que sigue esperando firmas.',
        }, 409)
      }

      // El documento va en la query y no en el cuerpo: así lo pide su
      // documentación para este endpoint, a diferencia de los demás.
      const token = await obtenerToken()
      try {
        const res = await fetch(
          `${WEETRUST_URL}/documents/resend-email`
            + `?documentID=${encodeURIComponent(fila.weetrust_document_id)}`,
          { method: 'PUT', headers: encabezados(token) },
        )
        await leerRespuesta(res, 'Reenviar el correo')
      } catch (e) {
        return respond({ error: (e as Error).message }, 502)
      }

      return respond({
        ok: true,
        aviso: 'Se volvió a mandar el correo a quienes faltan de firmar.',
      })
    }

    // ── Borrar un envío del historial ──
    // Distinto de cancelar: cancelar lo retira de firma y deja el
    // renglón como constancia; borrar lo quita del historial.
    if (accion === 'borrar') {
      const id = String(body.id || '')
      if (!id) return respond({ error: 'Falta el identificador del envío.' }, 400)

      const { data: fila } = await admin
        .from('firmas_documentos')
        .select('id, user_id, estado, weetrust_document_id, archivo_ruta')
        .eq('id', id)
        .single()

      if (!fila) return respond({ error: 'Ese envío no existe.' }, 404)

      const { data: perfil } = await admin
        .from('profiles').select('role').eq('id', userId).single()
      const esLiderazgo = ['master', 'admin', 'staff'].includes(String(perfil?.role))
      if (fila.user_id !== userId && !esLiderazgo) {
        return respond({ error: 'Ese envío no es tuyo.' }, 403)
      }

      // Un documento firmado por todas las partes es la constancia de lo
      // que se firmó. weetrust lo sella en su blockchain justamente para
      // que no se pueda borrar, y borrar nuestro renglón dejaría al
      // Market Center sin rastro de un contrato que sí existe.
      if (fila.estado === 'completado') {
        return respond({
          error: 'Un documento ya firmado no se puede borrar: es la constancia de la firma.',
        }, 409)
      }

      let avisoWeetrust: string | null = null
      if (fila.weetrust_document_id) {
        try {
          const token = await obtenerToken()
          await borrarDocumento(token, fila.weetrust_document_id)
        } catch (e) {
          // Si allá sigue vivo, su webhook lo volvería a crear aquí en
          // cuanto alguien firme. Se avisa para que no parezca que el
          // borrado no sirvió.
          avisoWeetrust = (e as Error).message
        }
      }

      // El PDF original se va con él: sin renglón que lo apunte, ese
      // archivo no lo podría abrir nadie nunca más.
      if (fila.archivo_ruta) {
        await admin.storage.from('firmas').remove([fila.archivo_ruta])
      }

      const { error } = await admin.from('firmas_documentos').delete().eq('id', id)
      if (error) return respond({ error: `No se pudo borrar: ${error.message}` }, 500)

      return respond({ ok: true, aviso: avisoWeetrust })
    }

    // ── Registrar los webhooks en weetrust ──
    // Se hace una sola vez por ambiente, y de nuevo si cambia la URL de
    // la función o el secreto. Vive aquí y no en un curl a mano porque
    // registrar exige un token que dura 5 minutos, y porque el secreto
    // no debe andar dando vueltas en la terminal de nadie.
    // ── Poner al día todos los envíos de una pasada ──
    // Normalmente el estado lo mantiene el webhook solo. Esto es para
    // cuando hace falta alcanzar lo que se quedó atrás: avisos que no
    // llegaron, o datos que antes no se guardaban (el trazo de la firma,
    // sin ir más lejos).
    //
    // Se pide la lista completa de una vez en vez de preguntar documento
    // por documento. Con cientos de renglones lo segundo se pasa del
    // tiempo de la función y del token, que dura 5 minutos: ese mismo
    // patrón ya causó un problema con la limpieza.
    if (accion === 'actualizar_todos') {
      const { data: perfil } = await admin
        .from('profiles').select('role').eq('id', userId).single()
      const esLiderazgo = ['master', 'admin', 'staff'].includes(String(perfil?.role))

      // El asesor pone al día los suyos; el liderazgo, los de todos.
      let q = admin
        .from('firmas_documentos')
        .select('id, user_id, estado, firmantes, weetrust_document_id, titulo, nombre_archivo')
        .not('weetrust_document_id', 'is', null)
      if (!esLiderazgo) q = q.eq('user_id', userId)

      const { data: filas } = await q
      if (!filas?.length) return respond({ ok: true, revisados: 0, actualizados: 0 })

      const token = await obtenerToken()
      const porId = new Map<string, Record<string, any>>()
      const POR_TANDA = 100

      try {
        for (let vuelta = 0; vuelta < 20; vuelta++) {
          const url = `${WEETRUST_URL}/documents?status=ALL`
            + `&limit=${POR_TANDA}&skip=${vuelta * POR_TANDA}`
          const res = await fetch(url, { headers: encabezados(token) })
          const datos = await leerRespuesta(res, 'Pedir el historial de weetrust')
          const tanda = Array.isArray(datos) ? datos : (datos ? [datos] : [])
          if (!tanda.length) break

          let novedades = 0
          for (const d of tanda) {
            const id = String((d as Record<string, unknown>)?.documentID || '')
            if (!id || porId.has(id)) continue
            porId.set(id, d as Record<string, any>)
            novedades++
          }
          if (!novedades || tanda.length < POR_TANDA) break
        }
      } catch (e) {
        return respond({ error: `weetrust no contestó: ${(e as Error).message}` }, 502)
      }

      const estados: Record<string, string> = {
        DRAFT: 'borrador',
        PENDING: 'pendiente',
        COMPLETED: 'completado',
      }

      const cambios: Array<{ id: string; datos: Record<string, unknown> }> = []

      for (const fila of filas) {
        const doc = porId.get(fila.weetrust_document_id!)
        if (!doc) continue

        const suyos = Array.isArray(doc.signatory) ? doc.signatory : []
        const previos = (fila.firmantes || []) as Array<Record<string, any>>

        const firmantes = previos.map((f) => {
          const par = suyos.find((sg: Record<string, any>) =>
            String(sg?.emailID || '').toLowerCase() === String(f.correo).toLowerCase())
          if (!par) return f
          const firmado = Number(par.isSigned) === 1
          return {
            ...f,
            firmado,
            // La fecha se pone la primera vez que se ve firmado y ya no
            // se toca, para no recorrerla en cada actualización.
            firmado_at: firmado ? (f.firmado_at ?? new Date().toISOString()) : null,
            // El trazo. Es lo que faltaba en los documentos de antes de
            // que se empezara a guardar.
            imagen: par.imageURL || f.imagen || null,
            url_firma: par.signing?.url ?? f.url_firma ?? null,
            url_expira: par.signing?.expiry ?? f.url_expira ?? null,
          }
        })

        const estado = estados[String(doc.status)] || fila.estado
        const archivo = (doc.documentFileObj ?? {}) as Record<string, unknown>

        // ── El nombre de weetrust, para los que quedaron con el de
        //    respaldo ──
        // La importación no sabía sacarlo y les puso "Documento a1b2c3".
        // Aquí se corrige, pero SOLO si el guardado sigue siendo ese
        // respaldo: un nombre que alguien haya escrito o corregido a
        // mano vale más que el de allá y no se pisa.
        const deRespaldo = (s: unknown) => /^Documento [0-9a-f]{6}$/i.test(String(s ?? ''))
        const nombre = nombreEnWeetrust(doc, fila.weetrust_document_id!)
        const renombrar = !deRespaldo(nombre)
          ? {
            ...(deRespaldo(fila.titulo) ? { titulo: nombre } : {}),
            ...(deRespaldo(fila.nombre_archivo) ? { nombre_archivo: nombre } : {}),
          }
          : {}

        cambios.push({
          id: fila.id,
          datos: {
            estado,
            firmantes,
            pdf_firmado_url: (archivo.url as string) ?? null,
            ...renombrar,
            ...(estado === 'completado' ? { completado_at: new Date().toISOString() } : {}),
          },
        })
      }

      let actualizados = 0
      // De diez en diez en paralelo: uno por uno con cientos de renglones
      // se hace eterno.
      for (let i = 0; i < cambios.length; i += 10) {
        const trozo = cambios.slice(i, i + 10)
        const res = await Promise.all(trozo.map((c) =>
          admin.from('firmas_documentos').update(c.datos).eq('id', c.id)))
        res.forEach((r: { error: unknown }) => { if (!r.error) actualizados++ })
      }

      return respond({
        ok: true,
        revisados: filas.length,
        enWeetrust: porId.size,
        actualizados,
      })
    }

    // ── La versión de weetrust del documento ──
    // Su copia va cambiando: al firmar alguien, la firma queda dibujada
    // en el PDF. La nuestra es la que se subió y nunca cambia, así que
    // para la vista previa conviene la de ellos.
    //
    // La URL se pide al momento y no se guarda: viene firmada y con
    // caducidad, así que una guardada de ayer no sirve hoy.
    if (accion === 'url_documento') {
      const id = String(body.id || '')
      if (!id) return respond({ error: 'Falta el identificador del envío.' }, 400)

      const { data: fila } = await admin
        .from('firmas_documentos')
        .select('id, user_id, weetrust_document_id')
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
      if (!fila.weetrust_document_id) return respond({ ok: true, url: null })

      const token = await obtenerToken()
      const doc = await pedirDocumento(token, fila.weetrust_document_id)
      const archivo = (doc?.documentFileObj ?? {}) as Record<string, unknown>
      return respond({ ok: true, url: (archivo.url as string) ?? null })
    }

    // ── Quitar los renglones fantasma ──
    // Hubo un momento en que el webhook creaba un documento por cada
    // cadena de 24 caracteres que viniera en el aviso, porque el endpoint
    // de weetrust devolvía la lista completa cuando el identificador no
    // existía y se tomaba el primero. De un solo envío salían diez o
    // quince copias.
    //
    // La primera versión de esta limpieza preguntaba por cada documento
    // uno por uno y trataba cualquier fallo como "no existe". Eso borró
    // documentos buenos: el token de weetrust dura 5 minutos, así que a
    // media revisión de cientos de renglones se vencía y todo lo que
    // venía después se daba por fantasma.
    //
    // Ahora se pide la lista completa de una vez y se borra solo lo que
    // NO esté en ella. Si la lista no se puede traer, no se borra nada:
    // no poder comprobar algo no es lo mismo que comprobar que no está.
    if (accion === 'limpiar_fantasmas') {
      const { data: perfil } = await admin
        .from('profiles').select('role').eq('id', userId).single()
      if (!['master', 'admin'].includes(String(perfil?.role))) {
        return respond({ error: 'Esto solo lo puede hacer el equipo de liderazgo.' }, 403)
      }

      const { data: filas } = await admin
        .from('firmas_documentos')
        .select('id, titulo, weetrust_document_id')
        .eq('origen', 'importado')
        .not('weetrust_document_id', 'is', null)

      if (!filas?.length) return respond({ ok: true, revisados: 0, sobran: 0, borrados: 0 })

      // Los identificadores que weetrust reconoce hoy.
      const token = await obtenerToken()
      const reales = new Set<string>()
      const POR_TANDA = 100

      try {
        for (let vuelta = 0; vuelta < 20; vuelta++) {
          const url = `${WEETRUST_URL}/documents?status=ALL`
            + `&limit=${POR_TANDA}&skip=${vuelta * POR_TANDA}`
          const res = await fetch(url, { headers: encabezados(token) })
          const datos = await leerRespuesta(res, 'Pedir el historial de weetrust')
          const tanda = Array.isArray(datos) ? datos : (datos ? [datos] : [])
          if (!tanda.length) break

          let novedades = 0
          for (const d of tanda) {
            const id = String((d as Record<string, unknown>)?.documentID || '')
            if (!id || reales.has(id)) continue
            reales.add(id)
            novedades++
          }
          if (!novedades || tanda.length < POR_TANDA) break
        }
      } catch (e) {
        return respond({
          error: `No se pudo pedir la lista a weetrust, así que no se borró nada: ${(e as Error).message}`,
        }, 502)
      }

      // Si la lista vino vacía es que algo anda mal de su lado: borrar
      // todo el historial porque no contestaron sería el peor resultado
      // posible.
      if (!reales.size) {
        return respond({
          error: 'weetrust no devolvió ningún documento. No se borró nada, por si acaso.',
        }, 502)
      }

      const sobran = filas.filter((f: { weetrust_document_id: string }) =>
        !reales.has(f.weetrust_document_id))

      // Por defecto solo se informa. Borrar de verdad exige una segunda
      // llamada con el visto bueno, para que quien la corre vea primero
      // cuántos se van a ir.
      if (body.confirmado !== true) {
        return respond({
          ok: true,
          revisados: filas.length,
          enWeetrust: reales.size,
          sobran: sobran.length,
          borrados: 0,
          nombres: sobran.slice(0, 20).map((f: { titulo: string }) => f.titulo),
        })
      }

      if (sobran.length) {
        const { error } = await admin.from('firmas_documentos')
          .delete().in('id', sobran.map((f: { id: string }) => f.id))
        if (error) return respond({ error: `No se pudieron borrar: ${error.message}` }, 500)
      }

      return respond({
        ok: true,
        revisados: filas.length,
        enWeetrust: reales.size,
        sobran: sobran.length,
        borrados: sobran.length,
      })
    }


    // ── Traer el historial que ya existe en weetrust ──
    // El Market Center llevaba tiempo mandando documentos desde el panel
    // de weetrust, antes de que existiera esta pantalla. Esto los copia
    // para que el historial del sitio no arranque a medias.
    //
    // Es idempotente: se puede volver a correr cuantas veces se quiera.
    // Los que ya están se actualizan y los que no, se crean; nunca se
    // duplican, porque el identificador de weetrust es único en la tabla.
    if (accion === 'importar') {
      const { data: perfil } = await admin
        .from('profiles').select('role').eq('id', userId).single()
      if (!['master', 'admin'].includes(String(perfil?.role))) {
        return respond({ error: 'Esto solo lo puede hacer el equipo de liderazgo.' }, 403)
      }

      const token = await obtenerToken()

      // ── Pedir el historial, por tandas ──
      // Se guarda por identificador y no en una lista para que un
      // documento repetido no se procese dos veces.
      const porId = new Map<string, Record<string, unknown>>()
      const POR_TANDA = 100
      let vueltas = 0

      for (let vuelta = 0; vuelta < 20; vuelta++) {
        vueltas++
        const url = `${WEETRUST_URL}/documents?status=ALL`
          + `&limit=${POR_TANDA}&skip=${vuelta * POR_TANDA}`
        const res = await fetch(url, { headers: encabezados(token) })
        const datos = await leerRespuesta(res, 'Pedir el historial de weetrust')

        const tanda = Array.isArray(datos) ? datos : (datos ? [datos] : [])
        if (!tanda.length) break

        // Si esta tanda no trae ni un identificador que no tuviéramos, es
        // que weetrust está ignorando el "skip" y nos devuelve siempre lo
        // mismo. Sin esta salida, el ciclo daba sus 20 vueltas juntando
        // los mismos documentos una y otra vez.
        let novedades = 0
        for (const doc of tanda) {
          const id = String((doc as Record<string, unknown>)?.documentID || '')
          if (!id || porId.has(id)) continue
          porId.set(id, doc as Record<string, unknown>)
          novedades++
        }
        if (!novedades || tanda.length < POR_TANDA) break
      }

      const estados: Record<string, string> = {
        DRAFT: 'borrador',
        PENDING: 'pendiente',
        COMPLETED: 'completado',
      }

      // ── Armar los renglones ──
      const armados = [...porId.entries()].map(([documentID, doc]) => {
        const firmantes = (Array.isArray(doc?.signatory) ? doc.signatory : [])
          .map((s: Record<string, any>) => ({
            nombre: String(s?.name || s?.emailID || ''),
            correo: String(s?.emailID || '').toLowerCase(),
            firmado: Number(s?.isSigned) === 1,
            signatoryID: s?.signatoryID ?? null,
            url_firma: s?.signing?.url ?? null,
            url_expira: s?.signing?.expiry ?? null,
            imagen: s?.imageURL || null,
          }))

        // El archivo viene anidado y su forma no está documentada del
        // todo, así que se saca a una variable con tipo suelto en vez de
        // ir encadenando accesos sobre algo que TypeScript no conoce.
        const archivoDoc = (doc?.documentFileObj ?? {}) as Record<string, unknown>

        // El mismo nombre con el que aparece en el panel de weetrust,
        // para poder buscar allá lo que se ve aquí.
        const nombre = nombreEnWeetrust(doc, documentID)

        const estado = estados[String(doc?.status)] || 'pendiente'
        // La fecha que importa es la de allá, no la de ahora: si se
        // guardara la de la importación, todo el historial aparecería
        // creado el mismo día y se perdería el orden real.
        const cuando = doc?.addedOn
          ? new Date(Number(doc.addedOn)).toISOString()
          : new Date().toISOString()

        return {
          documentID,
          estado,
          firmantes,
          pdfUrl: (archivoDoc.url ?? null) as string | null,
          fila: {
            origen: 'importado',
            weetrust_document_id: documentID,
            titulo: nombre,
            nombre_archivo: nombre,
            archivo_ruta: null,
            // Se deja sin dueño y más abajo se deduce por los
            // firmantes: ponerle el de quien corre la importación haría
            // que todo el historial apareciera a su nombre, que es
            // justo lo que no sirve para nada.
            user_id: null as string | null,
            creado_por: String(doc?.createdBy || doc?.owner || '') || null,
            estado,
            firmantes,
            ambiente: WEETRUST_AMBIENTE,
            pdf_firmado_url: (archivoDoc.url ?? null) as string | null,
            created_at: cuando,
            ...(estado === 'completado' ? { completado_at: cuando } : {}),
          },
        }
      })

      if (!armados.length) {
        return respond({ ok: true, encontrados: 0, nuevos: 0, actualizados: 0, problemas: [] })
      }

      // ── Qué ya teníamos ──
      // Una sola consulta para todos. Antes se preguntaba documento por
      // documento, y con un historial grande eran cientos de idas y
      // vueltas seguidas: la función se quedaba colgada hasta que se le
      // acababa el tiempo.
      const { data: existentes, error: errBusca } = await admin
        .from('firmas_documentos')
        .select('id, weetrust_document_id')
        .in('weetrust_document_id', armados.map((a) => a.documentID))

      if (errBusca) {
        return respond({ error: `No se pudo revisar lo que ya estaba: ${errBusca.message}` }, 500)
      }

      const yaEstaban = new Map(
        (existentes || []).map((e: { weetrust_document_id: string; id: string }) =>
          [e.weetrust_document_id, e.id] as [string, string]))
      const problemas: string[] = []

      // ── De quién es cada uno ──
      // weetrust no dice quién creó el documento en su listado, así que
      // se deduce por los firmantes: el correo del equipo que aparece y
      // que no es de los frecuentes. Se hace en la base, con la misma
      // función que corrigió los que ya estaban, para que no haya dos
      // criterios distintos según por dónde entró el documento.
      await Promise.all(armados.map(async (a) => {
        const { data } = await admin
          .rpc('firmas_adivinar_asesor', { p_firmantes: a.fila.firmantes })
        a.fila.user_id = (data as string | null) ?? null
      }))

      // ── Los nuevos, de un golpe ──
      const paraInsertar = armados.filter((a) => !yaEstaban.has(a.documentID))
      let nuevos = 0
      // De 200 en 200: un insert con miles de renglones puede pasarse
      // del tamaño que aguanta la petición.
      for (let i = 0; i < paraInsertar.length; i += 200) {
        const trozo = paraInsertar.slice(i, i + 200).map((a) => a.fila)
        const { error } = await admin.from('firmas_documentos').insert(trozo)
        if (error) problemas.push(`Al guardar ${trozo.length} documentos: ${error.message}`)
        else nuevos += trozo.length
      }

      // ── Los que ya estaban ──
      // Solo se refresca lo que cambia con el tiempo. El título y la
      // fecha no se pisan: si alguien ya los corrigió a mano aquí,
      // volver a importar no debe deshacerlo.
      //
      // Van de 10 en 10 en paralelo: uno por uno, con un historial
      // grande, es justo lo que hacía que esto no terminara nunca.
      const paraActualizar = armados.filter((a) => yaEstaban.has(a.documentID))
      let actualizados = 0
      for (let i = 0; i < paraActualizar.length; i += 10) {
        const trozo = paraActualizar.slice(i, i + 10)
        const results = await Promise.all(trozo.map((a) =>
          admin.from('firmas_documentos')
            .update({ estado: a.estado, firmantes: a.firmantes, pdf_firmado_url: a.pdfUrl })
            .eq('id', yaEstaban.get(a.documentID)!)))
        results.forEach((r: { error: { message: string } | null }, j: number) => {
          if (r.error) problemas.push(`${trozo[j].fila.titulo}: ${r.error.message}`)
          else actualizados++
        })
      }

      return respond({
        ok: true,
        encontrados: armados.length,
        vueltas,
        nuevos,
        actualizados,
        problemas: problemas.slice(0, 10),
      })
    }


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
