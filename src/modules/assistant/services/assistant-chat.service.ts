import { getCachedActiveBooks } from '../../../shared/catalog-cache.js'
import { now } from '../../../shared/clock.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import {
  ASSISTANT_SENDER,
  type AssistantMessage,
  type AssistantMessageRecord,
  type BookRecord,
} from '../../../shared/types/index.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import {
  ASSISTANT_DISCLAIMER,
  ASSISTANT_ERROR_TEXT,
  CONTEXT_MESSAGES,
  CONVERSATION_LIST_LIMIT,
  MAX_TOOL_ROUNDS,
} from '../assistant.constants.js'
import type {
  ConversationResponse,
  SendMessageResponse,
} from '../assistant.types.js'
import {
  GeminiError,
  generateContent,
  type GeminiContent,
  type GeminiPart,
} from '../gemini/gemini.client.js'
import * as actionsRepository from '../repositories/assistant-actions.repository.js'
import * as messagesRepository from '../repositories/assistant-messages.repository.js'
import { buildSystemInstruction } from '../rules/app-guide.rules.js'
import {
  bookIdsOf,
  toGeminiHistory,
  toMessageResponse,
} from '../rules/assistant-view.rules.js'
import { parseToolCall, TOOL_DECLARATIONS } from '../rules/tools.rules.js'
import { runTool, type ToolContext } from './assistant-tools.service.js'

// Conversa com o Assistente (RF-ASS-01 a RF-ASS-07). Cada pergunta vai ao Gemini
// com a instrução de sistema, as mensagens anteriores e as ferramentas; a API
// executa as ferramentas que ele pede e devolve o resultado, até ele responder em
// texto. Ao Gemini vai só a conversa e os dados do acervo: nunca matrícula,
// e-mail, nome nem o uid (RF-ASS-07).

// Monta as respostas das mensagens, lendo de uma vez os livros e as ações.
async function toResponses(
  uid: string,
  messages: readonly AssistantMessageRecord[],
) {
  const actionIds = [
    ...new Set(messages.flatMap((m) => (m.actionId ? [m.actionId] : []))),
  ]
  const [books, actions] = await Promise.all([
    getCachedActiveBooks(booksRepository.listActive),
    actionsRepository.findManyByIds(uid, actionIds),
  ])
  const actionMap = new Map(actions.map((action) => [action.id, action]))
  const wanted = new Set(bookIdsOf(messages, actions))
  const bookMap = new Map<string, BookRecord>(
    books.filter((book) => wanted.has(book.id)).map((book) => [book.id, book]),
  )
  return messages.map((message) =>
    toMessageResponse(message, bookMap, actionMap),
  )
}

// A conversa do aluno, com o aviso de que a IA pode errar (RF-ASS-05).
export async function listConversation(
  uid: string,
): Promise<ConversationResponse> {
  const messages = await messagesRepository.listLatest(
    uid,
    CONVERSATION_LIST_LIMIT,
  )
  return {
    disclaimer: ASSISTANT_DISCLAIMER,
    items: await toResponses(uid, messages),
  }
}

// O texto da resposta do modelo (as partes de texto juntas).
const textOf = (parts: readonly GeminiPart[]) =>
  parts
    .map((part) => part.text ?? '')
    .join('')
    .trim()

// Conversa com o Gemini até ele responder em texto, executando as ferramentas que
// ele pede (no máximo MAX_TOOL_ROUNDS rodadas).
async function converse(
  systemInstruction: string,
  contents: GeminiContent[],
  ctx: ToolContext,
): Promise<string> {
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const reply = await generateContent({
      systemInstruction,
      contents,
      tools: TOOL_DECLARATIONS,
    })
    const calls = reply.parts.flatMap((part) =>
      part.functionCall ? [part.functionCall] : [],
    )
    if (calls.length === 0) {
      const text = textOf(reply.parts)
      if (!text) throw new GeminiError('O Gemini respondeu sem texto.')
      return text
    }
    if (round === MAX_TOOL_ROUNDS) break
    contents.push(reply)
    const responses: GeminiPart[] = []
    for (const call of calls) {
      const parsed = parseToolCall(call.name, call.args)
      const response = parsed
        ? await runTool(parsed, ctx)
        : { error: 'Ferramenta ou argumento inválido.' }
      responses.push({ functionResponse: { name: call.name, response } })
    }
    contents.push({ role: 'user', parts: responses })
  }
  throw new GeminiError('O Gemini pediu ferramentas demais.')
}

// Recebe a pergunta do aluno, conversa com o Gemini e grava a pergunta e a
// resposta (RF-ASS-01 a RF-ASS-04). Se o Gemini falhar, a resposta é a de erro
// (tela A49) e a pergunta fica salva do mesmo jeito.
export async function sendMessage(
  uid: string,
  text: string,
): Promise<SendMessageResponse> {
  const [previous, settings] = await Promise.all([
    messagesRepository.listLatest(uid, CONTEXT_MESSAGES),
    readLoanSettings(),
  ])
  const askedAt = await now()
  const question = await messagesRepository.create(uid, {
    sender: ASSISTANT_SENDER.student,
    text,
    createdAt: askedAt,
    updatedAt: askedAt,
  })

  const ctx: ToolContext = { uid, suggestedBookIds: [] }
  let reply: AssistantMessage
  try {
    const answer = await converse(
      buildSystemInstruction(settings),
      [...toGeminiHistory(previous), { role: 'user', parts: [{ text }] }],
      ctx,
    )
    const at = await now()
    reply = {
      sender: ASSISTANT_SENDER.assistant,
      text: answer,
      ...(ctx.suggestedBookIds.length
        ? { suggestedBookIds: ctx.suggestedBookIds }
        : {}),
      ...(ctx.actionId ? { actionId: ctx.actionId } : {}),
      ...(ctx.blockedReason ? { blockedReason: ctx.blockedReason } : {}),
      createdAt: at,
      updatedAt: at,
    }
  } catch (error) {
    if (!(error instanceof GeminiError)) throw error
    // Só o motivo técnico vai ao log, nunca a pergunta do aluno.
    console.warn(`[assistant] ${error.message}`)
    const at = await now()
    reply = {
      sender: ASSISTANT_SENDER.assistant,
      text: ASSISTANT_ERROR_TEXT,
      error: true,
      createdAt: at,
      updatedAt: at,
    }
  }
  const saved = await messagesRepository.create(uid, reply)
  const [questionResponse, replyResponse] = await toResponses(uid, [
    question,
    saved,
  ])
  return {
    disclaimer: ASSISTANT_DISCLAIMER,
    question: questionResponse!,
    reply: replyResponse!,
  }
}
