type PerfilLiderazgo = { email: string; nombre?: string; apellido?: string; role: string; puesto?: string }
const PC_CONOCIDAS = [
  { nombre: 'Sheila Carol Silva Dritrit', correo: 'carol.silva@kwmexico.mx' },
  { nombre: 'María Almendra Núñez Moreno', correo: 'almendra.nunez@kwmexico.mx' },
  { nombre: 'Maricarmen Cortés Escalante', correo: 'maricarmen.cortes@kwmexico.mx' },
  { nombre: 'Mónica Fernández Rodríguez', correo: 'moni.fernandez@kwmexico.mx' },
]
function identidad(valor: string) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
}
export function destinatariosDictamenLiderazgo(perfiles: PerfilLiderazgo[], coachAsignado: string) {
  const liderazgo = perfiles.filter(p => ['master', 'admin', 'staff'].includes(p.role))
  const correos = liderazgo.filter(p => identidad(p.puesto || '') === 'technology director' || identidad(p.email) === 'dani.guerrero@kwmexico.mx').map(p => identidad(p.email))
  const coach = identidad(coachAsignado)
  const alias = PC_CONOCIDAS.find(p => identidad(p.nombre) === coach || identidad(p.correo) === coach)
  const pc = liderazgo.filter(p => identidad(p.puesto || '') === 'productivity coach').filter(p => identidad(p.email) === coach || identidad([p.nombre, p.apellido].filter(Boolean).join(' ')) === coach || identidad(p.email) === alias?.correo)
  // Las PC del catalogo pueden no tener cuenta en la plataforma todavia.
  const correoPC = pc.length === 1 ? identidad(pc[0].email) : pc.length === 0 ? alias?.correo : null
  if (coach && correoPC) correos.push(correoPC)
  return { correos: [...new Set(correos.filter(Boolean))], pcEncontrado: Boolean(coach && correoPC) }
}
