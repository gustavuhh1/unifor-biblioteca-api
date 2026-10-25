import {
  bearerAuth,
  jsonBody,
  jsonContent,
  registry,
} from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import {
  addToQueueBodySchema,
  joinQueueBodySchema,
  moveEntryBodySchema,
  queueBookParamsSchema,
  queueEntryParamsSchema,
  removeFromQueueBodySchema,
} from './schemas/request.schemas.js'
import {
  confirmTurnResponseSchema,
  endedQueueEntrySchema,
  joinQueueResponseSchema,
  librarianQueueSchema,
  myQueuesResponseSchema,
  queueChangeResponseSchema,
  queuePreviewSchema,
} from './schemas/response.schemas.js'

// Swagger das rotas de fila do aluno (RF-FIL-01 a RF-FIL-06 e RF-FIL-08) e do
// bibliotecário (RF-BAL-06 e RF-BAL-07). Fica pronto antes do código das rotas.

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
  'Perfil errado (`forbidden`): só o aluno usa esta rota.',
)
const notLibrarian = error(
  'Perfil errado (`forbidden`): só o bibliotecário usa esta rota.',
)
const bookNotFound = error(
  'O livro não existe ou foi removido do acervo (`book_not_found`).',
)
const entryNotFoundForStudent = error(
  'O lugar na fila não existe ou não é deste aluno (`queue_entry_not_found`).',
)
const entryNotFound = error(
  'O lugar na fila não existe (`queue_entry_not_found`).',
)
const reasonRequired = error(
  'Faltou o motivo (`reason_required`, com o campo `reason`) ou os dados são inválidos (`validation_error`).',
)

// --- Aluno --------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/books/{bookId}/queue/preview',
  tags: ['Filas (aluno)'],
  summary: 'Vê quantas pessoas estão na frente antes de entrar na fila',
  description:
    'Devolve a edição pedida e as outras edições ativas do mesmo livro, cada uma com as **pessoas na frente** (lugares `waiting` e `your_turn`, calculado na hora) e se o aluno pode entrar (`canJoin`). Quando não pode, `blockedReason` traz o motivo: `unavailable`, `overdue`, `queue_limit` (já tem 7 filas), `not_queueable` (a edição tem exemplar disponível: peça o empréstimo) ou `same_title`. `alreadyInQueue` indica que o aluno já está na fila da edição. O app usa esta lista para o aluno marcar uma ou mais edições (RF-FIL-04).',
  security,
  request: { params: queueBookParamsSchema },
  responses: {
    200: {
      description: 'A prévia da fila de cada edição.',
      content: jsonContent(queuePreviewSchema),
    },
    401: noSession,
    403: notStudent,
    404: bookNotFound,
  },
})

registry.registerPath({
  method: 'post',
  path: '/queues',
  tags: ['Filas (aluno)'],
  summary: 'Entra na fila de uma ou mais edições',
  description:
    'Cria um lugar `waiting` no **fim** da fila de cada edição marcada. As edições precisam ser do mesmo livro; as marcadas juntas ganham o mesmo `editionGroupId` e **cada uma conta como 1 das 7 filas**. Numa transação: `books.queueLength` sobe 1 em cada edição e `activeQueueCount` do aluno sobe o número de edições. Recusas, com o motivo no `code` (a primeira edição que falhar decide): `unavailable` (livro removido ou marcado como indisponível), `overdue` (aluno com empréstimo atrasado), `queue_limit` (passaria de 7 filas), `not_queueable` (a edição tem exemplar disponível), `same_title` (o aluno já tem pedido ou empréstimo desta edição) e `already_in_queue`. Nada é gravado se uma edição for recusada.',
  security,
  request: { body: jsonBody(joinQueueBodySchema) },
  responses: {
    201: {
      description: 'Os lugares criados, com a posição de cada um.',
      content: jsonContent(joinQueueResponseSchema),
    },
    400: error(
      'Dados inválidos (`validation_error`) ou edições de livros diferentes (`editions_mismatch`).',
    ),
    401: noSession,
    403: notStudent,
    404: bookNotFound,
    409: error(
      'Entrada recusada pelas regras: `unavailable`, `overdue`, `queue_limit`, `not_queueable`, `same_title` ou `already_in_queue`.',
    ),
  },
})

