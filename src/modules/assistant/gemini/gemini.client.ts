import { env } from '../../../config/env.js'
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_API_URL,
  GEMINI_TIMEOUT_MS,
} from '../assistant.constants.js'

// Adaptador da Gemini API (RF-ASS-07): uma chamada a generateContent com o
// `fetch` do Node, sem SDK. A chave vai no cabeçalho x-goog-api-key, nunca na URL
// (que pode aparecer em log). O módulo só manda o que precisa: a pergunta, o
// histórico da conversa, trechos do acervo e o resumo de leitura, sem matrícula,
// e-mail nem nome.

// Um pedaço de mensagem no formato da Gemini API.
export interface GeminiPart {
  text?: string
  functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
}

// Uma mensagem da conversa com o Gemini.
export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

// Declaração de uma ferramenta que o Gemini pode pedir (function calling).
export interface GeminiFunctionDeclaration {
  name: string
  description: string
  parameters?: Record<string, unknown>
}

// O que vai numa chamada.
export interface GeminiRequest {
  systemInstruction: string
  contents: GeminiContent[]
  tools: GeminiFunctionDeclaration[]
}

// Falha ao falar com o Gemini (sem chave, fora do ar, resposta vazia). Não é
// AppError: o serviço transforma em resposta de erro dentro da conversa.
export class GeminiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeminiError'
  }
}

// Formato da resposta de generateContent que o módulo lê.
interface GenerateContentResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[]
}

// Chama o Gemini e devolve a mensagem do modelo (texto e pedidos de ferramenta).
// Lança GeminiError sem a chave, com erro HTTP, no tempo esgotado ou sem resposta.
export async function generateContent(
  request: GeminiRequest,
  deps: { fetchFn?: typeof fetch; apiKey?: string; model?: string } = {},
): Promise<GeminiContent> {
  const apiKey = deps.apiKey ?? env.GEMINI_API_KEY
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY não configurada.')
  const model = deps.model ?? env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL
  const fetchFn = deps.fetchFn ?? fetch

  let response: Response
  try {
    response = await fetchFn(
      `${GEMINI_API_URL}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemInstruction }] },
          contents: request.contents,
          tools: [{ functionDeclarations: request.tools }],
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    )
  } catch {
    throw new GeminiError('O Gemini não respondeu a tempo.')
  }
  if (!response.ok) {
    throw new GeminiError(`O Gemini respondeu ${response.status}.`)
  }

  const body = (await response.json()) as GenerateContentResponse
  const parts = body.candidates?.[0]?.content?.parts ?? []
  if (parts.length === 0) throw new GeminiError('O Gemini não trouxe resposta.')
  return { role: 'model', parts }
}
