export function documentoAusente(status: number, body: Record<string, unknown> | null): boolean {
  if (status === 404 || status === 410) return true
  return status === 400 && body?.success === false &&
    /^(document not found\.?|documento no encontrado\.?)$/i.test(String(body.message || '').trim())
}

export function documentoEliminado(doc: Record<string, unknown>): boolean {
  return [true, 1, '1', 'true'].includes(doc.isDeleted as boolean | number | string) ||
    String(doc.status || '').toUpperCase() === 'DELETED'
}

export function estadoSincronizado(local: string, remoto: unknown): string {
  // Un listado atrasado no puede deshacer la eliminación ni una firma completa.
  if (['completado', 'eliminado', 'cancelado'].includes(local)) return local
  return ({ DRAFT: 'borrador', PENDING: 'pendiente', COMPLETED: 'completado' } as Record<string, string>)[String(remoto).toUpperCase()] || local
}

export async function leerRetiros(admin: any, ambiente: string): Promise<Set<string>> {
  const ids = new Set<string>()
  for (let inicio = 0; ; inicio += 300) {
    const { data, error } = await admin.from('firmas_documentos_retirados')
      .select('weetrust_document_id').eq('ambiente', ambiente).order('weetrust_document_id').range(inicio, inicio + 299)
    if (error) throw new Error('No se pudo verificar el registro de documentos retirados')
    for (const f of data || []) ids.add(String(f.weetrust_document_id))
    if ((data || []).length < 300) return ids
  }
}
