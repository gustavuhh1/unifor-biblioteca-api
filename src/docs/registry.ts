import {
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

// Acrescenta `.openapi()` aos schemas do Zod. Importe este arquivo antes de
// montar os schemas que o usam.
extendZodWithOpenApi(z)

// Registro do Swagger: toda rota é documentada aqui, a partir dos mesmos
// schemas do Zod que a validam.
export const registry = new OpenAPIRegistry()

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
