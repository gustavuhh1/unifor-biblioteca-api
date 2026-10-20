import { describe, expect, it } from 'vitest'
import { buildOpenApiDocument } from './openapi.js'

describe('documento OpenAPI (buildOpenApiDocument)', () => {
  const document = buildOpenApiDocument()

  it('documenta GET /health', () => {
    expect(document.openapi).toBe('3.1.0')
    expect(document.paths?.['/health']?.get?.summary).toBeTruthy()
  })

  it('documenta todas as rotas do módulo de acesso', () => {
    const operations = Object.entries(document.paths ?? {}).flatMap(
      ([path, item]) =>
        ['get', 'post', 'patch', 'delete']
          .filter((method) => item && method in item)
          .map((method) => `${method.toUpperCase()} ${path}`),
    )

    expect(operations.sort()).toEqual(
      [
        'GET /health',
        'POST /auth/signup/start',
        'POST /auth/signup/confirm',
        'POST /auth/signup/resend',
        'POST /auth/password/recover',
        'POST /auth/password/reset',
        'POST /auth/passkey/register',
        'POST /auth/passkey/login/options',
        'POST /auth/passkey/login/verify',
        'GET /auth/passkeys',
        'POST /auth/passkeys',
        'DELETE /auth/passkeys/{id}',
        'GET /me',
        'PATCH /me',
        'POST /auth/logout',
      ].sort(),
    )
  })

  it('pede o ID token do Firebase só nas rotas com sessão', () => {
    const paths = document.paths ?? {}

    expect(paths['/me']?.get?.security).toEqual([{ bearerAuth: [] }])
    expect(paths['/auth/logout']?.post?.security).toEqual([{ bearerAuth: [] }])
    expect(paths['/auth/signup/start']?.post?.security).toBeUndefined()
    expect(paths['/auth/passkey/login/verify']?.post?.security).toBeUndefined()
    expect(document.components?.securitySchemes?.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    })
  })

  it('monta a resposta do health a partir do schema do Zod', () => {
    expect(document.components?.schemas?.HealthResponse).toMatchObject({
      type: 'object',
      properties: { status: { type: 'string', enum: ['ok'] } },
    })
  })
})
