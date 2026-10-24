import { bearerAuth, jsonContent, registry } from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import {
  fineParamsSchema,
  librarianFinesQuerySchema,
} from './schemas/request.schemas.js'
import {
  librarianFineSchema,
  librarianFinesResponseSchema,
  myFinesResponseSchema,
} from './schemas/response.schemas.js'

// Swagger das rotas de multa do aluno (RF-MUL-03, RF-MUL-04) e da aba Multas do
// bibliotecário (RF-BAL-09). O cálculo (RF-MUL-01) e o congelamento na devolução
// (RF-MUL-02) não têm rota própria: a devolução do balcão os dispara. Fica pronto
// antes do código das rotas.

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

registry.registerPath({
  method: 'get',
  path: '/me/fines',
  tags: ['Multas (aluno)'],
  summary: 'Minhas multas',
  description:
    'Lista as multas do aluno: **valor, dias úteis de atraso e livro** de cada uma. A multa `accruing` (livro ainda não devolvido) tem os dias e o valor calculados na hora, a R$ 2,00 por dia útil (fim de semana, feriado e recesso não contam); depois da devolução (`open`) o valor fica congelado até o pagamento no balcão. **O app não paga multa:** não há rota de pagamento para o aluno. `openTotalCents` soma as multas em aberto, e `blocksNewLoans` só é `true` com empréstimo atrasado: multa em aberto sem atraso só avisa (RF-MUL-04). Valores em centavos.',
  security,
  responses: {
    200: {
      description: 'As multas do aluno, as mais recentes primeiro.',
      content: jsonContent(myFinesResponseSchema),
    },
    401: noSession,
    403: notStudent,
  },
})

registry.registerPath({
  method: 'get',
  path: '/librarian/fines',
  tags: ['Multas (bibliotecário)'],
  summary: 'Aba Multas: Em aberto, Contando e Pagas',
  description:
    'Lista as multas da aba escolhida (`status`: `open` padrão, `accruing` ou `paid`), com busca opcional por **nome** (parte do nome, sem acento nem maiúsculas) ou **matrícula** (inteira) em `q`. Na aba Contando, os dias úteis e o valor são calculados na hora. Sem outros filtros (RF-BAL-09).',
  security,
  request: { query: librarianFinesQuerySchema },
  responses: {
    200: {
      description: 'As multas da aba.',
      content: jsonContent(librarianFinesResponseSchema),
    },
    400: invalidData,
    401: noSession,
    403: notLibrarian,
  },
})

registry.registerPath({
  method: 'post',
  path: '/librarian/fines/{fineId}/pay',
  tags: ['Multas (bibliotecário)'],
  summary: 'Registra o pagamento de uma multa em aberto',
  description:
    'O pagamento é feito **no balcão** e só o bibliotecário o registra. Só vale para multa `open` (livro já devolvido): ela vira `paid`, com `paidAt`, `receivedBy` e `receivedByName`, o `openFineTotalCents` do aluno cai o valor da multa e a ação vai para o `auditLog` (`fine_paid`). Multa `accruing` é recusada (`fine_not_payable`): o livro ainda não voltou. Multa já paga é recusada (`fine_already_paid`).',
  security,
  request: { params: fineParamsSchema },
  responses: {
    200: {
      description: 'A multa paga.',
      content: jsonContent(librarianFineSchema),
    },
    401: noSession,
    403: notLibrarian,
    404: error('A multa não existe (`fine_not_found`).'),
    409: error(
      'A multa ainda está contando (`fine_not_payable`) ou já foi paga (`fine_already_paid`).',
    ),
  },
})
