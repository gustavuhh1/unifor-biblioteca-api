import { bearerAuth, jsonContent, registry } from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import { recommendationsResponseSchema } from './schemas/response.schemas.js'

// Swagger de Recomendados para você, exclusivo do aluno (RF-ASS-03).
registry.registerPath({
  method: 'get',
  path: '/me/recommendations',
  tags: ['Recomendados (aluno)'],
  summary: 'Recomendados para você pelo histórico de leitura',
  description:
    'Até 6 livros ativos e abertos a novos pedidos, parecidos por assunto ou autor com os livros devolvidos. Exclui obras que o aluno já pegou em qualquer situação. Cada item explica qual leitura motivou a sugestão. O motivo geral indica o assunto mais frequente. A escolha fica em cache por 24 horas; durante a validade, a API mantém a ordem e não repõe livros removidos, fechados a pedidos ou pegos depois. Sem livro devolvido, items fica vazio e reasonText é null. Não usa Gemini (RF-ASS-03).',
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: {
      description: 'Sugestões e datas do cache, em UTC.',
      content: jsonContent(recommendationsResponseSchema),
    },
    401: {
      description: 'Sem sessão ou sessão expirada.',
      content: jsonContent(errorResponseSchema),
    },
    403: {
      description: 'Perfil errado: só o aluno usa esta rota.',
      content: jsonContent(errorResponseSchema),
    },
  },
})