registry.registerPath({
  method: 'get',
  path: '/me/queues',
  tags: ['Filas (aluno)'],
  summary: 'Minhas filas',
  description:
    'Lista os lugares ativos do aluno (`waiting` e `your_turn`), com a **posição** e as pessoas na frente calculadas na hora e, em `your_turn`, o `confirmDeadline`. Os mais antigos vêm primeiro.',
  security,
  responses: {
    200: {
      description: 'As filas ativas do aluno.',
      content: jsonContent(myQueuesResponseSchema),
    },
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'post',
  path: '/queues/{entryId}/leave',
  tags: ['Filas (aluno)'],
  summary: 'Sai da fila',
  description:
    'O aluno sai da fila quando quiser (o app pede só a confirmação). Numa transação: o lugar vira `left`, `queueLength` do livro e `activeQueueCount` do aluno caem 1 e, se era a vez dele (`your_turn`), o exemplar guardado passa ao próximo da fila ou volta para a estante. Recusar a vez também é sair da fila.',
  security,
  request: { params: queueEntryParamsSchema },
  responses: {
    200: {
      description: 'O lugar que saiu da fila.',
      content: jsonContent(endedQueueEntrySchema),
    },
    401: noSession,
    403: notStudent,
    404: entryNotFoundForStudent,
    409: error('O lugar já saiu da fila ativa (`queue_entry_not_active`).'),
  },
})

registry.registerPath({
  method: 'post',
  path: '/queues/{entryId}/confirm',
  tags: ['Filas (aluno)'],
  summary: 'Confirma a vez na fila',
  description:
    'Quando o livro volta, o 1º da fila fica em `your_turn` e tem **24 horas corridas** (`confirmDeadline`) para confirmar. Ao confirmar, numa transação: nasce um pedido (`origin: queue`) com **2 dias úteis** para retirar, o lugar vira `fulfilled`, o exemplar guardado passa para o pedido, e os lugares das outras edições marcadas juntas viram `cancelled_other_edition` (liberando as vagas, com aviso). Valem as regras do pedido: `overdue`, `loan_limit` e `same_title` (o livro indisponível para novos pedidos não impede a vez que já existia). Depois do prazo, `turn_expired`: a rotina tira o aluno da fila.',
  security,
  request: { params: queueEntryParamsSchema },
  responses: {
    200: {
      description: 'O pedido criado e as filas das outras edições canceladas.',
      content: jsonContent(confirmTurnResponseSchema),
    },
    401: noSession,
    403: notStudent,
    404: entryNotFoundForStudent,
    409: error(
      'Não deu para confirmar: `queue_entry_not_active`, `not_your_turn` (ainda está esperando), `turn_expired` (passou das 24h), ou uma regra do pedido (`overdue`, `loan_limit`, `same_title`).',
    ),
  },
})

// --- Bibliotecário ------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/librarian/books/{bookId}/queue',
  tags: ['Filas (bibliotecário)'],
  summary: 'Vê a fila de um livro',
  description:
    'A fila ativa da edição, na ordem real (`waiting` e `your_turn`), com nome e matrícula do aluno, quem o colocou na fila, o prazo da vez e quantos avisos já foram enviados.',
  security,
  request: { params: queueBookParamsSchema },
  responses: {
    200: {
      description: 'A fila do livro.',
      content: jsonContent(librarianQueueSchema),
    },
    401: noSession,
    403: notLibrarian,
    404: bookNotFound,
  },
})

registry.registerPath({
  method: 'post',
  path: '/librarian/books/{bookId}/queue',
  tags: ['Filas (bibliotecário)'],
  summary: 'Adiciona um aluno à fila do livro',
  description:
    'Põe o aluno (pela matrícula) na posição escolhida; sem `position`, vai para o fim e nada é perguntado. **À frente de outros:** a primeira chamada (`confirmed: false`) não grava nada e devolve `applied: false` com `movedDown`, a lista de quem desce, para a confirmação de ação perigosa; a segunda (`confirmed: true`) exige o `reason` (sem ele, `reason_required`), grava e avisa quem desceu. O lugar nasce `waiting` com `origin: librarian`, `addedBy` e `addReason`. Valem as regras de entrada na fila (`unavailable`, `overdue`, `queue_limit`, `not_queueable`, `same_title`, `already_in_queue`). Não dá para entrar à frente de quem está na vez (`invalid_position`). Grava no `auditLog` (`queue_add`).',
  security,
  request: {
    params: queueBookParamsSchema,
    body: jsonBody(addToQueueBodySchema),
  },
  responses: {
    201: {
      description: 'O aluno entrou na fila (`applied: true`).',
      content: jsonContent(queueChangeResponseSchema),
    },
    200: {
      description:
        'Passa à frente de outros e falta confirmar (`applied: false`): nada foi gravado.',
      content: jsonContent(queueChangeResponseSchema),
    },
    400: reasonRequired,
    401: noSession,
    403: notLibrarian,
    404: error(
      'O livro não existe (`book_not_found`) ou a matrícula não é de um aluno ativo (`student_not_found`).',
    ),
    409: error(
      'Entrada recusada: `unavailable`, `overdue`, `queue_limit`, `not_queueable`, `same_title`, `already_in_queue` ou `invalid_position`.',
    ),
  },
})

