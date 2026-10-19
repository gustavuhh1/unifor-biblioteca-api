import type { Firestore } from 'firebase-admin/firestore'
import type { Write } from './build.js'

// Collections of docs/modelo-de-dados-firestore.md, section 1.1. Clearing a
// document also clears its subcollections (users/{uid}/...).
export const COLLECTIONS = [
  'users',
  'matriculaIndex',
  'emailIndex',
  'emailTokens',
  'passkeys',
  'passkeyChallenges',
  'works',
  'books',
  'copies',
  'loans',
  'queueEntries',
  'fines',
  'recommendations',
  'holidays',
  'recesses',
  'settings',
  'auditLog',
  'jobRuns',
] as const

// Collection groups counted in the final summary (section 1.1).
export const SUBCOLLECTIONS = [
  'savedBooks',
  'folders',
  'notifications',
  'devices',
  'assistantMessages',
  'assistantActions',
] as const

export async function clearDatabase(db: Firestore): Promise<void> {
  for (const name of COLLECTIONS) {
    await db.recursiveDelete(db.collection(name))
  }
}

export async function writeAll(db: Firestore, writes: Write[]): Promise<void> {
  const writer = db.bulkWriter()
  // Attach the handler right away so a failed write is never "unhandled".
  const settled = Promise.all(
    writes.map(({ path, data }) => writer.set(db.doc(path), data)),
  )
  await writer.close()
  await settled
}
