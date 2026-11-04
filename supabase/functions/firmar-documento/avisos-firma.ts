type Firmante = Record<string, unknown>

function identidad(f: Firmante) {
  return String(f.correo || f.signatoryID || f.nombre || '').trim().toLowerCase()
}

export function mensajeAvanceFirma(previos: Firmante[], actuales: Firmante[], titulo: string, completado = false): string | null {
  const firmados = new Set(previos.filter(f => f.firmado).map(identidad))
  const nuevos = actuales.filter(f => f.firmado && !firmados.has(identidad(f)))
  if (!nuevos.length && !completado) return null
  const nombres = [...new Set(nuevos.map(f => String(f.nombre || '').trim() || String(f.correo || '').trim() || 'Un firmante'))]
  const personas = nombres.length > 1 ? nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1] : nombres[0]
  const aviso = personas
    ? `${personas} ya ${nombres.length > 1 ? 'firmaron' : 'firmó'} el contrato "${titulo}".`
    : `El contrato "${titulo}" ya fue firmado por todas las partes.`
  const pendientes = completado ? 0 : actuales.filter(f => !f.firmado).length
  return aviso + (pendientes === 0 ? ' Todas las firmas están completas.' : pendientes === 1 ? ' Aún falta 1 firma.' : ` Aún faltan ${pendientes} firmas.`)
}