registry.registerPath({
  method: 'patch',
  path: '/librarian/queues/{entryId}/position',
  tags: ['Filas (bibliotecário)'],
  summary: 'Muda a posição de um aluno na fila',
  description:
    'Move um aluno que está `waiting` para a posição escolhida. **Para trás** (ou sem passar ninguém), a mudança é feita direto. **À frente de outros:** a primeira chamada (`confirmed: false`) não grava nada e devolve `applied: false` com `movedDown`, quem desce; a segunda (`confirmed: true`) exige o `reason` (`reason_required`), grava, avisa o aluno movido e quem desceu (`queue_position_changed`) e registra no `auditLog` (`queue_move`, com `movedDown`). Quem está na vez (`your_turn`) não se move (`turn_in_progress`) e ninguém passa à frente dele (`invalid_position`).',
  security,
  request: {
    params: queueEntryParamsSchema,
    body: jsonBody(moveEntryBodySchema),
  },
  responses: {
    200: {
      description:
        'A fila com a mudança (`applied: true`), ou a lista de quem desce, para confirmar (`applied: false`).',
      content: jsonContent(queueChangeResponseSchema),
    },
    400: reasonRequired,
    401: noSession,
    403: notLibrarian,
    404: entryNotFound,
    409: error(
      'Não deu para mover: `queue_entry_not_active`, `turn_in_progress`, `invalid_position` ou `same_position` (já está nessa posição).',
    ),
  },
})

registry.registerPath({
  method: 'post',
  path: '/librarian/queues/{entryId}/resend',
  tags: ['Filas (bibliotecário)'],
  summary: 'Reenvia o aviso da vez',
  description:
    'Só para quem está na vez (`your_turn`): reenvia o aviso "É a sua vez" (o prazo `confirmDeadline` não muda), atualiza `lastNotifiedAt` e `notifyCount` e registra no `auditLog` (`queue_resend_notice`).',
  security,
  request: { params: queueEntryParamsSchema },
  responses: {
    200: {
      description: 'A fila do livro, com o aviso contado.',
      content: jsonContent(librarianQueueSchema),
    },
    401: noSession,
    403: notLibrarian,
    404: entryNotFound,
    409: error(
      'O lugar saiu da fila (`queue_entry_not_active`) ou ainda não é a vez dele (`not_your_turn`).',
    ),
  },
})

registry.registerPath({
  method: 'post',
  path: '/librarian/queues/{entryId}/remove',
  tags: ['Filas (bibliotecário)'],
  summary: 'Remove um aluno da fila, com motivo',
  description:
    'O `reason` é obrigatório. Numa transação: o lugar vira `removed` (`endedBy`, `endReason`), `queueLength` do livro e `activeQueueCount` do aluno caem 1, o aluno é avisado (`queue_removed_by_librarian`) e, se era a vez dele, o exemplar guardado passa ao próximo da fila ou volta para a estante. Registra no `auditLog` (`queue_remove`).',
  security,
  request: {
    params: queueEntryParamsSchema,
    body: jsonBody(removeFromQueueBodySchema),
  },
  responses: {
    200: {
      description: 'A fila do livro, sem o aluno.',
      content: jsonContent(librarianQueueSchema),
    },
    400: invalidData,
    401: noSession,
    403: notLibrarian,
    404: entryNotFound,
    409: error('O lugar já saiu da fila (`queue_entry_not_active`).'),
  },
})
