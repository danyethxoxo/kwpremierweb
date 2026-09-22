import { secureServe } from '../_shared/security.ts'
import { forwardData } from './handler.ts'

secureServe({ name: 'data-gateway', auth: 'optional', methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
  userLimit: 300, ipLimit: 600, maxBytes: 8 * 1024 * 1024 }, forwardData)
