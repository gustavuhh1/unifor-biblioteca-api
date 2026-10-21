import type { BookRecord } from './types/index.js'

// Cache em memória dos livros ativos (RF-ACE-01, RNF-DES-01). A busca não lê o
// Firestore a cada pedido: carrega o acervo uma vez e o guarda por pouco tempo,
// em cada instância da API.

// Quanto tempo o acervo carregado vale (em milissegundos).
export const CATALOG_CACHE_TTL_MS = 60_000

interface CacheEntry {
  books: readonly BookRecord[]
  expiresAt: number
}

let entry: CacheEntry | undefined

// Devolve os livros ativos do cache; se o cache está vazio ou venceu, carrega com
// `load` e guarda. `nowMs` existe só para os testes controlarem o relógio.
export async function getCachedActiveBooks(
  load: () => Promise<readonly BookRecord[]>,
  nowMs: number = Date.now(),
): Promise<readonly BookRecord[]> {
  if (entry && entry.expiresAt > nowMs) return entry.books
  const books = await load()
  entry = { books, expiresAt: nowMs + CATALOG_CACHE_TTL_MS }
  return books
}

// Descarta o cache: o próximo acesso recarrega o acervo. Chame depois de gravar
// qualquer coisa que a busca mostra: cadastrar, editar, remover, marcar
// indisponível, atualizar pelo Google Books e, nos módulos de empréstimo e fila,
// tudo que muda copiesAvailable, queueLength ou nextReturnAt.
export function invalidateCatalogCache(): void {
  entry = undefined
}
