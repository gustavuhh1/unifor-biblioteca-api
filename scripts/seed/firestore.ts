import type { Firestore } from 'firebase-admin/firestore'
import { ROOT_COLLECTIONS } from '../../src/shared/firestore/collections.js'
import type { Write } from './build.js'

export async function clearDatabase(db: Firestore): Promise<void> {
  for (const name of ROOT_COLLECTIONS) {
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
