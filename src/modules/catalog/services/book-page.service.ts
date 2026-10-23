import { readRequestLimits } from '../../../shared/firestore/settings.js'
import {
  checkRequestEligibility,
  suggestedActionOf,
} from '../../../shared/rules/request-eligibility.js'
import { now } from '../../../shared/clock.js'
import { BOOK_STATUS, USER_ROLE } from '../../../shared/types/index.js'
import type { BookRecord, UserRole } from '../../../shared/types/index.js'
import { bookNotFound } from '../catalog.errors.js'
import type { ActionBlock, BookDetail } from '../catalog.types.js'
import * as booksRepository from '../repositories/books.repository.js'
import * as copiesRepository from '../repositories/copies.repository.js'
import * as studentCirculationRepository from '../repositories/student-circulation.repository.js'
import { toBookDetail } from '../rules/book-response.rules.js'

// Bloco de ação do aluno (RF-ACE-02, RF-ACE-08): o que o botão fixo da página faz
// e se está liberado, pela mesma regra que o empréstimo e a fila vão usar.
async function actionBlockFor(
  book: BookRecord,
  studentUid: string,
): Promise<ActionBlock> {
  const [student, limits] = await Promise.all([
    studentCirculationRepository.readStudentCirculation(studentUid),
    readRequestLimits(),
  ])
  const action = suggestedActionOf(book)
  const { allowed, blockedReason } = checkRequestEligibility({
    action,
    book,
    student,
    limits,
    at: await now(),
  })
  return {
    suggestedAction: action,
    allowed,
    ...(blockedReason ? { blockedReason } : {}),
  }
}

// Página do livro (RF-ACE-02, RF-ACE-03, RF-ACE-08). Lê direto do Firestore, não
// do cache, para mostrar os exemplares e a fila do momento. Livro inexistente ou
// removido é 404. Só o aluno recebe o bloco de ação; para o bibliotecário ele é
// null.
export async function getBookPage(
  bookId: string,
  viewer: { uid: string; role: UserRole },
): Promise<BookDetail> {
  const book = await booksRepository.findById(bookId)
  if (!book || book.status !== BOOK_STATUS.active) throw bookNotFound()

  const [copies, action] = await Promise.all([
    copiesRepository.listByBook(bookId),
    viewer.role === USER_ROLE.student
      ? actionBlockFor(book, viewer.uid)
      : Promise.resolve(null),
  ])
  return toBookDetail(book, copies, action)
}
