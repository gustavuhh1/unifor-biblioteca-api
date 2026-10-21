import type { DocumentSnapshot } from 'firebase-admin/firestore'
import { getDb } from '../../config/firebase.js'
import {
  DEFAULT_REQUEST_LIMITS,
  type RequestLimits,
} from '../rules/request-eligibility.js'
import { COLLECTIONS, SETTINGS_DOC_ID } from './collections.js'

// Lê o documento settings/library (seção 2.21). Quem lê um número dele usa
// positiveNumberOr, para o documento ausente ou o valor inválido cair no padrão.
export function readLibrarySettings(): Promise<DocumentSnapshot> {
  return getDb().collection(COLLECTIONS.settings).doc(SETTINGS_DOC_ID).get()
}

// O valor, se for um número maior que zero; senão o padrão.
export function positiveNumberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && value > 0 ? value : fallback
}

// Lê os limites de empréstimos e de filas ativas em settings/library
// (maxActiveLoans e maxActiveQueues). Sem o documento ou com valor inválido,
// valem 10 e 7. Usada pela página do livro e, depois, pelo empréstimo e pela fila.
export async function readRequestLimits(): Promise<RequestLimits> {
  const snapshot = await readLibrarySettings()
  return {
    maxActiveLoans: positiveNumberOr(
      snapshot.get('maxActiveLoans'),
      DEFAULT_REQUEST_LIMITS.maxActiveLoans,
    ),
    maxActiveQueues: positiveNumberOr(
      snapshot.get('maxActiveQueues'),
      DEFAULT_REQUEST_LIMITS.maxActiveQueues,
    ),
  }
}
