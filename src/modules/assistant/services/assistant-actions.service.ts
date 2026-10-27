import { addMinutes } from 'date-fns'
import { getDb } from '../../../config/firebase.js'
import { addBusinessDays } from '../../../shared/calendar/business-days.js'
import { getCachedActiveBooks } from '../../../shared/catalog-cache.js'
import { now, nowOf } from '../../../shared/clock.js'
import { AppError } from '../../../shared/errors.js'
import { readLibraryCalendar } from '../../../shared/firestore/calendar.js'
import {
  readAssistantActionMinutes,
  readLoanSettings,
} from '../../../shared/firestore/settings.js'
import { checkRequestEligibility } from '../../../shared/rules/request-eligibility.js'
import {
  ASSISTANT_ACTION_STATUS,
  ASSISTANT_ACTION_TYPE,
  BLOCKED_REASONS,
  BOOK_STATUS,
  ELIGIBILITY_ACTION,
  LOAN_ORIGIN,
  QUEUE_ORIGIN,
  type AssistantAction,
  type AssistantActionPreview,
  type AssistantActionRecord,
  type BlockedReason,
  type BookRecord,
} from '../../../shared/types/index.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import { readStudentCirculation } from '../../catalog/repositories/student-circulation.repository.js'
import { requestLoan } from '../../loans/services/loan-request.service.js'
import { ALREADY_IN_QUEUE_CODE } from '../../queues/queues.constants.js'
import * as queueEntriesRepository from '../../queues/repositories/queue-entries.repository.js'
import { areSameWork, checkJoinEdition } from '../../queues/rules/join.rules.js'
import { joinQueue } from '../../queues/services/queue-join.service.js'
import {
  assistantActionExpired,
  assistantActionNotFound,
  assistantActionNotPending,
} from '../assistant.errors.js'
import type {
  CancelActionResponse,
  ConfirmActionResponse,
} from '../assistant.types.js'
import * as actionsRepository from '../repositories/assistant-actions.repository.js'
import { toActionResponse } from '../rules/assistant-view.rules.js'

// Ações do Assistente (RF-ASS-04): preparar o pedido ou a entrada na fila, que o
// aluno confirma ou cancela. As regras são as do empréstimo e da fila
// (checkRequestEligibility, checkJoinEdition, requestLoan, joinQueue): nada é
// copiado para cá. Na confirmação tudo é conferido de novo, porque o estado pode
// ter mudado.

// O que aconteceu ao preparar uma ação.
export type ProposalResult =
  | { kind: 'action'; action: AssistantActionRecord }
  // Sem exemplar disponível (ou com fila): o caminho é a fila.
  | { kind: 'no_copy' }
  | { kind: 'already_in_queue' }
  | { kind: 'book_not_found' }
  | { kind: 'editions_mismatch' }

const isActive = (book: BookRecord | undefined): book is BookRecord =>
  book !== undefined && book.status === BOOK_STATUS.active

// Grava a ação proposta (ou bloqueada pela regra) com a validade de settings.
async function saveAction(
  uid: string,
  input: {
    type: AssistantAction['type']
    bookIds: string[]
    blockedReason: BlockedReason | undefined
    preview: AssistantActionPreview
    at: Date
  },
): Promise<AssistantActionRecord> {
  const minutes = await readAssistantActionMinutes()
  return actionsRepository.create(uid, {
    type: input.type,
    bookIds: input.bookIds,
    status: input.blockedReason
      ? ASSISTANT_ACTION_STATUS.blocked
      : ASSISTANT_ACTION_STATUS.proposed,
    ...(input.blockedReason ? { blockedReason: input.blockedReason } : {}),
    preview: input.preview,
    expiresAt: addMinutes(input.at, minutes),
    createdAt: input.at,
    updatedAt: input.at,
  })
}

// Prepara o pedido de empréstimo de um livro (RF-ASS-04): confere a mesma regra
// do pedido e grava a ação proposta, com o prazo de retirada e quantos livros o
// aluno terá, ou bloqueada, com o motivo. Sem exemplar disponível, não grava nada
// e avisa que o caminho é a fila.
export async function proposeLoan(
  uid: string,
  bookId: string,
): Promise<ProposalResult> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)
  const [book, circulation] = await Promise.all([
    booksRepository.findById(bookId),
    readStudentCirculation(uid),
  ])
  if (!isActive(book)) return { kind: 'book_not_found' }

  const { allowed, blockedReason } = checkRequestEligibility({
    action: ELIGIBILITY_ACTION.request,
    book,
    student: circulation,
    limits: settings,
    at,
  })
  if (allowed && (book.copiesAvailable === 0 || book.queueLength > 0)) {
    return { kind: 'no_copy' }
  }

  let preview: AssistantActionPreview = {}
  if (allowed) {
    const calendar = await readLibraryCalendar(settings.openingHours, at)
    preview = {
      pickupDeadline: addBusinessDays(
        at,
        settings.pickupBusinessDays,
        calendar,
      ),
      activeLoansAfter: circulation.activeLoanCount + 1,
    }
  }
  const action = await saveAction(uid, {
    type: ASSISTANT_ACTION_TYPE.requestLoan,
    bookIds: [book.id],
    blockedReason,
    preview,
    at,
  })
  return { kind: 'action', action }
}

