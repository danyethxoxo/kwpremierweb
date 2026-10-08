// Repair UTF-8 interpreted as Windows-1252 without re-encoding valid text.
const byteByCharacter = new Map<string, number>()
const legacyDecoder = new TextDecoder('windows-1252')
for (let byte = 128; byte < 256; byte++) {
  byteByCharacter.set(legacyDecoder.decode(new Uint8Array([byte])), byte)
}
const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

export function normalizarTextoCorreo(value: string): string {
  let result = value
  for (let pass = 0; pass < 3; pass++) {
    const repaired = result.replace(/[^\x00-\x7f]+/g, (chunk) => {
      // Only decode a valid byte sequence, leaving legitimate Unicode intact.
      if (!/[\u00c2\u00c3\u00e2\u00f0]/.test(chunk)) return chunk
      const bytes = [...chunk].map((character) => byteByCharacter.get(character))
      if (bytes.some((byte) => byte === undefined)) return chunk
      try { return utf8Decoder.decode(new Uint8Array(bytes as number[])) }
      catch { return chunk }
    })
    if (repaired === result) break
    result = repaired
  }
  return result
}

export function prepararCorreoUtf8<T extends Record<string, unknown>>(mail: T): T {
  const result = { ...mail }
  for (const field of ['subject', 'html', 'text', 'from']) {
    if (typeof result[field] === 'string') {
      (result as Record<string, unknown>)[field] = normalizarTextoCorreo(result[field] as string)
    }
  }
  if (typeof result.html === 'string' && !/<meta\s+charset=/i.test(result.html)) {
    (result as Record<string, unknown>).html = '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>' + result.html + '</body></html>'
  }
  return result
}
