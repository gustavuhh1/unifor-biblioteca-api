import type { Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { COLLECTIONS } from '../../../shared/firestore/collections.js'
import { optionalDate } from '../../../shared/firestore/converters.js'
import type {
  StudentCirculation,
  StudentOpenLoan,
} from '../../../shared/rules/request-eligibility.js'
import { LOAN_STATUS, type LoanStatus } from '../../../shared/types/index.js'

// Leitura, para a página do livro, do que a regra de elegibilidade precisa saber
// do aluno (seção 2.9): os contadores de users e os pedidos aguardando retirada
// e empréstimos ativos, pelo índice (studentUid, status, dueAt). Com tx, as
// leituras entram na transação do pedido (RF-EMP-01).

// Lê os contadores do aluno e os seus pedidos e empréstimos em andamento
// (awaiting_pickup e active). Aluno sem documento conta como zerado.
export async function readStudentCirculation(
  uid: string,
  tx?: Transaction,
): Promise<StudentCirculation> {
  const db = getDb()
  const userRef = db.collection(COLLECTIONS.users).doc(uid)
  const loansQuery = db
    .collection(COLLECTIONS.loans)
    .where('studentUid', '==', uid)
    .where('status', 'in', [LOAN_STATUS.awaitingPickup, LOAN_STATUS.active])
  const [user, loans] = await Promise.all([
    tx ? tx.get(userRef) : userRef.get(),
    tx ? tx.get(loansQuery) : loansQuery.get(),
  ])
  return {
    activeLoanCount: (user.get('activeLoanCount') as number | undefined) ?? 0,
    activeQueueCount: (user.get('activeQueueCount') as number | undefined) ?? 0,
    openLoans: loans.docs.map((doc): StudentOpenLoan => ({
      bookId: doc.get('bookId') as string,
      workId: doc.get('workId') as string,
      status: doc.get('status') as LoanStatus,
      dueAt: optionalDate(doc.get('dueAt')) ?? undefined,
    })),
  }
}
