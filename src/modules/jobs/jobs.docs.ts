import { jsonContent, registry } from '../../docs/registry.js'
import { errorResponseSchema } from '../../shared/error-response.js'
import { jobParamsSchema } from './schemas/request.schemas.js'
import { jobResponseSchema } from './schemas/response.schemas.js'

const schedulerOidc = registry.registerComponent(
  'securitySchemes',
  'schedulerOidc',
  {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'Google OIDC ID token',
    description: 'Token OIDC da conta de serviço exclusiva do Cloud Scheduler.',
  },
)

registry.registerPath({
  method: 'post',
  path: '/internal/jobs/{job}',
  tags: ['Sistema'],
  summary: 'Executa uma rotina agendada',
  description:
    'Uso interno do Cloud Scheduler. Registra cada execução em `jobRuns`; as rotinas são idempotentes e conferem cada documento novamente em transação.',
  security: [{ [schedulerOidc.name]: [] }],
  request: { params: jobParamsSchema },
  responses: {
    200: {
      description: 'Rotina concluída.',
      content: jsonContent(jobResponseSchema),
    },
    400: {
      description: 'Nome de rotina inválido (`validation_error`).',
      content: jsonContent(errorResponseSchema),
    },
    401: {
      description: 'Token OIDC ausente ou inválido (`unauthorized`).',
      content: jsonContent(errorResponseSchema),
    },
  },
})
