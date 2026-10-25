import {
  bearerAuth,
  jsonBody,
  jsonContent,
  registry,
} from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import { loanParamsSchema } from '../loans/schemas/request.schemas.js'
import {
  deskLookupBodySchema,
  pickupsQuerySchema,
  returnLoanBodySchema,
} from './schemas/request.schemas.js'
import {
  deskLookupResponseSchema,
  deskSummaryResponseSchema,
  pickupResponseSchema,
  pickupsResponseSchema,
  returnResponseSchema,
} from './schemas/response.schemas.js'

// Swagger das rotas do balcão do bibliotecário (RF-BAL-01 a RF-BAL-05 e
// RF-BAL-08). A gestão da fila (RF-BAL-06, RF-BAL-07) e a aba Multas
// (RF-BAL-09) estão nos módulos de filas e de multas. Fica pronto antes do código
// das rotas. Todas exigem sessão do bibliotecário.

const error = (description: string) => ({
  description,
  content: jsonContent(errorResponseSchema),
})

const security = [{ [bearerAuth.name]: [] }]
const tags = ['Balcão (bibliotecário)']

const invalidData = error(
  'Dados inválidos (`validation_error`, com os campos errados).',
)
const noSession = error('Sem sessão ou sessão expirada (`unauthorized`).')
const notLibrarian = error(
  'Perfil errado (`forbidden`): só o bibliotecário usa esta rota.',
)

registry.registerPath({
  method: 'post',
  path: '/librarian/desk/lookup',
  tags,
  summary: 'Ficha do aluno: por QR, código do pedido ou matrícula',
  description:
    'Abre a ficha do aluno (tela Identificar aluno). Informe **exatamente um**: `qrToken` (lido do QR do pedido), `pickupCode` ("RET-4821", digitado) ou `matricula` (7 dígitos). A ficha traz o aluno ("3 de 10 livros"), os pedidos **aguardando retirada** (`pickups`, com `scanned` no que o QR ou o código apontou), os livros **com o aluno** (`withStudent`, com a multa já acumulada dos atrasados) e `blockedReason: "overdue"` quando um livro atrasado impede a retirada. É POST, e não GET, para o `qrToken` não aparecer na URL do log. Nenhuma resposta devolve o `qrToken`.',
  security,
  request: {
    body: jsonBody(deskLookupBodySchema),
  },
  responses: {
    200: {
      description: 'A ficha do aluno.',
      content: jsonContent(deskLookupResponseSchema),
    },
    400: invalidData,
    401: noSession,
    403: notLibrarian,
    404: error(
      'O pedido não existe ou o código não é de um pedido aguardando retirada (`loan_not_found`), ou a matrícula não é de um aluno ativo (`student_not_found`).',
    ),
    409: error(
      'O QR é de um pedido que não está mais aguardando a retirada (`loan_not_awaiting_pickup`): já retirado, devolvido, cancelado ou expirado.',
    ),
  },
})

registry.registerPath({
  method: 'post',
  path: '/librarian/loans/{loanId}/pickup',
  tags,
  summary: 'Registra a retirada de um pedido',
  description:
    'Entrega o exemplar ao aluno. Numa transação: o pedido vira `active` (`pickedUpAt`, `pickedUpBy`), o **empréstimo de 14 dias começa a contar** (`dueAt` no fechamento da biblioteca; se cair em domingo, feriado ou recesso, vai para o próximo dia aberto), o exemplar vira `on_loan`, `nextReturnAt` do livro é atualizado e a ação vai para o `auditLog` (`loan_pickup`). Recusada se o aluno tem **livro atrasado** (`overdue`, RF-EMP-04) ou se o prazo de retirada já passou (`pickup_expired`). Multa em aberto sem atraso não bloqueia.',
  security,
  request: { params: loanParamsSchema },
  responses: {
    200: {
      description: 'O empréstimo ativo, com o vencimento.',
      content: jsonContent(pickupResponseSchema),
    },
    401: noSession,
    403: notLibrarian,
    404: error('O pedido não existe (`loan_not_found`).'),
    409: error(
      'O pedido não está aguardando a retirada (`loan_not_awaiting_pickup`), o prazo passou (`pickup_expired`) ou o aluno tem livro atrasado (`overdue`).',
    ),
  },
})

registry.registerPath({
  method: 'post',
  path: '/librarian/loans/{loanId}/return',
  tags,
  summary: 'Registra a devolução de um livro',
  description:
    'Recebe o livro de volta (tela Registrar devolução). Numa transação: o empréstimo vira `returned`, `activeLoanCount` do aluno cai 1, `booksReadByYear` sobe 1, **a multa para de contar** (R$ 2,00 por dia útil de atraso; fica `open` até o pagamento no balcão) e o exemplar vai para o **1º da fila**, que ganha a vez e é avisado na hora, ou volta à estante. Com `finePaidNow: true` ("Multa paga agora", depois de receber o valor), a multa fecha como `paid`. A ação vai para o `auditLog` (`loan_return`). Livro devolvido no prazo não gera multa (`fine: null`).',
  security,
  request: {
    params: loanParamsSchema,
    body: { content: jsonContent(returnLoanBodySchema), required: false },
  },
  responses: {
    200: {
      description: 'O empréstimo devolvido, a multa e se a fila foi avisada.',
      content: jsonContent(returnResponseSchema),
    },
    400: invalidData,
    401: noSession,
    403: notLibrarian,
    404: error('O empréstimo não existe (`loan_not_found`).'),
    409: error(
      'O livro não está com o aluno (`loan_not_active`): ainda não foi retirado ou já foi devolvido.',
    ),
  },
})

registry.registerPath({
  method: 'get',
  path: '/librarian/pickups',
  tags,
  summary: 'Retiradas: pedidos aguardando retirada',
  description:
    'Lista única de pedidos aguardando retirada, **do prazo mais curto ao mais longo**, com busca opcional pelos primeiros dígitos da matrícula em `matricula` (RF-BAL-05). Cada item traz o código curto, o aluno, o livro e a estante. Não traz o `qrToken`.',
  security,
  request: { query: pickupsQuerySchema },
  responses: {
    200: {
      description: 'Os pedidos aguardando retirada.',
      content: jsonContent(pickupsResponseSchema),
    },
    400: invalidData,
    401: noSession,
    403: notLibrarian,
  },
})

registry.registerPath({
  method: 'get',
  path: '/librarian/desk/summary',
  tags,
  summary: 'Painel: os números do dia',
  description:
    'Os quatro números do Painel (RF-BAL-01): **pedidos aguardando retirada**, **devoluções registradas hoje** (fuso de Fortaleza), **lugares na fila esperando o aluno confirmar** e **multas em aberto**.',
  security,
  responses: {
    200: {
      description: 'Os números do dia.',
      content: jsonContent(deskSummaryResponseSchema),
    },
    401: noSession,
    403: notLibrarian,
  },
})
