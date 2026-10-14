type Registro = Record<string, any>

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

function imagenSegura(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  if (/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(valor)) return valor
  try { return new URL(valor).protocol === 'https:' ? valor : null } catch { return null }
}

function posicionValida(p: Registro): boolean {
  return Number.isInteger(p.pagina) && p.pagina > 0 &&
    [p.x,p.y,p.ancho,p.alto,p.pagAncho,p.pagAlto].every(Number.isFinite) &&
    p.x >= 0 && p.y >= 0 && p.ancho > 0 && p.alto > 0 && p.pagAncho > 0 && p.pagAlto > 0 &&
    p.x + p.ancho <= p.pagAncho + 1 && p.y + p.alto <= p.pagAlto + 1
}

// Weetrust guarda los campos colocados al firmar en signatory.fieldArray.
// Su page empieza en cero y pageYv2 es la Y dentro de esa hoja, no del visor.
export function posicionesDeWeetrust(doc: Registro, previas: Registro[] = []): Registro[] {
  const resultado: Registro[] = []
  const firmantes = Array.isArray(doc.signatory) ? doc.signatory : []
  const conTrazo = new Set<string>()
  for (const firmante of firmantes) {
    const correo = String(firmante.emailID || '').trim().toLowerCase()
    if (!correo || Number(firmante.isSigned) !== 1) continue
    for (const campo of Array.isArray(firmante.fieldArray) ? firmante.fieldArray : []) {
      if (campo?.type !== 'SIGNATURE') continue
      const escalaOriginal = numero(campo.originalScale)
      const escalaActual = numero(campo.lastScale)
      const originalLeft = numero(campo.originalLeft)
      const xActual = numero(campo.xCoordinate)
      const desplazamiento = numero(campo.offset)
      const p = {
        correo,
        pagina: (numero(campo.page) ?? -1) + 1,
        x: originalLeft !== null && escalaOriginal && escalaActual
          ? originalLeft * escalaActual / escalaOriginal
          : xActual !== null && desplazamiento !== null ? xActual - desplazamiento : null,
        y: numero(campo.pageYv2) ?? (numero(campo.pageY) !== null && escalaOriginal && escalaActual
          ? Number(campo.pageY) * escalaActual / escalaOriginal : null),
        ancho: numero(campo.width), alto: numero(campo.height),
        pagAncho: numero(campo.viewport?.width), pagAlto: numero(campo.viewport?.height),
        imagen: imagenSegura(campo.ref) || imagenSegura(firmante.imageURL),
        color: '#FFD247',
      }
      if (!posicionValida(p)) continue
      resultado.push(p)
      conTrazo.add(correo)
    }
  }
  // Los campos fijos permiten mostrar tambien lo que falta por firmar.
  for (const campo of Array.isArray(doc.staticSignPositions) ? doc.staticSignPositions : []) {
    const correo = String(campo.user?.email || '').trim().toLowerCase()
    if (!correo || conTrazo.has(correo)) continue
    const p = {
      correo, pagina: numero(campo.page),
      x: numero(campo.coordinates?.x), y: numero(campo.pageY) ?? numero(campo.coordinates?.y),
      ancho: numero(campo.imageSize?.width), alto: numero(campo.imageSize?.height),
      pagAncho: numero(campo.parentImageSize?.width), pagAlto: numero(campo.parentImageSize?.height),
      color: typeof campo.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(campo.color) ? campo.color : '#FFD247',
    }
    if (posicionValida(p)) resultado.push(p)
  }
  // No perder los campos locales si el endpoint remoto omite sus posiciones.
  const recuperados = new Set(resultado.map((p) => p.correo))
  return [...resultado, ...previas.filter((p) => !recuperados.has(String(p.correo || '').trim().toLowerCase()))]
}

// Solo se descarga el archivo devuelto por Weetrust, nunca una URL del cliente.
export async function descargarPdfWeetrust(url: unknown, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  if (typeof url !== 'string') throw new Error('Weetrust no devolvio el archivo')
  const destino = new URL(url)
  if (destino.protocol !== 'https:' || destino.username || destino.password || destino.port ||
    !['production-signing-files.s3.amazonaws.com','sandbox-signing-files.s3.amazonaws.com'].includes(destino.hostname)) {
    throw new Error('El archivo no pertenece al almacenamiento de Weetrust')
  }
  const respuesta = await fetcher(destino, {redirect:'error',signal:AbortSignal.timeout(25000)})
  if (!respuesta.ok || !respuesta.body) throw new Error('No se pudo descargar el PDF de Weetrust')
  const limite = 30 * 1024 * 1024
  if (Number(respuesta.headers.get('content-length')) > limite) {
    await respuesta.body.cancel()
    throw new Error('El PDF supera el limite de 30 MB')
  }
  const lector = respuesta.body.getReader()
  const partes: Uint8Array[] = []
  let longitud = 0
  try {
    while (true) {
      const {done,value} = await lector.read()
      if (done) break
      longitud += value.byteLength
      if (longitud > limite) throw new Error('El PDF supera el limite de 30 MB')
      partes.push(value)
    }
  } finally { await lector.cancel().catch(() => {}); lector.releaseLock() }
  const bytes = new Uint8Array(longitud)
  let inicio = 0
  for (const parte of partes) { bytes.set(parte,inicio); inicio += parte.length }
  if (!new TextDecoder().decode(bytes.slice(0,8)).startsWith('%PDF-')) throw new Error('El archivo recibido no es un PDF')
  return bytes
}
