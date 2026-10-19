import type { Firestore } from 'firebase-admin/firestore'
import { ROOT_COLLECTIONS } from '../../src/shared/firestore/collections.js'
import type { Write } from './build.js'

// Apaga todas as coleções de nível raiz, com as subcoleções delas.
export async function clearDatabase(db: Firestore): Promise<void> {
  for (const name of ROOT_COLLECTIONS) {
    await db.recursiveDelete(db.collection(name))
  }
}

// Grava todas as escritas da carga, em lote.
export async function writeAll(db: Firestore, writes: Write[]): Promise<void> {
  const writer = db.bulkWriter()
  // Liga o tratamento já, para uma escrita que falhe nunca ficar "sem tratamento".
  const settled = Promise.all(
    writes.map(({ path, data }) => writer.set(db.doc(path), data)),
  )
  await writer.close()
  await settled
}
