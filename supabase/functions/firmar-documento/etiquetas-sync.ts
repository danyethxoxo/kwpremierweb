import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'
import { nombresEtiquetasWeetrust } from './firmantes-sync.ts'

export async function etiquetasDeWeetrust(admin: SupabaseClient<any>, documentos: Map<string, Record<string, any>>) {
  const nombres = [...new Set([...documentos.values()].flatMap(nombresEtiquetasWeetrust))]
  const resultado = new Map<string, string[]>()
  if (!nombres.length) return resultado
  const { data, error } = await admin.from('firmas_etiquetas').select('id, nombre')
  if (error) throw new Error(`No se pudieron leer las etiquetas: ${error.message}`)
  const normalizar = (nombre: string) => nombre.trim().toLowerCase()
  const porNombre = new Map((data || []).map((tag) => [normalizar(tag.nombre), String(tag.id)]))
  for (const nombre of nombres) {
    if (porNombre.has(normalizar(nombre))) continue
    const { data: nueva, error: fallo } = await admin.from('firmas_etiquetas')
      .insert({ nombre }).select('id').single()
    if (fallo) {
      // Dos avisos simultáneos pueden intentar registrar la misma etiqueta.
      if (fallo.code !== '23505') throw new Error(`No se pudo recuperar la etiqueta ${nombre}: ${fallo.message}`)
      const { data: actuales, error: lectura } = await admin.from('firmas_etiquetas').select('id,nombre')
      const existente = actuales?.find((e) => normalizar(e.nombre) === normalizar(nombre))
      if (lectura || !existente) throw new Error('No se pudo recuperar la etiqueta concurrente')
      porNombre.set(normalizar(nombre), String(existente.id))
    } else porNombre.set(normalizar(nombre), String(nueva!.id))
  }
  for (const [id, doc] of documentos) {
    resultado.set(id, [...new Set(nombresEtiquetasWeetrust(doc).map((nombre) => porNombre.get(normalizar(nombre))!))])
  }
  return resultado
}

// Solo se usa después de autenticar el webhook y verificar el documento
// por API. Nunca se toman estados ni firmantes del cuerpo del aviso.
export function etiquetasDelAviso(aviso: unknown, documentID: string): Record<string, any> | null {
  if (!aviso || typeof aviso !== 'object') return null
  const cuerpo = aviso as Record<string, any>
  const doc = cuerpo.Document || cuerpo.document || cuerpo.responseData
  if (!doc || String(doc.documentID || doc._id || '') !== documentID || !Array.isArray(doc.tags)) return null
  return { documentID, tags: doc.tags }
}
