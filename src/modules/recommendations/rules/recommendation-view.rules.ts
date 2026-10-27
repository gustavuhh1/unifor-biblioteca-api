import type {
  HistoryRecommendation,
  SimilarityBook,
} from '../../../shared/rules/book-similarity.js'
import { normalizeText } from '../../../shared/text.js'
import type { BookRecord } from '../../../shared/types/index.js'
import { toBookSummary } from '../../catalog/rules/book-response.rules.js'
import type { RecommendationItem } from '../recommendations.types.js'

// Motivo geral quando os livros devolvidos não têm assunto cadastrado.
const GENERIC_REASON_TEXT = 'Pelo que você leu'

// Motivo geral pelo assunto mais frequente nos livros devolvidos (RF-ASS-03).
// Cada livro conta uma vez por assunto, sem distinguir acentos ou maiúsculas.
// Empate mantém o primeiro assunto encontrado no histórico, que vem por recência.
// Sem assunto nenhum, o texto genérico (o campo é obrigatório no modelo).
export function historyReasonText(
  readBooks: readonly SimilarityBook[],
): string {
  const counts = new Map<string, { label: string; count: number }>()
  for (const book of readBooks) {
    const seen = new Set<string>()
    for (const subject of book.subjects) {
      const key = normalizeText(subject)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const current = counts.get(key)
      counts.set(key, {
        label: current?.label ?? subject.trim(),
        count: (current?.count ?? 0) + 1,
      })
    }
  }
  const [mostRead] = [...counts.values()].sort((a, b) => b.count - a.count)
  return mostRead
    ? `Pelo que você mais leu em ${mostRead.label}`
    : GENERIC_REASON_TEXT
}

// Card do acervo com o título da leitura que mais pesou na sugestão (RF-ASS-03).
export function toRecommendationItem({
  book,
  becauseOfTitle,
}: HistoryRecommendation<BookRecord>): RecommendationItem {
  return {
    book: toBookSummary(book),
    reasonText: `Porque você leu ${becauseOfTitle}`,
  }
}
