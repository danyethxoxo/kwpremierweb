export function sincronizarFirmantes(previos: Array<Record<string, any>>, suyos: Array<Record<string, any>>, ahora: string) {
  const porCorreo = new Map(previos.map((f) => [String(f.correo || '').trim().toLowerCase(), f]))
  const actuales = suyos.map((s) => {
    const correo = String(s.emailID || '').trim().toLowerCase()
    const previo = porCorreo.get(correo) || {}
    const firmado = Number(s.isSigned) === 1
    return {
      ...previo,
      nombre: String(s.name || previo.nombre || correo),
      correo,
      firmado,
      firmado_at: firmado ? (previo.firmado_at || ahora) : null,
      signatoryID: s.signatoryID ?? previo.signatoryID ?? null,
      imagen: s.imageURL || previo.imagen || null,
      url_firma: s.signing?.url ?? previo.url_firma ?? null,
      url_expira: s.signing?.expiry ?? previo.url_expira ?? null,
    }
  })
  const correos = new Set(actuales.map((f) => f.correo))
  return [...actuales, ...previos.filter((f) => !correos.has(String(f.correo || '').trim().toLowerCase()))]
}

export function nombresEtiquetasWeetrust(doc: Record<string, any>): string[] {
  const tags = Array.isArray(doc.tags) ? doc.tags : []
  return [...new Set(tags.map((tag) => typeof tag === 'string' ? tag : tag?.tagName || tag?.name || '')
    .map((nombre) => String(nombre).trim()).filter(Boolean))]
}
