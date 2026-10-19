import { z } from 'zod'

// Field `role` of users/{uid} (docs/modelo-de-dados-firestore.md, section 2.1).
export const userRoleSchema = z.enum(['student', 'librarian'])

export type UserRole = z.infer<typeof userRoleSchema>