// Prepara a entrada na fila de uma ou mais edições do mesmo livro (RF-ASS-04):
// confere a mesma regra da fila em cada edição e grava a ação proposta, com a
// posição que o aluno vai ocupar, ou bloqueada, com o motivo. Se o aluno já está
// na fila, não grava nada.
export async function proposeQueue(
  uid: string,
  bookIds: readonly string[],
): Promise<ProposalResult> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)
  const ids = [...new Set(bookIds)]
  const [books, circulation, myEntries] = await Promise.all([
    Promise.all(ids.map((id) => booksRepository.findById(id))),
    readStudentCirculation(uid),
    queueEntriesRepository.listActiveByStudent(uid),
  ])
  const editions = books.filter(isActive)
  if (editions.length !== ids.length) return { kind: 'book_not_found' }
  if (!areSameWork(editions)) return { kind: 'editions_mismatch' }

  const activeQueueBookIds = new Set(myEntries.map((entry) => entry.bookId))
  let blockedReason: BlockedReason | undefined
  for (const book of editions) {
    const check = checkJoinEdition({
      book,
      student: circulation,
      limits: settings,
      at,
      queueSlots: editions.length,
      activeQueueBookIds,
    })
    if (check.allowed) continue
    if (check.reason === ALREADY_IN_QUEUE_CODE) {
      return { kind: 'already_in_queue' }
    }
    blockedReason = check.reason
    break
  }

  let preview: AssistantActionPreview = {}
  if (!blockedReason) {
    const queue = await queueEntriesRepository.listActiveByBook(editions[0]!.id)
    preview = { queuePosition: queue.length + 1 }
  }
  const action = await saveAction(uid, {
    type: ASSISTANT_ACTION_TYPE.joinQueue,
    bookIds: ids,
    blockedReason,
    preview,
    at,
  })
  return { kind: 'action', action }
}

// Mapa dos livros ativos (do cache do acervo), para montar a resposta.
async function activeBookMap(): Promise<Map<string, BookRecord>> {
  const books = await getCachedActiveBooks(booksRepository.listActive)
  return new Map(books.map((book) => [book.id, book]))
}

// Troca a ação de `proposed` para `confirmed` numa transação, para dois toques
// em "Confirmar" não executarem duas vezes. Vencida, vira `expired`.
async function claimAction(
  uid: string,
  actionId: string,
): Promise<AssistantActionRecord> {
  const at = await now()
  const claimed = await getDb().runTransaction(async (tx) => {
    const action = await actionsRepository.findById(uid, actionId, tx)
    if (!action) throw assistantActionNotFound()
    if (action.status !== ASSISTANT_ACTION_STATUS.proposed) {
      throw assistantActionNotPending()
    }
    if (action.expiresAt.getTime() <= at.getTime()) {
      actionsRepository.update(
        uid,
        actionId,
        { status: ASSISTANT_ACTION_STATUS.expired, updatedAt: at },
        tx,
      )
      return undefined
    }
    actionsRepository.update(
      uid,
      actionId,
      { status: ASSISTANT_ACTION_STATUS.confirmed, updatedAt: at },
      tx,
    )
    return { ...action, status: ASSISTANT_ACTION_STATUS.confirmed }
  })
  if (!claimed) throw assistantActionExpired()
  return claimed
}

// O motivo de bloqueio do erro da regra, quando é um deles.
const blockedReasonOf = (error: unknown): BlockedReason | undefined =>
  error instanceof AppError &&
  (BLOCKED_REASONS as readonly string[]).includes(error.code)
    ? (error.code as BlockedReason)
    : undefined

// Confirma a ação (RF-ASS-04): só a que está esperando e dentro do prazo. Executa
// pelo próprio serviço do empréstimo ou da fila, com a origem "assistant", que
// refaz todas as checagens. Se a regra recusar agora, a ação vira `failed` e o
// erro do empréstimo ou da fila volta para o app.
export async function confirmAction(
  uid: string,
  actionId: string,
): Promise<ConfirmActionResponse> {
  const action = await claimAction(uid, actionId)
  try {
    if (action.type === ASSISTANT_ACTION_TYPE.requestLoan) {
      const loan = await requestLoan(
        uid,
        { bookId: action.bookIds[0]! },
        LOAN_ORIGIN.assistant,
      )
      const done = { ...action, resultLoanId: loan.id }
      await actionsRepository.update(uid, actionId, {
        resultLoanId: loan.id,
        updatedAt: await now(),
      })
      return {
        action: toActionResponse(done, await activeBookMap()),
        loan,
        queueEntries: [],
      }
    }
    const { items } = await joinQueue(
      uid,
      { bookIds: action.bookIds },
      QUEUE_ORIGIN.assistant,
    )
    const resultQueueEntryIds = items.map((entry) => entry.id)
    await actionsRepository.update(uid, actionId, {
      resultQueueEntryIds,
      updatedAt: await now(),
    })
    return {
      action: toActionResponse(
        { ...action, resultQueueEntryIds },
        await activeBookMap(),
      ),
      loan: null,
      queueEntries: items,
    }
  } catch (error) {
    const blockedReason = blockedReasonOf(error)
    await actionsRepository.update(uid, actionId, {
      status: ASSISTANT_ACTION_STATUS.failed,
      ...(blockedReason ? { blockedReason } : {}),
      updatedAt: await now(),
    })
    throw error
  }
}

// Cancela a ação que está esperando a confirmação (RF-ASS-04).
export async function cancelAction(
  uid: string,
  actionId: string,
): Promise<CancelActionResponse> {
  const at = await now()
  const cancelled = await getDb().runTransaction(async (tx) => {
    const action = await actionsRepository.findById(uid, actionId, tx)
    if (!action) throw assistantActionNotFound()
    if (action.status !== ASSISTANT_ACTION_STATUS.proposed) {
      throw assistantActionNotPending()
    }
    actionsRepository.update(
      uid,
      actionId,
      { status: ASSISTANT_ACTION_STATUS.cancelled, updatedAt: at },
      tx,
    )
    return { ...action, status: ASSISTANT_ACTION_STATUS.cancelled }
  })
  return { action: toActionResponse(cancelled, await activeBookMap()) }
}
