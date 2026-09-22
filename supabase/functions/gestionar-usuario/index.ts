import { secureServe } from '../_shared/security.ts'
import { validEmail, validPassword, validUuid } from '../_shared/security-core.ts'
// Edge Function: gestionar-usuario
// Permite a Master/Admin editar (nombre, apellido, correo, rol,
// contraseña) o eliminar cuentas, respetando el límite de cada rol:
// Master puede hacer todo a cualquier cuenta. Admin solo puede tocar
// cuentas que hoy son "staff" o "asociado", y no puede asignar el
// rol "admin" ni "master". Se crea vía Supabase Dashboard > Edge
// Functions > Create function, pegando este código.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {}

const ROLES_VALIDOS = ['master', 'admin', 'staff', 'asociado']

const PUESTOS_VALIDOS = [
  'Principal Operator',
  'Director of First Impressions',
  'Technology Director',
  'Productivity Coach',
  'Transaction Manager',
  'Market Center Administrator Assistant',
  'Market Center Administrator',
  'Team Leader',
]

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

secureServe({ name: 'gestionar-usuario', userLimit: 20 }, async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return respond({ error: 'Método no permitido' }, 405)

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return respond({ error: 'Configuración del servidor incompleta (faltan variables de entorno).' }, 500)
    }

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return respond({ error: 'No autenticado' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: callerData, error: callerError } = await admin.auth.getUser(token)
    if (callerError || !callerData?.user) return respond({ error: 'Sesión inválida' }, 401)
    const callerId = callerData.user.id

    const { data: callerProfile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', callerId)
      .single()
    if (profileError || !callerProfile) return respond({ error: 'No se encontró tu perfil' }, 403)

    const callerRole = callerProfile.role
    if (callerRole !== 'master' && callerRole !== 'admin') {
      return respond({ error: 'No tienes permiso para administrar usuarios' }, 403)
    }
    const esAdminLimitado = callerRole === 'admin'

    const body = await req.json().catch(() => ({}))
    const accion = String(body.accion || '')
    const targetId = String(body.user_id || '')
    if (!validUuid(targetId)) return respond({ error: 'Usuario invalido' }, 400)

    const { data: targetProfile, error: targetError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', targetId)
      .single()
    if (targetError || !targetProfile) return respond({ error: 'Usuario no encontrado' }, 404)

    const rolActualDestino = targetProfile.role
    if (esAdminLimitado && rolActualDestino !== 'staff' && rolActualDestino !== 'asociado') {
      return respond({ error: 'No tienes permiso para modificar a este usuario' }, 403)
    }

    if (accion === 'eliminar') {
      if (targetId === callerId) return respond({ error: 'No puedes eliminar tu propia cuenta' }, 400)

      const { error: delError } = await admin.auth.admin.deleteUser(targetId)
      if (delError) return respond({ error: delError.message || 'No se pudo eliminar al usuario' }, 500)
      return respond({ ok: true })
    }

    if (accion === 'actualizar') {
      const nombre = body.nombre != null ? String(body.nombre).trim() : undefined
      const apellido = body.apellido != null ? String(body.apellido).trim() : undefined
      const email = body.email ? String(body.email).trim().toLowerCase() : undefined
      const password = body.password ? String(body.password) : undefined
      const nuevoRol = body.role ? String(body.role) : undefined
      const nuevoOculto = typeof body.oculto === 'boolean' ? body.oculto : undefined
      const nuevoPuesto = body.puesto !== undefined ? (String(body.puesto).trim() || null) : undefined

      if (nuevoRol && !ROLES_VALIDOS.includes(nuevoRol)) {
        return respond({ error: 'Rol inválido' }, 400)
      }
      if (nuevoPuesto && !PUESTOS_VALIDOS.includes(nuevoPuesto)) {
        return respond({ error: 'Puesto inválido' }, 400)
      }
      if (nuevoRol && esAdminLimitado && nuevoRol !== 'staff' && nuevoRol !== 'asociado') {
        return respond({ error: 'Solo el usuario master puede asignar ese rol' }, 403)
      }
      if (targetId === callerId && nuevoRol && nuevoRol !== rolActualDestino) {
        return respond({ error: 'No puedes cambiar tu propio rol' }, 400)
      }
      if (email && !validEmail(email)) return respond({ error: 'Correo invalido' }, 400)
      if ([nombre, apellido].some((v) => v !== undefined && (v.length > 120 || /[\x00-\x1f]/.test(v)))) {
        return respond({ error: 'Nombre o apellido invalido' }, 400)
      }
      if (password && !validPassword(password)) {
        return respond({ error: 'La contraseña debe tener al menos 12 caracteres y como maximo 72 bytes' }, 400)
      }

      if (email || password) {
        const cambiosAuth: Record<string, string> = {}
        if (email) cambiosAuth.email = email
        if (password) cambiosAuth.password = password
        const { error: authError } = await admin.auth.admin.updateUserById(targetId, cambiosAuth)
        if (authError) return respond({ error: authError.message || 'No se pudo actualizar el correo o la contraseña' }, 500)
      }

      const cambiosPerfil: Record<string, string | boolean | null> = {}
      if (nombre !== undefined) cambiosPerfil.nombre = nombre
      if (apellido !== undefined) cambiosPerfil.apellido = apellido
      if (email) cambiosPerfil.email = email
      if (nuevoRol) cambiosPerfil.role = nuevoRol
      if (nuevoOculto !== undefined) cambiosPerfil.oculto = nuevoOculto
      if (nuevoPuesto !== undefined) cambiosPerfil.puesto = nuevoPuesto

      if (Object.keys(cambiosPerfil).length > 0) {
        const { error: updError } = await admin.from('profiles').update(cambiosPerfil).eq('id', targetId)
        if (updError) return respond({ error: updError.message || 'No se pudo actualizar el perfil' }, 500)
      }

      return respond({ ok: true })
    }

    return respond({ error: 'Acción inválida' }, 400)
  } catch (err) {
    return respond({ error: (err as Error).message || 'Error inesperado' }, 500)
  }
})
