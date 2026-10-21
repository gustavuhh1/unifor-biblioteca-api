import { AppError } from '../../src/shared/errors.js'

// Pausa entre uma atualização e a seguinte, em milissegundos. Cada livro faz 2
// chamadas ao Google Books; a cota real da Books API ainda será conferida, então
// ajuste este número aqui.
export const SYNC_PAUSE_MS = 1000

// O que o script precisa saber de cada livro ativo.
export interface SyncCandidate {
  id: string
  title: string
  isbn?: string | undefined
}

// Peças que o script usa, trocáveis nos testes para não usar o banco, a rede nem
// o relógio.
export interface SyncDeps {
  // Livros ativos do acervo.
  listBooks: () => Promise<readonly SyncCandidate[]>
  // A mesma atualização da rota POST /librarian/books/:bookId/sync-google. Devolve
  // se o Google encontrou o ISBN e os campos que mudaram.
  sync: (
    bookId: string,
  ) => Promise<{ found: boolean; changedFields: readonly string[] }>
  sleep: (ms: number) => Promise<void>
  log: (line: string) => void
  pauseMs?: number
}

// Resumo do fim da execução (RF-ACE-05).
export interface SyncSummary {
  updated: number
  notFound: number
  failed: number
  withoutIsbn: number
}

// Texto curto do motivo da falha, sem a mensagem do erro (uma mensagem de rede
// poderia carregar a URL da consulta, que tem a chave).
function failureReason(error: unknown): string {
  return error instanceof AppError ? error.code : 'erro inesperado'
}

// Percorre os livros ativos com ISBN e atualiza cada um pelo Google Books, com
// uma pausa entre as chamadas (RF-ACE-05). Livro sem ISBN é ignorado. Uma falha
// em um livro não para os outros. Devolve o resumo.
export async function runCatalogSync(deps: SyncDeps): Promise<SyncSummary> {
  const { listBooks, sync, sleep, log, pauseMs = SYNC_PAUSE_MS } = deps
  const books = await listBooks()
  const withIsbn = books.filter((book) => book.isbn)
  const summary: SyncSummary = {
    updated: 0,
    notFound: 0,
    failed: 0,
    withoutIsbn: books.length - withIsbn.length,
  }

  for (const [index, book] of withIsbn.entries()) {
    if (index > 0) await sleep(pauseMs)
    const label = `[${index + 1}/${withIsbn.length}] ${book.title} (${book.isbn})`
    try {
      const { found, changedFields } = await sync(book.id)
      if (found) {
        summary.updated++
        log(
          `${label}: atualizado (${changedFields.length ? changedFields.join(', ') : 'nada mudou'})`,
        )
      } else {
        summary.notFound++
        log(`${label}: ISBN não encontrado no Google Books`)
      }
    } catch (error) {
      summary.failed++
      log(`${label}: falhou (${failureReason(error)})`)
    }
  }
  return summary
}
