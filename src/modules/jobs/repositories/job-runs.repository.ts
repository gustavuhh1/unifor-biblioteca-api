import type { Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { COLLECTIONS } from '../../../shared/firestore/collections.js'
import { withoutUndefined } from '../../../shared/firestore/converters.js'
import type { JobRun } from '../../../shared/types/index.js'

const runs = () => getDb().collection(COLLECTIONS.jobRuns)

export function newRunId(): string {
  return runs().doc().id
}

export function create(tx: Transaction, id: string, run: JobRun): void {
  tx.set(runs().doc(id), withoutUndefined(run))
}

export async function update(
  id: string,
  fields: Partial<JobRun>,
): Promise<void> {
  await runs().doc(id).update(withoutUndefined(fields))
}
