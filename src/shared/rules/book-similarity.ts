import { normalizeText } from '../text.js'

// Livros parecidos pelo assunto e pelo autor (RF-ASS-02, RF-ASS-03). Regra pura,
// sem Firestore: quem chama passa os livros ativos do acervo. Fica em shared
// porque o Assistente e o "Recomendados para você" usam a mesma regra.

// O que a regra precisa saber de um livro.
export interface SimilarityBook {
  id: string
  workId: string
  title: string
  authors: readonly string[]
  subjects: readonly string[]
}

// Peso de cada assunto e de cada autor em comum.
const SUBJECT_WEIGHT = 2
const AUTHOR_WEIGHT = 1

// Ordem alfabética do português do Brasil, para desempatar pelo título.
const TITLE_COLLATOR = new Intl.Collator('pt-BR')

const normalizedSet = (values: readonly string[]) =>
  new Set(values.map(normalizeText).filter(Boolean))

const sharedCount = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  [...a].filter((value) => b.has(value)).length

// Pontuação de parecença entre dois livros: assuntos em comum valem mais que
// autores em comum. Sem acento e sem diferenciar maiúsculas. Zero quando não há
// nada em comum.
export function similarityScore(a: SimilarityBook, b: SimilarityBook): number {
  return (
    SUBJECT_WEIGHT *
      sharedCount(normalizedSet(a.subjects), normalizedSet(b.subjects)) +
    AUTHOR_WEIGHT *
      sharedCount(normalizedSet(a.authors), normalizedSet(b.authors))
  )
}

// Fica com uma edição por obra, na ordem em que chegaram (a primeira ganha).
function onePerWork<T extends { book: SimilarityBook }>(items: readonly T[]) {
  const seen = new Set<string>()
  return items.filter(({ book }) => {
    if (seen.has(book.workId)) return false
    seen.add(book.workId)
    return true
  })
}

// Livros parecidos com `target` (RF-ASS-02): os que têm assunto ou autor em
// comum, de outra obra e fora de `excludeWorkIds`, uma edição por obra, do mais
// parecido ao menos parecido (empate pelo título), até `limit`.
export function rankSimilarBooks<T extends SimilarityBook>(
  target: SimilarityBook,
  candidates: readonly T[],
  options: { limit: number; excludeWorkIds?: ReadonlySet<string> },
): T[] {
  const exclude = options.excludeWorkIds ?? new Set<string>()
  const scored = candidates
    .filter(
      (book) => book.workId !== target.workId && !exclude.has(book.workId),
    )
    .map((book) => ({ book, score: similarityScore(target, book) }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || TITLE_COLLATOR.compare(a.book.title, b.book.title),
    )
  return onePerWork(scored)
    .slice(0, options.limit)
    .map(({ book }) => book)
}

// Uma sugestão pelo histórico: o livro e o título lido que mais pesou nela
// (para o texto "Porque você leu ...").
export interface HistoryRecommendation<T> {
  book: T
  becauseOfTitle: string
}

// Sugestões pelo histórico de leitura (RF-ASS-03): cada candidato é comparado com
// todos os livros lidos e vale a maior pontuação; obras já lidas ou em
// `excludeWorkIds` (pedidas, emprestadas) ficam de fora. Uma edição por obra, da
// maior pontuação para a menor (empate pelo título), até `limit`. Sem livros
// lidos, a lista sai vazia.
export function recommendFromHistory<T extends SimilarityBook>(
  readBooks: readonly SimilarityBook[],
  candidates: readonly T[],
  options: { limit: number; excludeWorkIds?: ReadonlySet<string> },
): HistoryRecommendation<T>[] {
  const exclude = new Set([
    ...readBooks.map((book) => book.workId),
    ...(options.excludeWorkIds ?? []),
  ])
  const scored = candidates
    .filter((book) => !exclude.has(book.workId))
    .map((book) => {
      let best = { score: 0, becauseOfTitle: '' }
      for (const read of readBooks) {
        const score = similarityScore(read, book)
        if (score > best.score) best = { score, becauseOfTitle: read.title }
      }
      return { book, ...best }
    })
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || TITLE_COLLATOR.compare(a.book.title, b.book.title),
    )
  return onePerWork(scored)
    .slice(0, options.limit)
    .map(({ book, becauseOfTitle }) => ({ book, becauseOfTitle }))
}
