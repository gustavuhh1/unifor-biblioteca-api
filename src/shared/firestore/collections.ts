// Nomes das coleções do Firestore (docs/modelo-de-dados-firestore.md, seção 1.1).
// A API e o seed usam estes nomes; nenhum arquivo escreve o nome de uma coleção
// como texto solto.
export const COLLECTIONS = {
  users: 'users',
  matriculaIndex: 'matriculaIndex',
  emailIndex: 'emailIndex',
  emailTokens: 'emailTokens',
  passkeys: 'passkeys',
  passkeyChallenges: 'passkeyChallenges',
  works: 'works',
  books: 'books',
  copies: 'copies',
  loans: 'loans',
  queueEntries: 'queueEntries',
  fines: 'fines',
  recommendations: 'recommendations',
  holidays: 'holidays',
  recesses: 'recesses',
  settings: 'settings',
  auditLog: 'auditLog',
  jobRuns: 'jobRuns',
  // Subcoleções de users/{uid}.
  savedBooks: 'savedBooks',
  folders: 'folders',
  notifications: 'notifications',
  devices: 'devices',
  assistantMessages: 'assistantMessages',
  assistantActions: 'assistantActions',
} as const

// Id do documento único de settings (settings/library, seção 2.21).
export const SETTINGS_DOC_ID = 'library'

// Coleções de nível raiz. Apagar um documento delas apaga também as
// subcoleções (users/{uid}/...).
export const ROOT_COLLECTIONS = [
  COLLECTIONS.users,
  COLLECTIONS.matriculaIndex,
  COLLECTIONS.emailIndex,
  COLLECTIONS.emailTokens,
  COLLECTIONS.passkeys,
  COLLECTIONS.passkeyChallenges,
  COLLECTIONS.works,
  COLLECTIONS.books,
  COLLECTIONS.copies,
  COLLECTIONS.loans,
  COLLECTIONS.queueEntries,
  COLLECTIONS.fines,
  COLLECTIONS.recommendations,
  COLLECTIONS.holidays,
  COLLECTIONS.recesses,
  COLLECTIONS.settings,
  COLLECTIONS.auditLog,
  COLLECTIONS.jobRuns,
] as const

// Subcoleções de users/{uid}, contadas como grupos de coleção.
export const SUBCOLLECTIONS = [
  COLLECTIONS.savedBooks,
  COLLECTIONS.folders,
  COLLECTIONS.notifications,
  COLLECTIONS.devices,
  COLLECTIONS.assistantMessages,
  COLLECTIONS.assistantActions,
] as const

// Grupos de coleção com política de TTL no campo `expiresAt` (seção 4.3).
export const TTL_COLLECTION_GROUPS = [
  COLLECTIONS.emailTokens,
  COLLECTIONS.passkeyChallenges,
  COLLECTIONS.assistantActions,
] as const

// Caminho de uma subcoleção de um usuário: users/{uid}/{subcoleção}.
export function userSubcollectionPath(
  uid: string,
  name: (typeof SUBCOLLECTIONS)[number],
): string {
  return `${COLLECTIONS.users}/${uid}/${name}`
}
