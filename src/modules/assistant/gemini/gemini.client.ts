import {
  ApiError,
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from '@google/genai'
import { env } from '../../../config/env.js'
import {
  DEFAULT_GEMINI_FALLBACK_MODEL,
  DEFAULT_GEMINI_MODEL,
  GEMINI_COOLDOWN_MS,
  GEMINI_MAX_ATTEMPTS,
  GEMINI_RETRYABLE_STATUSES,
  GEMINI_RETRY_DELAY_MS,
  GEMINI_TIMEOUT_MS,
} from '../assistant.constants.js'

// Adaptador da Gemini API (RF-ASS-07), feito com o SDK oficial @google/genai. Uma
// chamada a generateContent, com nova tentativa no modelo reserva quando o Gemini
// está sobrecarregado (503) ou limita os pedidos (429). O módulo só manda o que
// precisa: a pergunta, o histórico da conversa, trechos do acervo e o resumo de
// leitura, sem matrícula, e-mail nem nome.

// Um pedaço de mensagem no formato da Gemini API. `thought` e `thoughtSignature`
// vêm nas respostas dos modelos com raciocínio e têm de voltar como vieram na
// rodada seguinte da conversa.
export interface GeminiPart {
  text?: string
  functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
  thought?: boolean
  thoughtSignature?: string
}

// Uma mensagem da conversa com o Gemini.
export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

// Declaração de uma ferramenta que o Gemini pode pedir (function calling).
// `parameters` é um JSON Schema.
export interface GeminiFunctionDeclaration {
  name: string
  description: string
  parameters?: Record<string, unknown>
}

// O que vai numa chamada. `signal` é o prazo da pergunta inteira: quando ele
// vence, nenhuma tentativa nova começa.
export interface GeminiRequest {
  systemInstruction: string
  contents: GeminiContent[]
  tools: GeminiFunctionDeclaration[]
  signal?: AbortSignal
}

// Falha ao falar com o Gemini (sem chave, fora do ar, resposta vazia). Não é
// AppError: o serviço transforma em resposta de erro dentro da conversa.
export class GeminiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeminiError'
  }
}

// A parte do SDK que o módulo usa; os testes entregam uma versão falsa.
export interface GeminiModels {
  generateContent(
    params: GenerateContentParameters,
  ): Promise<GenerateContentResponse>
}

// O que os testes podem trocar.
export interface GeminiDeps {
  models?: GeminiModels
  apiKey?: string
  model?: string
  fallbackModel?: string
  sleep?: (ms: number) => Promise<void>
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

// O SDK tenta de novo por conta própria (até 5 vezes, com espera de até 60 s).
// Aqui isso fica desligado: quem decide as tentativas, o modelo reserva e o prazo
// é este módulo.
function sdkModels(apiKey: string): GeminiModels {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { retryOptions: { attempts: 1 } },
  }).models
}

// Até quando cada modelo fica "em descanso" depois de uma falha (instante em ms).
const coolingUntil = new Map<string, number>()

const isCooling = (model: string) => (coolingUntil.get(model) ?? 0) > Date.now()

// Ordem das tentativas: o modelo principal e o reserva, alternando. Se o principal
// falhou há pouco e o reserva não, começa pelo reserva.
function attemptOrder(primary: string, fallback: string): string[] {
  const first = isCooling(primary) && !isCooling(fallback) ? fallback : primary
  const second = first === primary ? fallback : primary
  return Array.from({ length: GEMINI_MAX_ATTEMPTS }, (_, i) =>
    i % 2 === 0 ? first : second,
  )
}

function toDeclaration(tool: GeminiFunctionDeclaration): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    ...(tool.parameters ? { parametersJsonSchema: tool.parameters } : {}),
  }
}

// Vale tentar de novo? Sim para excesso de pedidos, instabilidade e falha de
// rede ou de tempo. Não para chave recusada, pedido inválido ou modelo inexistente,
// que dariam o mesmo erro.
function isRetryable(error: unknown): boolean {
  if (error instanceof GeminiError) return false
  if (error instanceof ApiError) {
    return GEMINI_RETRYABLE_STATUSES.includes(error.status)
  }
  return true
}

function toGeminiError(error: unknown, expired: boolean): GeminiError {
  if (error instanceof GeminiError) return error
  if (expired) return new GeminiError('O Gemini não respondeu a tempo.')
  if (error instanceof ApiError) {
    return new GeminiError(`O Gemini respondeu ${error.status}.`)
  }
  return new GeminiError('O Gemini não respondeu.')
}

// Uma chamada a um modelo. Lança GeminiError se vier sem resposta.
async function callModel(
  models: GeminiModels,
  model: string,
  request: GeminiRequest,
): Promise<GeminiContent> {
  const response = await models.generateContent({
    model,
    contents: request.contents as Content[],
    config: {
      systemInstruction: request.systemInstruction,
      ...(request.tools.length > 0
        ? {
            tools: [{ functionDeclarations: request.tools.map(toDeclaration) }],
          }
        : {}),
      ...(request.signal ? { abortSignal: request.signal } : {}),
      httpOptions: { timeout: GEMINI_TIMEOUT_MS },
    },
  })
  const parts = (response.candidates?.[0]?.content?.parts ?? []) as GeminiPart[]
  if (parts.length === 0) throw new GeminiError('O Gemini não trouxe resposta.')
  return { role: 'model', parts }
}

// Chama o Gemini e devolve a mensagem do modelo (texto e pedidos de ferramenta).
// Com 503, 429, erro 5xx ou falha de rede, tenta o outro modelo e alterna até 5
// vezes, enquanto o prazo da pergunta não vencer. Lança GeminiError
// sem a chave, com erro que não adianta repetir, no prazo esgotado, depois da
// última tentativa ou sem resposta.
export async function generateContent(
  request: GeminiRequest,
  deps: GeminiDeps = {},
): Promise<GeminiContent> {
  const apiKey = deps.apiKey ?? env.GEMINI_API_KEY
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY não configurada.')
  const primary = deps.model ?? env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL
  const fallback = deps.fallbackModel ?? DEFAULT_GEMINI_FALLBACK_MODEL
  const models = deps.models ?? sdkModels(apiKey)
  const sleep = deps.sleep ?? wait

  const order = attemptOrder(primary, fallback)
  let last = new GeminiError('O Gemini não respondeu.')
  for (const [index, model] of order.entries()) {
    if (request.signal?.aborted) {
      throw new GeminiError('O Gemini não respondeu a tempo.')
    }
    // Trocar para um modelo ainda não tentado é imediato; voltar a um que já
    // falhou espera um pouco.
    if (order.indexOf(model) < index) await sleep(GEMINI_RETRY_DELAY_MS)
    try {
      return await callModel(models, model, request)
    } catch (error) {
      last = toGeminiError(error, request.signal?.aborted ?? false)
      if (!isRetryable(error) || request.signal?.aborted) throw last
      coolingUntil.set(model, Date.now() + GEMINI_COOLDOWN_MS)
      const next = order[index + 1]
      console.warn(
        `[assistant] ${model}: ${last.message}${next ? ` Tentando ${next}.` : ''}`,
      )
    }
  }
  throw last
}
