import { constantsOf } from '../../shared/constants-of.js'

// Constantes do módulo do Assistente (RF-ASS-01 a RF-ASS-07).

// Aviso de que a IA pode errar, que o app mostra com a conversa (RF-ASS-05).
export const ASSISTANT_DISCLAIMER =
  'O Assistente usa IA e pode errar. Confira os dados do livro e o resumo da ação antes de confirmar.'

// Texto da resposta quando o Gemini não responde (tela A49). A pergunta do aluno
// fica salva mesmo assim.
export const ASSISTANT_ERROR_TEXT =
  'Não consegui responder agora. Tente de novo em instantes.'

// Tamanho máximo da pergunta do aluno.
export const QUESTION_MAX_LENGTH = 500
// Mensagens que GET /me/assistant/messages devolve (as mais recentes).
export const CONVERSATION_LIST_LIMIT = 50
// Mensagens anteriores da conversa que vão ao Gemini como contexto.
export const CONTEXT_MESSAGES = 10
// Rodadas de ferramentas por pergunta, para a conversa não entrar em laço.
export const MAX_TOOL_ROUNDS = 4
// Livros mostrados como cartões numa resposta, e sugeridos por uma ferramenta.
export const SUGGESTION_LIMIT = 6
// Livros devolvidos ao Gemini por uma busca no acervo.
export const SEARCH_LIMIT = 8
// Livros lidos que entram no resumo do histórico mandado ao Gemini.
export const HISTORY_BOOKS_LIMIT = 10
// Assuntos de cada livro que vão ao Gemini.
export const SUBJECTS_PER_BOOK = 5
// Caracteres da sinopse que vão ao Gemini.
export const SYNOPSIS_MAX_LENGTH = 300

// Gemini: modelo padrão (o GEMINI_MODEL do ambiente troca), endereço da API e
// tempo máximo de espera de cada chamada.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
// Modelo reserva (docs/infra.md): entra quando o principal responde 503 ou 429.
export const DEFAULT_GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite'
// Tempo máximo de cada chamada ao Gemini.
export const GEMINI_TIMEOUT_MS = 15_000
// Tempo máximo de uma pergunta inteira, somando todas as chamadas e tentativas.
// Fica abaixo dos 60 s do Hosting e do Cloud Run, com folga para gravar a resposta.
export const GEMINI_QUESTION_DEADLINE_MS = 40_000
// Tentativas por chamada, alternando o modelo principal e o reserva. O 503 do
// Gemini costuma ser passageiro e responder rápido, então vale insistir; o prazo
// da pergunta limita o total.
export const GEMINI_MAX_ATTEMPTS = 5
// Depois que um modelo falha, as próximas perguntas começam pelo outro durante
// este tempo, em vez de esperar o modelo ruim responder de novo.
export const GEMINI_COOLDOWN_MS = 120_000
// Espera antes de voltar a um modelo que acabou de falhar.
export const GEMINI_RETRY_DELAY_MS = 1_000
// Erros do Gemini que valem uma nova tentativa: excesso de pedidos e instabilidade.
export const GEMINI_RETRYABLE_STATUSES: readonly number[] = [429, 500, 503, 504]

// Ferramentas que o Gemini pode pedir à API. A API executa cada uma com os
// serviços do acervo, do empréstimo e da fila; o Gemini só recebe o resultado.
export const ASSISTANT_TOOLS = [
  'search_catalog',
  'similar_books',
  'recommend_from_history',
  'propose_loan',
  'propose_queue',
] as const
export type AssistantTool = (typeof ASSISTANT_TOOLS)[number]
// Valores com nome: ASSISTANT_TOOL.searchCatalog, ASSISTANT_TOOL.proposeLoan...
export const ASSISTANT_TOOL = constantsOf(ASSISTANT_TOOLS)
