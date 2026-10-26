import { getDb } from '../../../config/firebase.js'
import { COLLECTIONS } from '../../../shared/firestore/collections.js'
import { withoutUndefined } from '../../../shared/firestore/converters.js'
import type { JobRun } from '../../../shared/types/index.js'

// Acesso ao Firestore das execuções da rotina agendada, jobRuns (seção 2.23). Cada
// gravação é de um documento só, então não usa transação.

const jobRuns = () => getDb().collection(COLLECTIONS.jobRuns)

// Abre o registro de uma execução (`running`) e devolve o id.
export async function start(run: JobRun): Promise<string> {
  const ref = jobRuns().doc()
  await ref.set(withoutUndefined(run))
  return ref.id
}

// Fecha o registro da execução (`ok` ou `error`).
export async function finish(
  runId: string,
  fields: Pick<JobRun, 'status' | 'processed' | 'finishedAt' | 'updatedAt'> &
    Partial<Pick<JobRun, 'error'>>,
): Promise<void> {
  await jobRuns().doc(runId).update(withoutUndefined(fields))
}
