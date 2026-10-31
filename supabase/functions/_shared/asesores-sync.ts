type Persona = Record<string, unknown>
type Grupo = {clave:string;hoja:string;personas:Persona[]}
export async function sincronizarLibroAsesores(admin: any, leer:()=>Promise<Grupo[]>) {
  const {data: lease,error: errorLease}=await admin.rpc('asesores_sync_iniciar')
  if(errorLease) throw new Error('No se pudo iniciar la sincronización')
  if(!lease) return {ok:true,ocupado:true}
  try {
    const grupos=await leer()
    const personas=grupos.flatMap(g=>g.personas.map((p):Persona=>({...p,grupo:g.clave,hoja:g.hoja})))
      .filter(p=>String(p.correo||'').trim())
    if(!personas.length) throw new Error('El libro no devolvió asesores con correo; se conserva la base')
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(personas)))
    const huella=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('')
    const {data:control,error: errorControl}=await admin.from('asesores_sync_control').select('huella').eq('id',true).single()
    if(errorControl) throw new Error('No se pudo consultar el estado de sincronización')
    const cambio=control.huella!==huella
    if(cambio) for(let inicio=0;inicio<personas.length;inicio+=20){
      const {error}=await admin.rpc('asesores_sincronizar',{p_personas:personas.slice(inicio,inicio+20)})
      if(error) throw new Error('No se pudo importar el lote '+(inicio+1)+' a '+Math.min(inicio+20,personas.length))
    }
    const ahora=new Date().toISOString()
    const {error}=await admin.from('asesores_sync_control').update({activo:false,terminado_at:ahora,ultimo_error:null,huella,...(cambio?{cambios_at:ahora}:{})}).eq('id',true)
    if(error) throw new Error('No se pudo confirmar la sincronización')
    return {ok:true,cambio,total:personas.length}
  } catch(error) {
    await admin.from('asesores_sync_control').update({activo:false,terminado_at:new Date().toISOString(),ultimo_error:String((error as Error).message).slice(0,500)}).eq('id',true)
    throw error
  }
}
