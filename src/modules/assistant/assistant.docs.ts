import {
  bearerAuth,
  jsonBody,
  jsonContent,
  registry,
} from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import {
  actionParamsSchema,
  messageBodySchema,
} from './schemas/request.schemas.js'
import {
  cancelActionResponseSchema,
  confirmActionResponseSchema,
  conversationResponseSchema,
  sendMessageResponseSchema,
} from './schemas/response.schemas.js'

// Swagger das rotas do Assistente (RF-ASS-01 a RF-ASS-07). Todas são só do aluno:
// o bibliotecário recebe 403 (RF-ASS-06).

const error = (description: string) => ({
  description,
  content: jsonContent(errorResponseSchema),
})

const security = [{ [bearerAuth.name]: [] }]

const invalidData = error(
  'Dados inválidos (`validation_error`, com os campos errados).',
)
const noSession = error('Sem sessão ou sessão expirada (`unauthorized`).')
const notStudent = error(
  'Perfil errado (`forbidden`): o Assistente é só do aluno (RF-ASS-06).',
)
const actionNotFound = error(
  'A ação não existe ou é de outro aluno (`assistant_action_not_found`).',
)

const tags = ['Assistente (aluno)']

registry.registerPath({
  method: 'get',
  path: '/me/assistant/messages',
  tags,
  summary: 'Conversa com o Assistente',
  description:
    'As 50 mensagens mais recentes da conversa, da mais antiga para a mais nova, com os livros sugeridos como cartões e a ação proposta (quando houver). Traz também `disclaimer`, o aviso de que a IA pode errar, que o app mostra junto da conversa (RF-ASS-05).',
  security,
  responses: {
    200: {
      description: 'A conversa.',
      content: jsonContent(conversationResponseSchema),
    },
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'post',
  path: '/me/assistant/messages',
  tags,
  summary: 'Pergunta ao Assistente',
  description: [
    'Manda a pergunta ao Gemini e devolve a pergunta salva e a resposta. O Assistente ensina a usar o app (RF-ASS-01), busca no acervo e sugere parecidos (RF-ASS-02), sugere pelo histórico de leitura (RF-ASS-03) e prepara um pedido de empréstimo ou uma entrada na fila (RF-ASS-04).',
    '',
    'A preparação **não executa nada**: a resposta traz `reply.action` com `status: proposed` e a prévia (prazo de retirada, livros depois do pedido ou posição na fila), e o app mostra o cartão para o aluno confirmar em `POST /me/assistant/actions/{actionId}/confirm`. Se uma regra bloqueia (atraso, limite de livros, limite de filas, mesmo título, livro indisponível), a ação vem com `status: blocked`, `blockedReason` e `blockedMessage`, e o app não mostra o botão de confirmar.',
    '',
    'Ao Gemini vão só a pergunta, as mensagens anteriores e dados do acervo; nunca matrícula, e-mail nem nome (RF-ASS-07). Se o Gemini falhar, a resposta vem com `error: true` e um texto pedindo para tentar de novo, e a pergunta fica salva.',
  ].join('\n'),
  security,
  request: { body: jsonBody(messageBodySchema) },
  responses: {
    201: {
      description: 'A pergunta salva e a resposta do Assistente.',
      content: jsonContent(sendMessageResponseSchema),
    },
    400: invalidData,
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'post',
  path: '/me/assistant/actions/{actionId}/confirm',
  tags,
  summary: 'Confirma a ação proposta pelo Assistente',
  description:
    'Executa a ação que está esperando a confirmação, pelo próprio serviço do empréstimo ou da fila, com a origem `assistant`. Todas as regras são conferidas de novo, porque o estado pode ter mudado; se uma delas recusar agora, a ação vira `failed` e a resposta é o mesmo erro do pedido (`POST /loans`) ou da fila (`POST /queues`). A ação vale 15 minutos (`settings/library.assistantActionMinutes`) (RF-ASS-04).',
  security,
  request: { params: actionParamsSchema },
  responses: {
    200: {
      description:
        'Feito: a ação confirmada e o pedido criado (`loan`) ou os lugares na fila (`queueEntries`).',
      content: jsonContent(confirmActionResponseSchema),
    },
    401: noSession,
    403: notStudent,
    404: actionNotFound,
    409: error(
      'A ação não está mais esperando (`assistant_action_not_pending`), o tempo acabou (`assistant_action_expired`) ou uma regra recusou agora (`overdue`, `loan_limit`, `queue_limit`, `same_title`, `unavailable`, `not_queueable`, `no_copy_available`, `already_in_queue`).',
    ),
  },
})

registry.registerPath({
  method: 'post',
  path: '/me/assistant/actions/{actionId}/cancel',
  tags,
  summary: 'Cancela a ação proposta pelo Assistente',
  description:
    'Desiste da ação que está esperando a confirmação. Nada é pedido nem entra na fila (RF-ASS-04).',
  security,
  request: { params: actionParamsSchema },
  responses: {
    200: {
      description: 'A ação cancelada.',
      content: jsonContent(cancelActionResponseSchema),
    },
    401: noSession,
    403: notStudent,
    404: actionNotFound,
    409: error(
      'A ação não está mais esperando (`assistant_action_not_pending`).',
    ),
  },
})
