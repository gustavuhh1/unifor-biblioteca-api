import { z } from 'zod'
import { USER_ROLES } from './types/index.js'

// Schema do Zod para o perfil do usuário (users.role, seção 2.1 do modelo de
// dados). O tipo UserRole vem de shared/types.
export const userRoleSchema = z.enum(USER_ROLES)
