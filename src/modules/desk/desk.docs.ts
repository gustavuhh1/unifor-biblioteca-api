import { bearerAuth, jsonContent, registry } from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import {
  deskLoanParamsSchema,
  pickupsQuerySchema,
  returnBodySchema,
  studentLookupQuerySchema,
} from './schemas/request.schemas.js'
import {
  dashboardResponseSchema,
  pickupResponseSchema,
  pickupsResponseSchema,
  returnResponseSchema,
  studentLookupResponseSchema,
} from './schemas/response.schemas.js'

const error = (description: string) => ({
  description,
  content: jsonContent(errorResponseSchema),
})
const security = [{ [bearerAuth.name]: [] }]
const common = {
  401: error('Sem sessão ou sessão expirada (`unauthorized`).'),
  403: error('Apenas bibliotecários podem usar esta rota (`forbidden`).'),
}

registry.registerPath({
  method: 'get',
  path: '/librarian/dashboard',
  tags: ['Balcão'],
  summary: 'Resumo operacional do balcão',
  security,
  responses: {
    200: {
      description: 'Contadores atuais.',
      content: jsonContent(dashboardResponseSchema),
    },
    ...common,
  },
})

registry.registerPath({
  method: 'get',
  path: '/librarian/pickups',
  tags: ['Balcão'],
  summary: 'Pedidos aguardando retirada',
  description:
    'Lista única ordenada pelo prazo, com filtro opcional pela matrícula.',
  security,
  request: { query: pickupsQuerySchema },
  responses: {
    200: {
      description: 'Retiradas pendentes.',
      content: jsonContent(pickupsResponseSchema),
    },
    400: error('Filtro inválido (`validation_error`).'),
    ...common,
  },
})

registry.registerPath({
  method: 'get',
  path: '/librarian/students/lookup',
  tags: ['Balcão'],
  summary: 'Abre a ficha do aluno',
  description: 'Aceita matrícula, código RET-#### ou o token lido do QR.',
  security,
  request: { query: studentLookupQuerySchema },
  responses: {
    200: {
      description: 'Ficha e circulação em andamento.',
      content: jsonContent(studentLookupResponseSchema),
    },
    400: error('Identificador inválido (`validation_error`).'),
    404: error('Aluno não encontrado (`student_not_found`).'),
    ...common,
  },
})

registry.registerPath({
  method: 'post',
  path: '/librarian/loans/{loanId}/pickup',
  tags: ['Balcão'],
  summary: 'Registra a retirada',
  description:
    'Ativa o empréstimo, calcula o vencimento no fechamento, atualiza o exemplar e registra auditoria.',
  security,
  request: { params: deskLoanParamsSchema },
  responses: {
    200: {
      description: 'Empréstimo ativado.',
      content: jsonContent(pickupResponseSchema),
    },
    404: error('Pedido não encontrado (`loan_not_found`).'),
    409: error(
      'Pedido expirado, em estado errado, aluno atrasado ou dados inconsistentes.',
    ),
    ...common,
  },
})

registry.registerPath({
  method: 'post',
  path: '/librarian/loans/{loanId}/return',
  tags: ['Balcão'],
  summary: 'Registra a devolução',
  description:
    'Fecha o empréstimo, libera o exemplar para a fila ou estante, congela a multa e pode marcá-la como paga na hora.',
  security,
  request: {
    params: deskLoanParamsSchema,
    body: { required: false, content: jsonContent(returnBodySchema) },
  },
  responses: {
    200: {
      description: 'Devolução registrada.',
      content: jsonContent(returnResponseSchema),
    },
    404: error('Empréstimo não encontrado (`loan_not_found`).'),
    409: error('Empréstimo em estado errado ou dados inconsistentes.'),
    ...common,
  },
})
