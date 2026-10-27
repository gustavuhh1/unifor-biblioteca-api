import { describe, expect, it } from 'vitest'
import { buildOpenApiDocument } from './openapi.js'

describe('documento OpenAPI (buildOpenApiDocument)', () => {
  const document = buildOpenApiDocument()

  it('documenta GET /health', () => {
    expect(document.openapi).toBe('3.1.0')
    expect(document.paths?.['/health']?.get?.summary).toBeTruthy()
  })

  it('lista api.uni-books.app como servidor, em primeiro só em produção', () => {
    const urls = (nodeEnv: string) =>
      buildOpenApiDocument(nodeEnv).servers?.map((server) => server.url)

    expect(urls('production')).toEqual([
      'https://api.uni-books.app',
      'http://localhost:8080',
    ])
    expect(urls('development')).toEqual([
      'http://localhost:8080',
      'https://api.uni-books.app',
    ])
  })

  it('documenta exatamente todas as rotas implementadas', () => {
    const operations = Object.entries(document.paths ?? {}).flatMap(
      ([path, item]) =>
        ['get', 'post', 'put', 'patch', 'delete']
          .filter((method) => item && method in item)
          .map((method) => `${method.toUpperCase()} ${path}`),
    )

    expect(operations.sort()).toEqual(
      [
        'GET /health',
        'GET /library/info',
        'GET /me/recommendations',
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
        'GET /librarian/books/isbn/{isbn}',
        'POST /librarian/books',
        'PATCH /librarian/books/{bookId}',
        'POST /librarian/books/{bookId}/sync',
        'DELETE /librarian/books/{bookId}',
        'POST /loans',
        'GET /me/loans',
        'POST /loans/{loanId}/cancel',
        'POST /loans/{loanId}/renew',
        'GET /books/{bookId}/queue/preview',
        'POST /queues',
        'GET /me/queues',
        'POST /queues/{entryId}/leave',
        'POST /queues/{entryId}/confirm',
        'GET /librarian/books/{bookId}/queue',
        'POST /librarian/books/{bookId}/queue',
        'PATCH /librarian/queues/{entryId}/position',
        'POST /librarian/queues/{entryId}/resend',
        'POST /librarian/queues/{entryId}/remove',
        'GET /me/fines',
        'GET /librarian/fines',
        'POST /librarian/fines/{fineId}/pay',
        'POST /librarian/desk/lookup',
        'POST /librarian/loans/{loanId}/pickup',
        'POST /librarian/loans/{loanId}/return',
        'GET /librarian/pickups',
        'GET /librarian/desk/summary',
        'GET /me/saved',
        'PUT /me/saved/{bookId}',
        'DELETE /me/saved/{bookId}',
        'GET /me/folders',
        'POST /me/folders',
        'PATCH /me/folders/{folderId}',
        'DELETE /me/folders/{folderId}',
        'PUT /me/folders/{folderId}/books/{bookId}',
        'DELETE /me/folders/{folderId}/books/{bookId}',
        'GET /me/notifications',
        'POST /me/notifications/read-all',
        'PATCH /me/notification-prefs',
        'PUT /me/devices/{deviceId}',
        'DELETE /me/devices/{deviceId}',
        'GET /me/assistant/messages',
        'POST /me/assistant/messages',
        'POST /me/assistant/actions/{actionId}/confirm',
        'POST /me/assistant/actions/{actionId}/cancel',
        'POST /jobs/{job}',
      ].sort(),
    )
  })

  it('documenta as regras para os dois perfis e as recomendações só para o aluno', () => {
    const library = document.paths?.['/library/info']?.get
    const recommendations = document.paths?.['/me/recommendations']?.get
    for (const operation of [library, recommendations]) {
      expect(operation?.security).toEqual([{ bearerAuth: [] }])
      expect(operation?.responses?.['200']).toBeDefined()
      expect(operation?.responses?.['401']).toBeDefined()
    }
    expect(library?.responses?.['403']).toBeUndefined()
    expect(recommendations?.responses?.['403']).toBeDefined()
    expect(document.components?.schemas?.LibraryInfo).toMatchObject({
      required: expect.arrayContaining([
        'openingHours',
        'contact',
        'officialRulesUrl',
        'fineCentsPerBusinessDay',
      ]),
    })
    expect(document.components?.schemas?.RecommendationsResponse).toMatchObject(
      {
        properties: {
          reasonText: { type: ['string', 'null'] },
          items: { maxItems: 6 },
        },
        required: ['reasonText', 'items', 'generatedAt', 'validUntil'],
      },
    )
  })

  it('documenta 401 nas rotas do acervo e 403 nas do bibliotecário', () => {
    const paths = document.paths ?? {}
    const catalogRoutes = [
      paths['/books']?.get,
      paths['/books/{bookId}']?.get,
      paths['/librarian/books']?.get,
      paths['/librarian/books/isbn/{isbn}']?.get,
      paths['/librarian/books']?.post,
      paths['/librarian/books/{bookId}']?.patch,
      paths['/librarian/books/{bookId}/sync']?.post,
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

  it('documenta as rotas do balcão com sessão, perfil do bibliotecário e sem o qrToken nas respostas', () => {
    const paths = document.paths ?? {}
    const deskRoutes = [
      paths['/librarian/desk/lookup']?.post,
      paths['/librarian/loans/{loanId}/pickup']?.post,
      paths['/librarian/loans/{loanId}/return']?.post,
      paths['/librarian/pickups']?.get,
      paths['/librarian/desk/summary']?.get,
    ]

    for (const operation of deskRoutes) {
      expect(operation?.security).toEqual([{ bearerAuth: [] }])
      expect(operation?.responses?.['401']).toBeDefined()
      expect(operation?.responses?.['403']).toBeDefined()
    }
    expect(
      paths['/librarian/loans/{loanId}/pickup']?.post?.responses?.['409'],
    ).toBeDefined()
    expect(
      paths['/librarian/loans/{loanId}/return']?.post?.responses?.['409'],
    ).toBeDefined()
    // O segredo do QR só entra no corpo da ficha (nunca nas respostas do balcão).
    for (const name of [
      'DeskLoan',
      'DeskLookupResponse',
      'PickupResponse',
      'ReturnResponse',
      'PickupItem',
      'PickupsResponse',
    ]) {
      expect(
        JSON.stringify(document.components?.schemas?.[name]),
        name,
      ).not.toContain('qrToken')
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
      paths['/librarian/books/isbn/{isbn}']?.get?.responses?.['502'],
    ).toBeDefined()
    expect(
      paths['/librarian/books/{bookId}/sync']?.post?.responses?.['502'],
    ).toBeDefined()
  })

  it('documenta as rotas de empréstimo com sessão, perfil do aluno e as recusas', () => {
    const paths = document.paths ?? {}
    const loanRoutes = [
      paths['/loans']?.post,
      paths['/me/loans']?.get,
      paths['/loans/{loanId}/cancel']?.post,
      paths['/loans/{loanId}/renew']?.post,
    ]

    for (const operation of loanRoutes) {
      expect(operation?.security).toEqual([{ bearerAuth: [] }])
      expect(operation?.responses?.['401']).toBeDefined()
      expect(operation?.responses?.['403']).toBeDefined()
    }
    expect(paths['/loans']?.post?.responses?.['409']).toBeDefined()
    expect(paths['/loans']?.post?.responses?.['201']).toBeDefined()
    expect(
      paths['/loans/{loanId}/cancel']?.post?.responses?.['404'],
    ).toBeDefined()
    expect(
      paths['/loans/{loanId}/renew']?.post?.responses?.['409'],
    ).toBeDefined()
    expect(document.components?.schemas?.Loan).toMatchObject({
      type: 'object',
    })
  })

  it('documenta as rotas de fila e de multa com sessão e o perfil certo', () => {
    const paths = document.paths ?? {}
    const studentRoutes = [
      paths['/books/{bookId}/queue/preview']?.get,
      paths['/queues']?.post,
      paths['/me/queues']?.get,
      paths['/queues/{entryId}/leave']?.post,
      paths['/queues/{entryId}/confirm']?.post,
      paths['/me/fines']?.get,
    ]
    const librarianRoutes = [
      paths['/librarian/books/{bookId}/queue']?.get,
      paths['/librarian/books/{bookId}/queue']?.post,
      paths['/librarian/queues/{entryId}/position']?.patch,
      paths['/librarian/queues/{entryId}/resend']?.post,
      paths['/librarian/queues/{entryId}/remove']?.post,
      paths['/librarian/fines']?.get,
      paths['/librarian/fines/{fineId}/pay']?.post,
    ]

    for (const operation of [...studentRoutes, ...librarianRoutes]) {
      expect(operation?.security).toEqual([{ bearerAuth: [] }])
      expect(operation?.responses?.['401']).toBeDefined()
      expect(operation?.responses?.['403']).toBeDefined()
    }
  })

  it('documenta as rotas de Salvos só para o aluno, com a pasta e o livro que faltam (RF-SAL-01 a RF-SAL-03)', () => {
    const paths = document.paths ?? {}
    const routes = [
      paths['/me/saved']?.get,
      paths['/me/saved/{bookId}']?.put,
      paths['/me/saved/{bookId}']?.delete,
      paths['/me/folders']?.get,
      paths['/me/folders']?.post,
      paths['/me/folders/{folderId}']?.patch,
      paths['/me/folders/{folderId}']?.delete,
      paths['/me/folders/{folderId}/books/{bookId}']?.put,
      paths['/me/folders/{folderId}/books/{bookId}']?.delete,
    ]

    for (const operation of routes) {
      expect(operation?.security).toEqual([{ bearerAuth: [] }])
      expect(operation?.responses?.['401']).toBeDefined()
      expect(operation?.responses?.['403']).toBeDefined()
    }
    expect(paths['/me/saved/{bookId}']?.put?.responses?.['404']).toBeDefined()
    expect(
      paths['/me/folders/{folderId}/books/{bookId}']?.put?.responses?.['409'],
    ).toBeDefined()
    expect(paths['/me/folders']?.post?.responses?.['400']).toBeDefined()
  })

  it('documenta as rotas de avisos só para o aluno, sem rota para enviar push ou e-mail (RF-AVI-01 a RF-AVI-03)', () => {
    const paths = document.paths ?? {}
    const routes = [
      paths['/me/notifications']?.get,
      paths['/me/notifications/read-all']?.post,
      paths['/me/notification-prefs']?.patch,
      paths['/me/devices/{deviceId}']?.put,
      paths['/me/devices/{deviceId}']?.delete,
    ]

    for (const operation of routes) {
      expect(operation?.security).toEqual([{ bearerAuth: [] }])
      expect(operation?.responses?.['401']).toBeDefined()
      expect(operation?.responses?.['403']).toBeDefined()
    }
    expect(
      paths['/me/notification-prefs']?.patch?.responses?.['400'],
    ).toBeDefined()
    expect(
      paths['/me/devices/{deviceId}']?.put?.responses?.['400'],
    ).toBeDefined()
    expect(
      Object.keys(paths).filter((path) =>
        /\/(push|send|email)(\/|$)/i.test(path),
      ),
    ).toEqual([])
  })

  it('documenta a rota das rotinas só com o token do Cloud Scheduler, sem a sessão do app (RF-SIS-05)', () => {
    const operation = document.paths?.['/jobs/{job}']?.post

    expect(operation?.security).toEqual([{ schedulerOidc: [] }])
    expect(operation?.responses?.['401']).toBeDefined()
    expect(operation?.responses?.['403']).toBeDefined()
    expect(operation?.responses?.['500']).toBeDefined()
    const parameter = (operation?.parameters ?? []).find(
      (item) => 'name' in item && item.name === 'job',
    )
    expect(JSON.stringify(parameter)).toContain('accrue_fines')
    expect(JSON.stringify(document.components?.securitySchemes)).toContain(
      'schedulerOidc',
    )
  })

  it('não documenta nenhuma rota de pagamento de multa para o aluno (RF-MUL-03)', () => {
    const payRoutes = Object.keys(document.paths ?? {}).filter((path) =>
      path.includes('/pay'),
    )

    expect(payRoutes).toEqual(['/librarian/fines/{fineId}/pay'])
  })

  it('documenta a confirmação de quem passa à frente na fila (RF-BAL-07)', () => {
    const schemas = document.components?.schemas ?? {}

    expect(schemas.MoveEntryBody).toMatchObject({
      properties: {
        position: { type: 'integer' },
        confirmed: { type: 'boolean' },
      },
    })
    expect(schemas.QueueChangeResponse).toMatchObject({
      required: expect.arrayContaining(['applied', 'movedDown', 'queue']),
    })
    expect(schemas.RemoveFromQueueBody).toMatchObject({
      required: ['reason'],
    })
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
