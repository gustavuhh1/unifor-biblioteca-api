import { bearerAuth, jsonContent, registry } from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import { libraryInfoSchema } from './schemas/response.schemas.js'

// Swagger de Regras da biblioteca, para aluno e bibliotecário (RF-PER-02).
registry.registerPath({
  method: 'get',
  path: '/library/info',
  tags: ['Biblioteca'],
  summary: 'Regras, horários e contatos da biblioteca',
  description:
    'Lê settings/library, com os padrões oficiais para campos ausentes ou inválidos. Horários por dia, null quando fechado; multa em centavos. Acessível a aluno e bibliotecário com sessão (RF-PER-02).',
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: {
      description: 'Regras e contatos atuais.',
      content: jsonContent(libraryInfoSchema),
    },
    401: {
      description: 'Sem sessão ou sessão expirada.',
      content: jsonContent(errorResponseSchema),
    },
  },
})
