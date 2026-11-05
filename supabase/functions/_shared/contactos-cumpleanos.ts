export type FechaCumpleanos = {day:number; month:number; year?:number}
type Persona = {nombre?:string; correo?:string; cumpleanos?:string}
type Contacto = Record<string, any>

export function fechaCumpleanos(valor:string):FechaCumpleanos|null {
  const s=String(valor||'').trim()
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  let f:FechaCumpleanos
  if(m) f={year:Number(m[1]),month:Number(m[2]),day:Number(m[3])}
  else {
    m=s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?$/)
    if(!m)return null
    f={day:Number(m[1]),month:Number(m[2]),...(m[3]?{year:Number(m[3])}:{})}
  }
  if(f.year!==undefined&&(f.year<1||f.year>9999))return null
  const dias=[31,((f.year||2000)%4===0&&((f.year||2000)%100!==0||(f.year||2000)%400===0))?29:28,31,30,31,30,31,31,30,31,30,31]
  return f.month>=1&&f.month<=12&&f.day>=1&&f.day<=dias[f.month-1]?f:null
}

const correo=(s:unknown)=>String(s||'').trim().toLowerCase()
export function tieneCumpleanos(p:Contacto):boolean {
  return (p.birthdays||[]).some((b:any)=>b.date&&fechaCumpleanos(`${b.date.day}/${b.date.month}${b.date.year?'/'+b.date.year:''}`))
}

export function planCumpleanos(personas:Persona[],contactos:Contacto[]) {
  const porCorreo=new Map<string,Persona[]>()
  for(const p of personas){const c=correo(p.correo);if(c)porCorreo.set(c,[...(porCorreo.get(c)||[]),p])}
  const pendientes:Array<{contacto:Contacto;fecha:FechaCumpleanos;nombre:string;correo:string}>=[]
  const sinFecha:Array<{nombre:string;correo:string}>=[], ambiguos:Array<{nombre:string;correo:string}>=[]
  let yaTienen=0, ajenos=0
  for(const contacto of contactos){
    const asociadas=(contacto.emailAddresses||[]).flatMap((e:any)=>porCorreo.get(correo(e.value))||[]) as Persona[]
    if(!asociadas.length){ajenos++;continue}
    if(tieneCumpleanos(contacto)){yaTienen++;continue}
    const validas=asociadas.map(p=>({p,f:fechaCumpleanos(p.cumpleanos||'')})).filter(x=>x.f)
    const fechas=new Set(validas.map(x=>`${x.f!.month}/${x.f!.day}`))
    const persona=asociadas[0], datos={nombre:persona.nombre||'',correo:correo(persona.correo)}
    if(!validas.length){sinFecha.push(datos);continue}
    if(fechas.size>1){ambiguos.push(datos);continue}
    const completa=validas.find(x=>x.f!.year)||validas[0]
    const anios=new Set(validas.filter(x=>x.f!.year).map(x=>x.f!.year))
    if(anios.size>1){ambiguos.push(datos);continue}
    pendientes.push({contacto,fecha:completa.f!,nombre:datos.nombre,correo:datos.correo})
  }
  return {pendientes,sinFecha,ambiguos,yaTienen,ajenos}
}

async function pedir(token:string,url:string,init:RequestInit={}) {
  const res=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)})
  const json=await res.json().catch(()=>null)
  if(!res.ok)throw new Error(`Google Contacts respondió ${res.status}`)
  return json
}

export async function leerContactosCumpleanos(token:string):Promise<Contacto[]> {
  const personas:Contacto[]=[];let pagina=''
  do {
    const url=new URL('https://people.googleapis.com/v1/people/me/connections')
    url.searchParams.set('personFields','emailAddresses,names,birthdays,metadata')
    url.searchParams.set('pageSize','1000')
    url.searchParams.set('sources','READ_SOURCE_TYPE_CONTACT')
    if(pagina)url.searchParams.set('pageToken',pagina)
    const json=await pedir(token,url.href)
    personas.push(...(json.connections||[]));pagina=json.nextPageToken||''
  }while(pagina)
  return personas
}

export async function completarCumpleanos(token:string,recurso:string,fecha:FechaCumpleanos):Promise<boolean> {
  if(!/^people\/[a-zA-Z0-9_-]+$/.test(recurso))throw new Error('Contacto no válido')
  const base=`https://people.googleapis.com/v1/${recurso}`
  const actual=await pedir(token,base+'?personFields=birthdays,metadata')
  // Leer de nuevo evita pisar una fecha capturada mientras se revisaba el lote.
  if(tieneCumpleanos(actual))return false
  const sources=(actual.metadata?.sources||[]).filter((s:any)=>s.type==='CONTACT')
  if(!sources.length)throw new Error('No se encontró la ficha editable del contacto')
  const resultado=await pedir(token,base+':updateContact?updatePersonFields=birthdays&personFields=birthdays,metadata',{
    method:'PATCH',body:JSON.stringify({resourceName:recurso,etag:actual.etag,metadata:{sources},birthdays:[{date:fecha}]})
  })
  if(!(resultado?.birthdays||[]).some((b:any)=>b.date?.day===fecha.day&&b.date?.month===fecha.month&&(!fecha.year||b.date?.year===fecha.year)))throw new Error('Google no confirmó el cumpleaños guardado')
  return true
}
