import { normalizeText } from './text.js'

// Os campos de um livro que entram no texto de busca.
export interface SearchableBook {
  title: string
  subtitle?: string | undefined
  authors: readonly string[]
  subjects: readonly string[]
  isbn?: string | undefined
}

// Monta o `searchText` do livro (docs/modelo-de-dados-firestore.md, seções 2.7 e
// 6.4): título, subtítulo, autores, assuntos e ISBN, em minúsculas, sem acento e
// com os espaços normalizados. Usada no cadastro, na edição, na atualização pelas
// fontes externas e no seed (RF-ACE-01).
export function buildSearchText(book: SearchableBook): string {
  return normalizeText(
    [book.title, book.subtitle, ...book.authors, ...book.subjects, book.isbn]
      .filter(Boolean)
      .join(' '),
  )
}

// Separa o que o aluno digitou nos termos da busca, com a mesma normalização do
// `searchText`. Busca vazia devolve a lista vazia.
export function searchTermsOf(query: string): string[] {
  const normalized = normalizeText(query)
  return normalized ? normalized.split(' ') : []
}
