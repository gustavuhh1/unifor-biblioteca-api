import { getCachedActiveBooks } from '../../../shared/catalog-cache.js'
import { formatLocalDateTime } from '../../../shared/calendar/dates.js'
import {
  rankSimilarBooks,
  recommendFromHistory,
} from '../../../shared/rules/book-similarity.js'
import * as loansRepository from '../../../shared/repositories/loans.repository.js'
import { searchTermsOf } from '../../../shared/search-text.js'
import {
  ASSISTANT_ACTION_STATUS,
  type BookRecord,
} from '../../../shared/types/index.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import { searchBooks } from '../../catalog/rules/catalog-search.rules.js'
import {
  ASSISTANT_TOOL,
  SEARCH_LIMIT,
  SUGGESTION_LIMIT,
} from '../assistant.constants.js'
import { blockedMessageOf } from '../rules/assistant-view.rules.js'
import { toToolBook } from '../rules/catalog-view.rules.js'
import { readingHistoryOf } from '../rules/reading-history.rules.js'
import type { ToolCall } from '../rules/tools.rules.js'
import {
  proposeLoan,
  proposeQueue,
  type ProposalResult,
} from './assistant-actions.service.js'

// Executa as ferramentas que o Gemini pede (RF-ASS-02 a RF-ASS-04, RF-ASS-07)
// com os serviços e as regras que já existem. O resultado vai de volta ao Gemini
// e só tem dados do acervo; o que a resposta mostra (cartões de livro e a ação)
// fica anotado no contexto.

// O que a resposta vai mostrar, juntado ao longo das ferramentas.
export interface ToolContext {
  uid: string
  suggestedBookIds: string[]
  actionId?: string
  blockedReason?: string
}

type ToolResult = Record<string, unknown>

const activeBooks = () => getCachedActiveBooks(booksRepository.listActive)

// Anota os livros como cartões da resposta, sem repetir, até o limite.
function suggest(ctx: ToolContext, books: readonly BookRecord[]) {
  for (const book of books) {
    if (ctx.suggestedBookIds.length >= SUGGESTION_LIMIT) return
    if (!ctx.suggestedBookIds.includes(book.id))
      ctx.suggestedBookIds.push(book.id)
  }
}

// Busca no acervo (RF-ASS-02): primeiro com todos os termos, como a busca do app;
// sem resultado, fica com os livros que têm mais termos da pergunta.
function searchActive(books: readonly BookRecord[], query: string) {
  const all = searchBooks(books, { q: query })
  if (all.length > 0) return all
  const terms = searchTermsOf(query)
  if (terms.length < 2) return []
  const hits = new Map<string, { book: BookRecord; count: number }>()
  for (const term of terms) {
    for (const book of searchBooks(books, { q: term })) {
      const hit = hits.get(book.id) ?? { book, count: 0 }
      hit.count += 1
      hits.set(book.id, hit)
    }
  }
  return [...hits.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ book }) => book)
}

// Livros que podem ser sugeridos: ativos e abertos a novos pedidos.
const suggestable = (books: readonly BookRecord[]) =>
  books.filter((book) => !book.unavailableForNewRequests)

// Resultado de uma ação preparada, no formato que o Gemini lê.
function proposalToResult(
  result: ProposalResult,
  ctx: ToolContext,
): ToolResult {
  switch (result.kind) {
    case 'book_not_found':
      return { error: 'Livro não encontrado no acervo.' }
    case 'editions_mismatch':
      return { error: 'As edições marcadas precisam ser do mesmo livro.' }
    case 'already_in_queue':
      return {
        status: 'already_in_queue',
        note: 'O aluno já está na fila deste livro.',
      }
    case 'no_copy':
      return {
        status: 'no_copy_available',
        note: `Não há exemplar disponível agora. Ofereça entrar na fila (${ASSISTANT_TOOL.proposeQueue}).`,
      }
    case 'action': {
      const { action } = result
      ctx.actionId = action.id
      if (
        action.status === ASSISTANT_ACTION_STATUS.blocked &&
        action.blockedReason
      ) {
        const blockedMessage = blockedMessageOf(action.blockedReason)
        ctx.blockedReason = blockedMessage
        return {
          status: 'blocked',
          blockedReason: action.blockedReason,
          blockedMessage,
        }
      }
      const { pickupDeadline, activeLoansAfter, queuePosition } = action.preview
      return {
        status: 'waiting_confirmation',
        note: 'O cartão de confirmação vai aparecer para o aluno. Nada foi feito ainda.',
        ...(pickupDeadline
          ? { pickupDeadline: formatLocalDateTime(pickupDeadline) }
          : {}),
        ...(activeLoansAfter ? { activeLoansAfter } : {}),
        ...(queuePosition ? { queuePosition } : {}),
      }
    }
  }
}

// Executa uma ferramenta já validada e devolve o resultado para o Gemini.
export async function runTool(
  call: ToolCall,
  ctx: ToolContext,
): Promise<ToolResult> {
  switch (call.name) {
    case ASSISTANT_TOOL.searchCatalog: {
      const found = searchActive(await activeBooks(), call.args.query).slice(
        0,
        SEARCH_LIMIT,
      )
      suggest(ctx, found)
      return found.length > 0
        ? { books: found.map(toToolBook) }
        : { books: [], note: 'Nenhum livro do acervo corresponde à busca.' }
    }
    case ASSISTANT_TOOL.similarBooks: {
      const books = await activeBooks()
      const base = books.find((book) => book.id === call.args.bookId)
      if (!base) return { error: 'Livro não encontrado no acervo.' }
      const similar = rankSimilarBooks(base, suggestable(books), {
        limit: SUGGESTION_LIMIT,
      })
      suggest(ctx, similar)
      return { baseTitle: base.title, books: similar.map(toToolBook) }
    }
    case ASSISTANT_TOOL.recommendFromHistory: {
      const [books, loans] = await Promise.all([
        activeBooks(),
        loansRepository.listByStudent(ctx.uid),
      ])
      const history = readingHistoryOf(loans)
      const byId = new Map(books.map((book) => [book.id, book]))
      const read = await Promise.all(
        history.returnedBookIds.map(
          async (id) => byId.get(id) ?? (await booksRepository.findById(id)),
        ),
      )
      const readBooks = read.filter((book) => book !== undefined)
      if (readBooks.length === 0) {
        return {
          books: [],
          note: 'O aluno ainda não devolveu nenhum livro. Sugira buscar por um assunto de interesse.',
        }
      }
      const picks = recommendFromHistory(readBooks, suggestable(books), {
        limit: SUGGESTION_LIMIT,
        excludeWorkIds: history.borrowedWorkIds,
      })
      suggest(
        ctx,
        picks.map(({ book }) => book),
      )
      return {
        books: picks.map(({ book, becauseOfTitle }) => ({
          ...toToolBook(book),
          becauseOfTitle,
        })),
      }
    }
    case ASSISTANT_TOOL.proposeLoan:
      return proposalToResult(await proposeLoan(ctx.uid, call.args.bookId), ctx)
    case ASSISTANT_TOOL.proposeQueue:
      return proposalToResult(
        await proposeQueue(ctx.uid, call.args.bookIds),
        ctx,
      )
  }
}
