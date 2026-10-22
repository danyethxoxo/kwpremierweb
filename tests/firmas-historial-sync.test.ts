import { leerHistorialCompleto, hayCambios, mismaUbicacionPdf } from '../supabase/functions/firmar-documento/historial-sync.ts'
import { etiquetasDelAviso } from '../supabase/functions/firmar-documento/etiquetas-sync.ts'

const assert = {
  equal(actual: unknown, esperado: unknown) {
    if (actual !== esperado) throw new Error(`Esperado ${esperado}; recibido ${actual}`)
  },
  deepEqual(actual: unknown, esperado: unknown) {
    this.equal(JSON.stringify(actual), JSON.stringify(esperado))
  },
  async rejects(accion: () => Promise<unknown>) {
    let fallo = false
    try { await accion() } catch { fallo = true }
    this.equal(fallo, true)
  },
}

Deno.test('una consulta trae el historial y los documentos nuevos sin limitarse a cien', async () => {
  let consultas = 0
  const resultado = await leerHistorialCompleto(async () => {
    consultas++
    return Array.from({ length: 191 }, (_, i) => ({ documentID: String(i) }))
  })
  assert.equal(resultado.size, 191)
  assert.equal(consultas, 1)
})

Deno.test('recupera todas las páginas aunque weetrust ignore skip', async () => {
  const resultado = await leerHistorialCompleto(async (limite) =>
    Array.from({ length: Math.min(limite, 2100) }, (_, i) => ({ documentID: String(i) })))
  assert.equal(resultado.size, 2100)
})

Deno.test('un error remoto no se convierte en un historial vacío', async () => {
  await assert.rejects(() => leerHistorialCompleto(async () => { throw Error('sin conexión') }))
})

Deno.test('no escribe estados y firmas equivalentes aunque cambie el orden de claves JSON', () => {
  const fila = { estado: 'pendiente', firmantes: [{ correo: 'a@example.test', firmado: false }] }
  assert.equal(hayCambios(fila, { firmantes: [{ firmado: false, correo: 'a@example.test' }], estado: 'pendiente' }), false)
  assert.equal(hayCambios(fila, { firmantes: [{ firmado: true, correo: 'a@example.test' }] }), true)
  assert.equal(mismaUbicacionPdf('https://example.test/a.pdf?token=viejo', 'https://example.test/a.pdf?token=nuevo'), true)
  assert.equal(mismaUbicacionPdf('https://example.test/a.pdf', 'https://example.test/b.pdf'), false)
})

Deno.test('las etiquetas del aviso deben pertenecer al documento verificado y no alteran estado', () => {
  assert.equal(etiquetasDelAviso({ Document: { documentID: 'otro', tags: ['ok'] } }, 'actual'), null)
  assert.deepEqual(etiquetasDelAviso({ Document: { documentID: 'actual', tags: ['ok'], status: 'COMPLETED' } }, 'actual'), { documentID: 'actual', tags: ['ok'] })
  assert.equal(etiquetasDelAviso({ Document: { documentID: 'actual' } }, 'actual'), null)
})
