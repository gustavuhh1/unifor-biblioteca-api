import { getDb } from '../../../config/firebase.js'
import { writeAuditLog } from '../../../shared/audit-log.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { nowOf } from '../../../shared/clock.js'
import { displayNameOf } from '../../../shared/domain/user.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import {
  AUDIT_ACTION,
  AUDIT_ACTOR_ROLE,
  BOOK_STATUS,
  QUEUE_ORIGIN,
  USER_ROLE,
  USER_STATUS,
} from '../../../shared/types/index.js'
import * as usersRepository from '../../auth/repositories/users.repository.js'
import { bookNotFound } from '../../catalog/catalog.errors.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import { readStudentCirculation } from '../../catalog/repositories/student-circulation.repository.js'
import {
  librarianJoinRefused,
  placementRefused,
  reasonRequired,
  studentNotFound,
} from '../queues.errors.js'
import type { AddToQueueBody, QueueChangeResponse } from '../queues.types.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import * as queueEntriesRepository from '../repositories/queue-entries.repository.js'
import { checkJoinEdition } from '../rules/join.rules.js'
import { buildNewEntry } from '../rules/new-entry.rules.js'
import {
  PLACEMENT_DECISION,
  decidePlacement,
  planPlacement,
} from '../rules/placement.rules.js'
import { addedByLibrarianNotice } from '../rules/queue-notices.rules.js'
import {
  movedDownUids,
  toMovedDownResponse,
} from '../rules/queue-view.rules.js'
import { getLibrarianQueue } from './librarian-queue.service.js'
import { applyPlacementEffects } from './queue-placement.service.js'

// O bibliotecário adiciona um aluno à fila de um livro, na posição que escolher
// (RF-BAL-06, RF-BAL-07). O aluno é achado pela matrícula (só aluno ativo; senão
// student_not_found) e vale a mesma regra de entrada do próprio aluno (unavailable,
// overdue, queue_limit, not_queueable, same_title, already_in_queue). Sem
// `position`, vai para o fim, sem confirmação. Entrando à frente de outros, a
// primeira chamada (`confirmed: false`) não grava nada e devolve `applied: false`
// com quem desce; a segunda (`confirmed: true`) exige o `reason`
// (reason_required). Numa transação: cria o lugar `waiting` (`origin: librarian`,
// `addedBy`, `addReason`), `queueLength` do livro e `activeQueueCount` do aluno
// sobem, o aluno recebe o aviso de que foi colocado na fila, quem desce recebe o de
// posição mudada e o auditLog registra `queue_add`.
export async function addToQueue(
  librarianUid: string,
  bookId: string,
  body: AddToQueueBody,
): Promise<QueueChangeResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)
  const entryId = queueEntriesRepository.newEntryId()

  const outcome = await getDb().runTransaction(async (tx) => {
    const book = await booksRepository.findById(bookId, tx)
    if (!book || book.status !== BOOK_STATUS.active) throw bookNotFound()

    const account = await usersRepository.findByMatricula(body.matricula, tx)
    if (
      !account ||
      account.role !== USER_ROLE.student ||
      account.status !== USER_STATUS.active
    ) {
      throw studentNotFound()
    }
    const [student, circulation, myEntries, queue] = await Promise.all([
      usersRepository.findById(account.uid, tx),
      readStudentCirculation(account.uid, tx),
      queueEntriesRepository.listActiveByStudent(account.uid, tx),
      queueEntriesRepository.listActiveByBook(bookId, tx),
    ])
    if (!student) throw studentNotFound()

    const check = checkJoinEdition({
      book,
      student: circulation,
      limits: settings,
      at,
      activeQueueBookIds: new Set(myEntries.map((entry) => entry.bookId)),
    })
    if (!check.allowed) throw librarianJoinRefused(check.reason)

    const planned = planPlacement({
      queue,
      position: body.position ?? queue.length + 1,
    })
    if (!planned.ok) throw placementRefused(planned.refusal)
    const { placement } = planned
    const movedDown = toMovedDownResponse(placement.movedDown, queue)

    const decision = decidePlacement(placement, body)
    if (decision === PLACEMENT_DECISION.confirm) {
      return { applied: false as const, movedDown }
    }
    if (decision === PLACEMENT_DECISION.reasonRequired) {
      throw reasonRequired(
        'Informe o motivo para colocar o aluno à frente de outros.',
      )
    }

    const entry = buildNewEntry({
      book,
      student: {
        uid: account.uid,
        matricula: student.matricula,
        name: displayNameOf(student),
      },
      order: placement.order,
      origin: QUEUE_ORIGIN.librarian,
      addedBy: librarianUid,
      addReason: body.reason,
      at,
    })

    queueEntriesRepository.create(tx, entryId, entry)
    booksRepository.update(tx, book.id, {
      queueLength: book.queueLength + 1,
      updatedAt: at,
    })
    usersRepository.setActiveQueueCount(
      tx,
      account.uid,
      circulation.activeQueueCount + 1,
      at,
    )
    applyPlacementEffects(tx, { placement, queue, at })
    notificationsRepository.create(
      tx,
      account.uid,
      addedByLibrarianNotice({ id: entryId, ...entry }, placement.position, at),
    )
    writeAuditLog(
      tx,
      {
        actorUid: librarianUid,
        actorRole: AUDIT_ACTOR_ROLE.librarian,
        action: AUDIT_ACTION.queueAdd,
        targetUid: account.uid,
        bookId: book.id,
        entityId: entryId,
        reason: body.reason,
        details: {
          position: placement.position,
          movedDown: movedDownUids(placement.movedDown, queue),
        },
      },
      at,
    )
    return { applied: true as const, movedDown }
  })

  if (!outcome.applied) return { ...outcome, queue: null }
  invalidateCatalogCache()
  return { ...outcome, queue: await getLibrarianQueue(bookId) }
}
