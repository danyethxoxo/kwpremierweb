type Resultado = {ok:boolean; detalle?:unknown}
// Solo procesa transiciones guardadas por el trigger; nunca todo el padrón.
export async function procesarAltasGoogle(admin:any, otorgar:(persona:any)=>Promise<Resultado>) {
  const {data:lote,error}=await admin.rpc('asesores_altas_google_tomar')
  if(error) throw new Error('No se pudo consultar las altas pendientes')
  if(!lote) return {ok:true,ocupado:true}
  const resultados=[]
  try {
    for(const tarea of lote.tareas){
      let estado='completo', detalle:unknown=null
      try {
        const {data:persona,error:lectura}=await admin.from('asesores')
          .select('id,nombre,correo,telefono,cumpleanos,grupo').eq('id',tarea.asesor_id).maybeSingle()
        if(lectura) throw new Error('No se pudo comprobar el estado actual del asesor')
        if(!persona || !['asesor_activo','back_office_activo'].includes(persona.grupo)
          || String(persona.correo||'').trim().toLowerCase()!==tarea.correo){
          estado='cancelado'
        } else {
          const resultado=await otorgar({...persona,correo:tarea.correo})
          detalle=resultado.detalle
          if(!resultado.ok) estado='pendiente'
        }
      } catch(error){estado='pendiente';detalle=String((error as Error).message).slice(0,1000)}
      const {error:guardar}=await admin.rpc('asesores_altas_google_finalizar',{
        p_lease:lote.lease,p_asesor:tarea.asesor_id,p_revision:tarea.revision,p_estado:estado,p_detalle:detalle??null,
      })
      if(guardar) throw new Error('No se pudo registrar el resultado del alta de Google')
      resultados.push({estado})
    }
    return {ok:resultados.every(r=>r.estado!=='pendiente'),procesados:resultados.length,resultados}
  } finally {
    const {error:liberar}=await admin.rpc('asesores_altas_google_liberar',{p_lease:lote.lease})
    if(liberar) throw new Error('No se pudo liberar el proceso de altas')
  }
}
