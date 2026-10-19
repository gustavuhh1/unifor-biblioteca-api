import { z } from 'zod'
import { USER_ROLES } from './types/index.js'

// Valida o campo `role` de users/{uid} (docs/modelo-de-dados-firestore.md,
// seção 2.1). O tipo UserRole vem de shared/types.
export const userRoleSchema = z.enum(USER_ROLES)
