import { addHours } from 'date-fns'
import { now } from '../../../shared/clock.js'
import { listByStudent } from '../../../shared/repositories/loans.repository.js'
import { recommendFromHistory } from '../../../shared/rules/book-similarity.js'
import { readingHistoryOf } from '../../../shared/rules/reading-history.js'
import {
  BOOK_STATUS,
  type BookRecord,
  type Recommendation,
} from '../../../shared/types/index.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import {
  RECOMMENDATIONS_CACHE_HOURS,
  RECOMMENDATIONS_LIMIT,
} from '../recommendations.constants.js'
import type { RecommendationsResponse } from '../recommendations.types.js'
import * as repository from '../repositories/recommendations.repository.js'
import {
  historyReasonText,
  toRecommendationItem,
} from '../rules/recommendation-view.rules.js'

// Sugestões privadas pelo histórico, sem Gemini, com cache de 24h (RF-ASS-03).
// Aluno sem livro devolvido recebe a lista vazia, sem cache gravado: o modelo
// não define o que mostrar nesse caso (registrado no PR).
export async function listRecommendations(
  uid: string,
): Promise<RecommendationsResponse> {
  const [loans, cached, at] = await Promise.all([
    listByStudent(uid, null),
    repository.findByStudent(uid),
    now(),
  ])
  const history = readingHistoryOf(loans, loans.length)
  const readBooks = (
    await Promise.all(
      history.returnedBookIds.map((id) => booksRepository.findById(id)),
    )
  ).filter((book): book is BookRecord => book !== undefined)
  const isEligible = (book: BookRecord | undefined): book is BookRecord =>
    book !== undefined &&
    book.status === BOOK_STATUS.active &&
    !book.unavailableForNewRequests &&
    !history.borrowedWorkIds.has(book.workId)
  const options = {
    limit: RECOMMENDATIONS_LIMIT,
    excludeWorkIds: history.borrowedWorkIds,
  }

  if (readBooks.length === 0) {
    return {
      reasonText: null,
      items: [],
      generatedAt: at.toISOString(),
      validUntil: addHours(at, RECOMMENDATIONS_CACHE_HOURS).toISOString(),
    }
  }

  let cache: Recommendation
  let suggestions
  if (cached && cached.validUntil.getTime() > at.getTime()) {
    cache = cached
    // Não consulta candidatos novos nem refaz a escolha. Revalida os ids salvos,
    // mantém a ordem do cache e usa a regra apenas para reconstruir cada motivo.
    const books = await Promise.all(
      cached.bookIds.map((id) => booksRepository.findById(id)),
    )
    suggestions = books
      .filter(isEligible)
      .flatMap((book) => recommendFromHistory(readBooks, [book], options))
  } else {
    const candidates = (await booksRepository.listActive()).filter(isEligible)
    suggestions = recommendFromHistory(readBooks, candidates, options)
    cache = {
      bookIds: suggestions.map(({ book }) => book.id),
      reasonText: historyReasonText(readBooks),
      generatedAt: at,
      validUntil: addHours(at, RECOMMENDATIONS_CACHE_HOURS),
      createdAt: cached?.createdAt ?? at,
      updatedAt: at,
    }
    await repository.save(uid, cache)
  }

  return {
    reasonText: cache.reasonText,
    items: suggestions.map(toRecommendationItem),
    generatedAt: cache.generatedAt.toISOString(),
    validUntil: cache.validUntil.toISOString(),
  }
}
