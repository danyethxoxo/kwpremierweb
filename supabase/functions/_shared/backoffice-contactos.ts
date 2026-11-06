export function esBackoffice(grupo: unknown): boolean {
  return /^back[_ ]?office(?:[_ ]|$)/i.test(String(grupo || ''))
}

function clave(texto: unknown): string {
  return String(texto || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
}

export function responsables(texto: unknown): string[] {
  const unicos = new Map<string, string>()
  for (const nombre of String(texto || '').split(';').map(s => s.trim()).filter(Boolean)) {
    if (!unicos.has(clave(nombre))) unicos.set(clave(nombre), nombre)
  }
  return [...unicos.values()]
}

export function agruparBackoffice<T extends {correo?:string;correoPersonal?:string;asesorAsignado?:string}>(personas:T[]):T[] {
  const unicos = new Map<string,T>()
  const salida:T[] = []
  for (const persona of personas) {
    const correo = String(persona.correo || persona.correoPersonal || '').replace(/[\u200B\u200C\u200D\uFEFF\s]/g, '').toLowerCase()
    const anterior = correo ? unicos.get(correo) : undefined
    if (!anterior) {
      const copia = {...persona}
      salida.push(copia)
      if (correo) unicos.set(correo,copia)
    } else {
      anterior.asesorAsignado = responsables([anterior.asesorAsignado,persona.asesorAsignado].filter(Boolean).join('; ')).join('; ')
    }
  }
  return salida
}

export function fichaBackoffice(persona:{asesorAsignado?:string;asesor_asignado?:string}) {
  const nombres = responsables(persona.asesorAsignado ?? persona.asesor_asignado)
  const descripcion = nombres.length ? 'Backoffice de: ' + nombres.join(', ') : ''
  return {organizacion:{name:'KW PREMIER',title:'Backoffice',jobDescription:descripcion},descripcion}
}

// Solo modifica la organización de KW y la línea administrada de las notas.
// Leer primero conserva los datos ajenos y permite detectar ediciones simultáneas.
export async function actualizarFichaBackoffice(token:string,recurso:string,persona:{asesorAsignado?:string;asesor_asignado?:string}):Promise<boolean> {
  if (!/^people\/[a-zA-Z0-9_-]+$/.test(recurso)) throw new Error('Contacto no válido')
  const base='https://people.googleapis.com/v1/'+recurso
  const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'}
  const campos='organizations,biographies,metadata'
  const lectura=await fetch(base+'?personFields='+campos+'&sources=READ_SOURCE_TYPE_CONTACT',{headers,signal:AbortSignal.timeout(15000)})
  if(!lectura.ok)throw new Error('No se pudo leer la ficha de Google Contacts: '+lectura.status)
  const actual=await lectura.json()
  const sources=(actual.metadata?.sources||[]).filter((s:any)=>s.type==='CONTACT')
  if(!sources.length)throw new Error('El contacto no tiene una ficha editable')
  const ficha=fichaBackoffice(persona)
  const organizaciones=(actual.organizations||[]) as Array<Record<string,any>>
  const esKW=(o:Record<string,any>)=>clave(o.name)==='kw premier'
  const existente=organizaciones.find(esKW)
  const organizacion={...(existente||{}),...ficha.organizacion}
  const organizations=existente?organizaciones.map(o=>esKW(o)?{...o,...ficha.organizacion}:o):[...organizaciones,organizacion]
  const anterior=String(actual.biographies?.[0]?.value||'')
  const otrasNotas=anterior.split(/\r?\n/).filter((linea:string)=>!/^Backoffice de:/i.test(linea.trim())).join('\n').trim()
  const notas=[otrasNotas,ficha.descripcion].filter(Boolean).join('\n')
  const cambiarNotas=notas!==anterior
  if(existente && organizaciones.filter(esKW).every(o=>o.title==='Backoffice' && String(o.jobDescription||'')===ficha.descripcion) && !cambiarNotas)return false
  const body:Record<string,unknown>={resourceName:recurso,etag:actual.etag,metadata:{sources},organizations}
  const fields=['organizations']
  if(cambiarNotas){body.biographies=notas?[{value:notas,contentType:actual.biographies?.[0]?.contentType||'TEXT_PLAIN'}]:[];fields.push('biographies')}
  const cambio=await fetch(base+':updateContact?updatePersonFields='+fields.join(',')+'&personFields=organizations,biographies,metadata',{
    method:'PATCH',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
  })
  if(!cambio.ok)throw new Error('Google Contacts no confirmó la actualización: '+cambio.status)
  const confirmado=await cambio.json()
  if(!(confirmado.organizations||[]).some((o:any)=>esKW(o)&&o.title==='Backoffice'&&String(o.jobDescription||'')===ficha.descripcion))throw new Error('Google no confirmó el cargo y los responsables')
  if(cambiarNotas&&String(confirmado.biographies?.[0]?.value||'')!==notas)throw new Error('Google no confirmó las notas')
  return true
}

