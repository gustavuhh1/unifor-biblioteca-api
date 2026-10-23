import {
  checkRequestEligibility,
  type EligibilityBook,
  type RequestLimits,
  type StudentCirculation,
} from '../../../shared/rules/request-eligibility.js'
import {
  BLOCKED_REASON,
  ELIGIBILITY_ACTION,
  type BlockedReason,
} from '../../../shared/types/index.js'
import { ALREADY_IN_QUEUE_CODE } from '../queues.constants.js'

// Entrar na fila de uma edição (RF-FIL-02 a RF-FIL-04, seção 2.10).

// Por que o aluno não entra na fila de uma edição: um dos motivos de bloqueio do
// pedido (BLOCKED_REASON) ou já ter lugar ativo nela.
export type JoinRefusal = BlockedReason | typeof ALREADY_IN_QUEUE_CODE

// Resultado da checagem de uma edição.
export type JoinCheck =
  { allowed: true } | { allowed: false; reason: JoinRefusal }

const refused = (reason: JoinRefusal): JoinCheck => ({ allowed: false, reason })

// Diz se o aluno pode entrar na fila desta edição. Devolve o primeiro motivo que
// bloqueia, nesta ordem: unavailable, overdue, queue_limit e not_queueable (a
// regra compartilhada com o pedido e a página do livro, RF-FIL-02 e RF-FIL-03),
// already_in_queue (já tem lugar ativo na edição) e same_title (já tem pedido ou
// empréstimo desta edição). `queueSlots` é quantas filas a entrada ocupa: 1 por
// edição marcada (RF-FIL-04).
export function checkJoinEdition(input: {
  book: EligibilityBook & { id: string }
  student: StudentCirculation
  limits: RequestLimits
  at: Date
  queueSlots?: number
  // Edições em que o aluno já tem lugar ativo (waiting ou your_turn).
  activeQueueBookIds: ReadonlySet<string>
}): JoinCheck {
  const { book, student, activeQueueBookIds } = input
  const { allowed, blockedReason } = checkRequestEligibility({
    action: ELIGIBILITY_ACTION.joinQueue,
    book,
    student,
    limits: input.limits,
    at: input.at,
    ...(input.queueSlots === undefined ? {} : { queueSlots: input.queueSlots }),
  })
  if (!allowed && blockedReason) return refused(blockedReason)
  if (activeQueueBookIds.has(book.id)) return refused(ALREADY_IN_QUEUE_CODE)
  if (student.openLoans.some((loan) => loan.bookId === book.id)) {
    return refused(BLOCKED_REASON.sameTitle)
  }
  return { allowed: true }
}

// Todas as edições são do mesmo livro (mesmo `workId`), como o grupo de edições
// da fila exige (RF-FIL-04).
export function areSameWork(books: readonly { workId: string }[]): boolean {
  return books.every((book) => book.workId === books[0]?.workId)
}
