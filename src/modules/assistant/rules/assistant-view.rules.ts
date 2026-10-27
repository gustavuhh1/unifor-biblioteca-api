import { isoOrNull } from '../../../shared/iso-date.js'
import {
  ASSISTANT_SENDER,
  type AssistantActionRecord,
  type AssistantMessageRecord,
  type BlockedReason,
  type BookRecord,
} from '../../../shared/types/index.js'
import { toBookSummary } from '../../catalog/rules/book-response.rules.js'
import { requestRefused } from '../../loans/loans.errors.js'
import type {
  AssistantActionResponse,
  AssistantMessageResponse,
} from '../assistant.types.js'
import type { GeminiContent } from '../gemini/gemini.client.js'

// Conversões do módulo do Assistente: documento para resposta da API e conversa
// para o formato do Gemini. Funções puras.

// Texto do motivo de bloqueio, o mesmo que o pedido e a fila mostram (os textos
// ficam nos erros do empréstimo, sem repetir aqui).
export function blockedMessageOf(reason: BlockedReason): string {
  return requestRefused(reason).message
}

// Os livros da lista de ids que estão no mapa (removidos somem), na mesma ordem.
const booksOf = (
  ids: readonly string[] | undefined,
  books: ReadonlyMap<string, BookRecord>,
) =>
  (ids ?? []).flatMap((id) => {
    const book = books.get(id)
    return book ? [toBookSummary(book)] : []
  })

// Ação do Assistente no formato da API (RF-ASS-04).
export function toActionResponse(
  action: AssistantActionRecord,
  books: ReadonlyMap<string, BookRecord>,
): AssistantActionResponse {
  return {
    id: action.id,
    type: action.type,
    status: action.status,
    books: booksOf(action.bookIds, books),
    blockedReason: action.blockedReason ?? null,
    blockedMessage: action.blockedReason
      ? blockedMessageOf(action.blockedReason)
      : null,
    preview: {
      pickupDeadline: isoOrNull(action.preview.pickupDeadline),
      activeLoansAfter: action.preview.activeLoansAfter ?? null,
      queuePosition: action.preview.queuePosition ?? null,
    },
    expiresAt: action.expiresAt.toISOString(),
    resultLoanId: action.resultLoanId ?? null,
    resultQueueEntryIds: action.resultQueueEntryIds ?? [],
  }
}

// Mensagem da conversa no formato da API (RF-ASS-02, RF-ASS-04).
export function toMessageResponse(
  message: AssistantMessageRecord,
  books: ReadonlyMap<string, BookRecord>,
  actions: ReadonlyMap<string, AssistantActionRecord>,
): AssistantMessageResponse {
  const action = message.actionId ? actions.get(message.actionId) : undefined
  return {
    id: message.id,
    sender: message.sender,
    text: message.text,
    suggestedBooks: booksOf(message.suggestedBookIds, books),
    action: action ? toActionResponse(action, books) : null,
    blockedReason: message.blockedReason ?? null,
    error: message.error ?? false,
    createdAt: message.createdAt.toISOString(),
  }
}

// Ids de livros citados nas mensagens e nas ações, sem repetir (para ler os
// livros de uma vez).
export function bookIdsOf(
  messages: readonly AssistantMessageRecord[],
  actions: Iterable<AssistantActionRecord>,
): string[] {
  const ids = new Set<string>()
  for (const message of messages) {
    message.suggestedBookIds?.forEach((id) => ids.add(id))
  }
  for (const action of actions) action.bookIds.forEach((id) => ids.add(id))
  return [...ids]
}

// As mensagens anteriores no formato do Gemini (só o texto, sem dados do aluno).
// As respostas com erro ficam de fora, para o modelo não repetir a falha.
export function toGeminiHistory(
  messages: readonly AssistantMessageRecord[],
): GeminiContent[] {
  return messages
    .filter((message) => !message.error)
    .map((message) => ({
      role: message.sender === ASSISTANT_SENDER.student ? 'user' : 'model',
      parts: [{ text: message.text }],
    }))
}
