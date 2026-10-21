import { describe, expect, it } from 'vitest'
import { buildOpenApiDocument } from './openapi.js'

describe('documento OpenAPI (buildOpenApiDocument)', () => {
  const document = buildOpenApiDocument()

  it('documenta GET /health', () => {
    expect(document.openapi).toBe('3.1.0')
    expect(document.paths?.['/health']?.get?.summary).toBeTruthy()
  })

  it('documenta todas as rotas dos módulos de acesso e do acervo', () => {
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
        'GET /books',
        'GET /books/{bookId}',
        'GET /librarian/books',
        'GET /librarian/google-books/{isbn}',
        'POST /librarian/books',
        'PATCH /librarian/books/{bookId}',
        'POST /librarian/books/{bookId}/sync-google',
        'DELETE /librarian/books/{bookId}',
      ].sort(),
    )
  })

  it('documenta 401 nas rotas do acervo e 403 nas do bibliotecário', () => {
    const paths = document.paths ?? {}
    const catalogRoutes = [
      paths['/books']?.get,
      paths['/books/{bookId}']?.get,
      paths['/librarian/books']?.get,
      paths['/librarian/google-books/{isbn}']?.get,
      paths['/librarian/books']?.post,
      paths['/librarian/books/{bookId}']?.patch,
      paths['/librarian/books/{bookId}/sync-google']?.post,
      paths['/librarian/books/{bookId}']?.delete,
    ]

    for (const operation of catalogRoutes) {
      expect(operation?.security).toEqual([{ bearerAuth: [] }])
      expect(operation?.responses?.['401']).toBeDefined()
    }
    for (const operation of catalogRoutes.slice(2)) {
      expect(operation?.responses?.['403']).toBeDefined()
    }
  })

  it('documenta 404, 409 e 502 do acervo onde se aplicam', () => {
    const paths = document.paths ?? {}

    expect(paths['/books/{bookId}']?.get?.responses?.['404']).toBeDefined()
    expect(
      paths['/librarian/books/{bookId}']?.patch?.responses?.['404'],
    ).toBeDefined()
    expect(
      paths['/librarian/books/{bookId}']?.delete?.responses?.['404'],
    ).toBeDefined()
    expect(paths['/librarian/books']?.post?.responses?.['409']).toBeDefined()
    expect(
      paths['/librarian/books/{bookId}']?.delete?.responses?.['409'],
    ).toBeDefined()
    expect(
      paths['/librarian/google-books/{isbn}']?.get?.responses?.['502'],
    ).toBeDefined()
    expect(
      paths['/librarian/books/{bookId}/sync-google']?.post?.responses?.['502'],
    ).toBeDefined()
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
