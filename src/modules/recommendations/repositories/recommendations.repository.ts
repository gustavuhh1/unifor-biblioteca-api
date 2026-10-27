import { getDb } from '../../../config/firebase.js'
import { COLLECTIONS } from '../../../shared/firestore/collections.js'
import {
  dataWithDates,
  withoutUndefined,
} from '../../../shared/firestore/converters.js'
import type { Recommendation } from '../../../shared/types/index.js'

const recommendations = () => getDb().collection(COLLECTIONS.recommendations)

// Cache privado do aluno, com as datas convertidas do Firestore (seção 2.18).
export async function findByStudent(
  uid: string,
): Promise<Recommendation | undefined> {
  const snapshot = await recommendations().doc(uid).get()
  return snapshot.exists
    ? (dataWithDates(snapshot, [
        'generatedAt',
        'validUntil',
        'createdAt',
        'updatedAt',
      ]) as unknown as Recommendation)
    : undefined
}

// Grava (ou substitui) o cache do aluno com os campos da seção 2.18 e as datas
// createdAt e updatedAt que todo documento tem (regra 6 do modelo).
export async function save(
  uid: string,
  recommendation: Recommendation,
): Promise<void> {
  await recommendations().doc(uid).set(withoutUndefined(recommendation))
}
