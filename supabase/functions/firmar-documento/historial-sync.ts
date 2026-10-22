type Documento = Record<string, any>

// Algunos despliegues de weetrust ignoran skip. Si repiten una página,
// se amplía el prefijo solicitado antes de dar el historial por completo.
export async function leerHistorialCompleto(
  pedir: (limite: number, inicio: number) => Promise<Documento[]>,
): Promise<Map<string, Documento>> {
  const documentos = new Map<string, Documento>()
  let limite = 1000, inicio = 0
  for (let vuelta = 0; vuelta < 40; vuelta++) {
    const pagina = await pedir(limite, inicio)
    let nuevos = 0
    for (const doc of pagina) {
      const id = String(doc?.documentID || '')
      if (!id) throw new Error('weetrust devolvió un documento sin identificador')
      if (!documentos.has(id)) nuevos++
      documentos.set(id, doc)
    }
    if (pagina.length && !nuevos) {
      if (limite >= 16000) throw new Error('weetrust repitió el historial; no se usará una lista incompleta')
      limite *= 2
      inicio = 0
      continue
    }
    if (pagina.length < limite) return documentos
    inicio += limite
  }
  throw new Error('No se pudo comprobar el historial completo de weetrust')
}

function estable(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(estable)
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).sort(([a], [b]) => a.localeCompare(b))
      .map(([clave, dato]) => [clave, estable(dato)]))
  }
  return valor
}

export function hayCambios(fila: Documento, datos: Documento): boolean {
  return Object.entries(datos).some(([clave, valor]) =>
    JSON.stringify(estable(fila[clave])) !== JSON.stringify(estable(valor)))
}

// La vista obtiene una URL vigente al abrir el PDF. Renovar solamente
// la firma temporal de la misma URL no debe provocar una escritura.
export function mismaUbicacionPdf(anterior: unknown, siguiente: unknown): boolean {
  if (!anterior || !siguiente) return anterior === siguiente
  try {
    const a = new URL(String(anterior)), b = new URL(String(siguiente))
    return a.origin === b.origin && a.pathname === b.pathname
  } catch { return anterior === siguiente }
}
