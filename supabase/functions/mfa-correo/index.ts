import { secureServe } from '../_shared/security.ts'
import { handleMfa } from './handler.ts'

secureServe({ name: 'mfa-correo', mfa: false, userLimit: 30 }, handleMfa)
