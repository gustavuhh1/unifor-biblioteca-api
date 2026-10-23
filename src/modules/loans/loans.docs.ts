import type { ZodType } from 'zod'
import { bearerAuth, jsonContent, registry } from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import {
  createLoanBodySchema,
  loanParamsSchema,
  myLoansQuerySchema,
} from './schemas/request.schemas.js'
import {
  loanSchema,
  myLoansResponseSchema,
} from './schemas/response.schemas.js'

// Swagger das rotas de empréstimo do aluno (RF-EMP-01, 02, 03, 04, 05, 07, 08, 09,
// 10 e 11). Fica pronto antes do código das rotas.

const body = (schema: ZodType) => ({
  required: true,
  content: jsonContent(schema),
})
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
const loanNotFound = error(
  'O pedido não existe ou não é deste aluno (`loan_not_found`).',
)

registry.registerPath({
  method: 'post',
  path: '/loans',
  tags: ['Empréstimos (aluno)'],
  summary: 'Solicita um empréstimo',
  description:
    'Separa um exemplar disponível para o aluno, que tem **2 dias úteis** para retirar (`pickupDeadline`, no fechamento da biblioteca). Numa transação: cria o pedido (`awaiting_pickup`), o exemplar vira `reserved`, `copiesAvailable` do livro cai 1 e `activeLoanCount` do aluno sobe 1. Devolve o `pickupCode` ("RET-4821") e o `qrToken` do QR da retirada. Recusas, nesta ordem, com o motivo no `code`: `unavailable` (livro removido ou marcado como indisponível para novos pedidos), `overdue` (aluno com empréstimo atrasado), `same_title` (já tem pedido ou empréstimo do mesmo título, de qualquer edição), `loan_limit` (já tem 10), e `no_copy_available` (sem exemplar disponível, ou com fila: o caminho é entrar na fila).',
  security,
  request: { body: body(createLoanBodySchema) },
  responses: {
    201: {
      description: 'Pedido criado.',
      content: jsonContent(loanSchema),
    },
    400: invalidData,
    401: noSession,
    403: notStudent,
    404: error('O livro não existe (`book_not_found`).'),
    409: error(
      'Pedido recusado pelas regras: `unavailable`, `overdue`, `same_title`, `loan_limit` ou `no_copy_available`.',
    ),
  },
})

registry.registerPath({
  method: 'get',
  path: '/me/loans',
  tags: ['Empréstimos (aluno)'],
  summary: 'Meus empréstimos',
  description:
    'Lista os pedidos e empréstimos do aluno logado. `view=active` (padrão) traz os pedidos para retirar e os empréstimos ativos; `view=history` traz os devolvidos, expirados e cancelados. Cada item traz o `state` calculado na hora (Pronto para retirar, Em andamento, Vence em breve, Atrasado), o `progress` do prazo e, nos ativos, se a renovação é possível (`canRenew`) e o motivo de não ser (`renewalDenialReason`). Os mais novos vêm primeiro (até 200 itens).',
  security,
  request: { query: myLoansQuerySchema },
  responses: {
    200: {
      description: 'Os pedidos e empréstimos da aba pedida.',
      content: jsonContent(myLoansResponseSchema),
    },
    400: invalidData,
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'post',
  path: '/loans/{loanId}/cancel',
  tags: ['Empréstimos (aluno)'],
  summary: 'Cancela um pedido antes da retirada',
  description:
    'Só vale para pedido `awaiting_pickup`. Numa transação: o pedido vira `cancelled`, `activeLoanCount` do aluno cai 1 e o exemplar volta (hoje para a estante; quando a fila existir, para o 1º da fila).',
  security,
  request: { params: loanParamsSchema },
  responses: {
    200: {
      description: 'Pedido cancelado.',
      content: jsonContent(loanSchema),
    },
    401: noSession,
    403: notStudent,
    404: loanNotFound,
    409: error(
      'O pedido não está aguardando retirada (`loan_not_cancellable`).',
    ),
  },
})

registry.registerPath({
  method: 'post',
  path: '/loans/{loanId}/renew',
  tags: ['Empréstimos (aluno)'],
  summary: 'Renova um empréstimo',
  description:
    'Uma única vez, por +14 dias a partir do vencimento atual, no fechamento da biblioteca (se o dia cair em domingo, feriado ou recesso, vai para o próximo dia em que a biblioteca abre). Negada com o motivo no `code`: `overdue` (o vencimento já passou), `has_queue` (há gente na fila do livro) ou `already_renewed` (a renovação já foi usada).',
  security,
  request: { params: loanParamsSchema },
  responses: {
    200: {
      description: 'Empréstimo renovado, com o novo vencimento.',
      content: jsonContent(loanSchema),
    },
    401: noSession,
    403: notStudent,
    404: loanNotFound,
    409: error(
      'Renovação negada (`overdue`, `has_queue` ou `already_renewed`) ou o empréstimo não está ativo (`loan_not_active`).',
    ),
  },
})
