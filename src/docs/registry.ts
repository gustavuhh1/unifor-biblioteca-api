import {
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi'
import { z, type ZodType } from 'zod'

// Acrescenta `.openapi()` aos schemas do Zod. Importe este arquivo antes de
// montar os schemas que o usam.
extendZodWithOpenApi(z)

// Registro do Swagger: toda rota é documentada aqui, a partir dos mesmos
// schemas do Zod que a validam.
export const registry = new OpenAPIRegistry()

// Conteúdo JSON de uma resposta ou corpo documentado no Swagger.
export const jsonContent = (schema: ZodType) => ({
  'application/json': { schema },
})

// Corpo JSON obrigatório de uma requisição documentada no Swagger.
export const jsonBody = (schema: ZodType) => ({
  required: true,
  content: jsonContent(schema),
})

// Esquema de segurança das rotas com sessão: o ID token do Firebase vai no
// cabeçalho Authorization.
export const bearerAuth = registry.registerComponent(
  'securitySchemes',
  'bearerAuth',
  {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'Firebase ID token',
    description:
      'ID token do Firebase Authentication, no cabeçalho `Authorization: Bearer <token>`.',
  },
)

// Esquema de segurança das rotinas agendadas: o token OIDC que o Cloud Scheduler
// assina com a conta de serviço dele (não é o token de um aluno nem de um
// bibliotecário).
export const schedulerAuth = registry.registerComponent(
  'securitySchemes',
  'schedulerOidc',
  {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'Google OIDC ID token',
    description:
      'Token OIDC do Google, no cabeçalho `Authorization: Bearer <token>`, emitido para a conta de serviço do Cloud Scheduler com a audiência `https://api.uni-books.app`.',
  },
)
